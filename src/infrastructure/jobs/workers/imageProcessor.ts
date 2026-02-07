// Environment variables loaded by worker.ts entry point
import { Worker, Job } from "bullmq";
import path from "path";
import IORedis from "ioredis";
import sharp from "sharp";
import { env } from "@/infrastructure/config/env";
import {
  generateDerivatives,
  generateBlurPlaceholder,
} from "@/infrastructure/services/imageService";
import { extractExifData } from "@/infrastructure/services/exifService";
import { SQLitePhotoRepository } from "@/infrastructure/database/repositories/SQLitePhotoRepository";
import { ImageJobData, ImageJobResult } from "../queues";

/**
 * Redis connection configured for BullMQ worker
 * - maxRetriesPerRequest: null required by BullMQ
 */
const connection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

/**
 * Disable Sharp cache for long-running worker
 * Prevents memory buildup when processing many images
 */
sharp.cache(false);

/**
 * BullMQ worker for processing image jobs
 *
 * Responsibilities:
 * - Picks up jobs from the "image-processing" queue
 * - Generates derivative images using imageService
 * - Reports progress during processing
 * - Handles errors gracefully
 *
 * Configuration:
 * - Concurrency limited to 2 (50MP images use ~144MB each)
 */
export const imageWorker = new Worker<ImageJobData, ImageJobResult>(
  "image-processing",
  async (job: Job<ImageJobData>) => {
    const { photoId, originalPath } = job.data;
    const outputDir = path.join(env.STORAGE_PATH, "processed", photoId);

    console.log(`[ImageWorker] Processing job ${job.id} for photo ${photoId}`);

    // Update progress - starting
    await job.updateProgress(10);

    // Generate all derivatives (WebP + AVIF at each size)
    const derivatives = await generateDerivatives(originalPath, outputDir);

    // Update progress - derivatives done
    await job.updateProgress(80);

    // Get post-rotation dimensions for accurate srcSet
    const rotatedMeta = await sharp(originalPath).rotate().metadata();
    const width = rotatedMeta.width!;
    const height = rotatedMeta.height!;

    // Extract EXIF metadata from original image
    const exifData = await extractExifData(originalPath);

    // Update progress - EXIF done
    await job.updateProgress(90);

    // Generate blur placeholder from original image
    const blurDataUrl = await generateBlurPlaceholder(originalPath);

    // Update progress - complete
    await job.updateProgress(100);

    console.log(
      `[ImageWorker] Generated ${derivatives.length} files + blur placeholder + EXIF + dimensions (${width}x${height}) for photo ${photoId}`,
    );

    return { photoId, derivatives, blurDataUrl, exifData, width, height };
  },
  {
    connection,
    concurrency: 2, // Limit concurrent jobs (50MP images use ~144MB each)
  },
);

// Error handlers - CRITICAL: worker fails silently without these

imageWorker.on("error", (err) => {
  console.error("[ImageWorker] Error:", err);
});

imageWorker.on("failed", async (job, err) => {
  console.error(`[ImageWorker] Job ${job?.id} failed:`, err.message);
  if (job?.data.photoId) {
    const repository = new SQLitePhotoRepository();
    const photo = await repository.findById(job.data.photoId);
    if (photo) {
      photo.status = "error";
      await repository.save(photo);
    }
  }
});

imageWorker.on("completed", async (job, result) => {
  console.log(
    `[ImageWorker] Job ${job.id} completed: ${result.derivatives.length} files`,
  );
  try {
    console.log(
      `[ImageWorker] Updating photo ${result.photoId} status to 'ready'`,
    );
    const repository = new SQLitePhotoRepository();
    const photo = await repository.findById(result.photoId);
    console.log(`[ImageWorker] Found photo:`, photo);
    if (photo) {
      photo.status = "ready";
      photo.blurDataUrl = result.blurDataUrl;
      photo.exifData = result.exifData;
      photo.width = result.width;
      photo.height = result.height;
      await repository.save(photo);
      console.log(
        `[ImageWorker] Successfully updated photo ${result.photoId} to 'ready' with blur placeholder, EXIF, and dimensions`,
      );
    } else {
      console.error(`[ImageWorker] Photo not found: ${result.photoId}`);
    }
  } catch (err) {
    console.error(`[ImageWorker] Error updating status:`, err);
  }
});
