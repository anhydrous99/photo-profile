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
 * Retry helper for DB updates that may fail transiently.
 * Used in event handlers where BullMQ retry does not apply.
 */
async function retryDbUpdate(
  fn: () => Promise<void>,
  attempts = 3,
): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    try {
      await fn();
      return;
    } catch (err) {
      console.error(`[ImageWorker] DB update retry ${i + 1}/${attempts}:`, err);
      if (i < attempts - 1)
        await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

/**
 * BullMQ worker for processing image jobs
 *
 * Responsibilities:
 * - Picks up jobs from the "image-processing" queue
 * - Generates derivative images using imageService
 * - Updates photo status to "ready" in DB (covered by BullMQ 3-attempt retry)
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

    // Update photo status to "ready" in DB
    // This runs inside the processor function, so BullMQ's 3-attempt retry covers it
    const repository = new SQLitePhotoRepository();
    const photo = await repository.findById(photoId);
    if (photo) {
      photo.status = "ready";
      photo.blurDataUrl = blurDataUrl;
      photo.exifData = exifData;
      photo.width = width;
      photo.height = height;
      photo.updatedAt = new Date();
      await repository.save(photo);
      console.log(`[ImageWorker] Updated photo ${photoId} to 'ready'`);
    } else {
      console.error(`[ImageWorker] Photo not found: ${photoId}`);
    }

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

// Failed handler fires only after ALL BullMQ retry attempts are exhausted (final failure)
// Uses retryDbUpdate wrapper since this is outside the processor function
imageWorker.on("failed", async (job, err) => {
  console.error(`[ImageWorker] Job ${job?.id} failed:`, err.message);
  if (job?.data.photoId) {
    await retryDbUpdate(async () => {
      const repository = new SQLitePhotoRepository();
      const photo = await repository.findById(job!.data.photoId);
      if (photo) {
        photo.status = "error";
        await repository.save(photo);
      }
    });
  }
});

// Completed handler - logging only (DB update moved into processor function)
imageWorker.on("completed", async (job, result) => {
  console.log(
    `[ImageWorker] Job ${job.id} completed: ${result.derivatives.length} files`,
  );
});
