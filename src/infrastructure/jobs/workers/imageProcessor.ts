import { Worker, Job } from "bullmq";
import IORedis from "ioredis";
import path from "path";
import sharp from "sharp";
import { env } from "@/infrastructure/config/env";
import { generateDerivatives } from "@/infrastructure/services/imageService";
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

    // Generate all derivatives (WebP + JPEG at each size)
    const derivatives = await generateDerivatives(originalPath, outputDir);

    // Update progress - complete
    await job.updateProgress(100);

    console.log(
      `[ImageWorker] Generated ${derivatives.length} files for photo ${photoId}`,
    );

    return { photoId, derivatives };
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

imageWorker.on("failed", (job, err) => {
  console.error(`[ImageWorker] Job ${job?.id} failed:`, err.message);
  // TODO: Update photo status to 'error' in database (Phase 4)
});

imageWorker.on("completed", (job, result) => {
  console.log(
    `[ImageWorker] Job ${job.id} completed: ${result.derivatives.length} files`,
  );
  // TODO: Update photo status to 'ready' in database (Phase 4)
});
