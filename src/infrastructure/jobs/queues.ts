import { Queue } from "bullmq";
import IORedis from "ioredis";
import { env } from "@/infrastructure/config/env";
import type { ExifData } from "@/domain/entities/Photo";

/**
 * Job data for image processing tasks
 */
export interface ImageJobData {
  photoId: string;
  originalPath: string;
}

/**
 * Result returned after successful image processing
 */
export interface ImageJobResult {
  photoId: string;
  derivatives: string[];
  blurDataUrl: string;
  exifData: ExifData | null;
}

/**
 * Redis connection configured for BullMQ
 * - maxRetriesPerRequest: null required by BullMQ
 * - enableOfflineQueue: false to fail fast if Redis unavailable
 */
const connection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableOfflineQueue: false,
});

/**
 * Queue for async image processing jobs
 *
 * Configuration:
 * - 3 retry attempts with exponential backoff (2s, 4s, 8s)
 * - Keeps last 100 completed jobs for visibility
 * - Keeps last 500 failed jobs for debugging
 */
export const imageQueue = new Queue<ImageJobData, ImageJobResult>(
  "image-processing",
  {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 2000,
      },
      removeOnComplete: {
        count: 100,
      },
      removeOnFail: {
        count: 500,
      },
    },
  },
);

/**
 * Helper to enqueue an image processing job
 *
 * @param photoId - Unique identifier for the photo
 * @param originalPath - Path to the original uploaded image
 * @returns The job ID (used to track status)
 */
export async function enqueueImageProcessing(
  photoId: string,
  originalPath: string,
): Promise<string> {
  const job = await imageQueue.add(
    "process-image",
    { photoId, originalPath },
    { jobId: `photo-${photoId}` }, // Prevent duplicate jobs for same photo
  );
  return job.id!;
}
