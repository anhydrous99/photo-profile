import { Worker, Job } from "bullmq";
import path from "path";
import fs from "fs/promises";
import IORedis from "ioredis";
import sharp from "sharp";
import { env } from "@/infrastructure/config/env";
import { logger } from "@/infrastructure/logging/logger";
import {
  generateDerivatives,
  generateBlurPlaceholder,
} from "@/infrastructure/services/imageService";
import { extractExifData } from "@/infrastructure/services/exifService";
import { DynamoDBPhotoRepository } from "@/infrastructure/database/dynamodb/repositories";
import { getStorageAdapter } from "@/infrastructure/storage";
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
      logger.error(`DB update retry ${i + 1}/${attempts}`, {
        component: "image-worker",
        error:
          err instanceof Error
            ? { message: err.message, stack: err.stack }
            : err,
      });
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
    const { photoId, originalKey } = job.data;
    const tempDir = `/tmp/photo-worker-${photoId}-${job.attemptsMade}`;
    const originalFilename = path.basename(originalKey);
    const tempOriginalPath = path.join(tempDir, originalFilename);

    logger.info(`Processing job ${job.id} for photo ${photoId}`, {
      component: "image-worker",
      jobId: job.id,
      photoId,
    });

    try {
      await fs.mkdir(tempDir, { recursive: true });

      const adapter = getStorageAdapter();
      const originalBuffer = await adapter.getFile(originalKey);
      await fs.writeFile(tempOriginalPath, originalBuffer);

      await job.updateProgress(10);

      const derivatives = await generateDerivatives(tempOriginalPath, tempDir);

      await job.updateProgress(80);

      const rotatedMeta = await sharp(tempOriginalPath).rotate().metadata();
      const width = rotatedMeta.width!;
      const height = rotatedMeta.height!;

      const exifData = await extractExifData(tempOriginalPath);

      await job.updateProgress(90);

      const blurDataUrl = await generateBlurPlaceholder(tempOriginalPath);

      const CONTENT_TYPES: Record<string, string> = {
        ".webp": "image/webp",
        ".avif": "image/avif",
      };

      const entries = await fs.readdir(tempDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (entry.name.startsWith("original")) continue;

        const ext = path.extname(entry.name);
        const contentType = CONTENT_TYPES[ext];
        if (!contentType) continue;

        const fileBuffer = await fs.readFile(path.join(tempDir, entry.name));
        await adapter.saveFile(
          `processed/${photoId}/${entry.name}`,
          fileBuffer,
          contentType,
        );
      }

      await job.updateProgress(100);

      logger.info(
        `Generated ${derivatives.length} files + blur placeholder + EXIF + dimensions (${width}x${height}) for photo ${photoId}`,
        {
          component: "image-worker",
          photoId,
          derivativeCount: derivatives.length,
          width,
          height,
        },
      );

      const repository = new DynamoDBPhotoRepository();
      const photo = await repository.findById(photoId);
      if (photo) {
        photo.status = "ready";
        photo.blurDataUrl = blurDataUrl;
        photo.exifData = exifData;
        photo.width = width;
        photo.height = height;
        photo.updatedAt = new Date();
        await repository.save(photo);
        logger.info(`Updated photo ${photoId} to 'ready'`, {
          component: "image-worker",
          photoId,
        });
      } else {
        logger.error(`Photo not found: ${photoId}`, {
          component: "image-worker",
          photoId,
        });
      }

      return { photoId, derivatives, blurDataUrl, exifData, width, height };
    } finally {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch {
        logger.warn(`Failed to clean up temp dir: ${tempDir}`, {
          component: "image-worker",
          photoId,
        });
      }
    }
  },
  {
    connection,
    concurrency: 2, // Limit concurrent jobs (50MP images use ~144MB each)
  },
);

// Error handlers - CRITICAL: worker fails silently without these

imageWorker.on("error", (err) => {
  logger.error("Worker error", {
    component: "image-worker",
    error:
      err instanceof Error ? { message: err.message, stack: err.stack } : err,
  });
});

// Failed handler fires only after ALL BullMQ retry attempts are exhausted (final failure)
// Uses retryDbUpdate wrapper since this is outside the processor function
imageWorker.on("failed", async (job, err) => {
  logger.error(`Job ${job?.id} failed: ${err.message}`, {
    component: "image-worker",
    jobId: job?.id,
    error: { message: err.message, stack: err.stack },
  });
  if (job?.data.photoId) {
    await retryDbUpdate(async () => {
      const repository = new DynamoDBPhotoRepository();
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
  logger.info(`Job ${job.id} completed: ${result.derivatives.length} files`, {
    component: "image-worker",
    jobId: job.id,
    derivativeCount: result.derivatives.length,
  });
});
