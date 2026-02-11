import { Queue } from "bullmq";
import IORedis from "ioredis";
import { env } from "@/infrastructure/config/env";
import type { ExifData } from "@/domain/entities/Photo";

/**
 * Job data for image processing tasks
 */
export interface ImageJobData {
  photoId: string;
  originalKey: string;
}

/**
 * Result returned after successful image processing
 */
export interface ImageJobResult {
  photoId: string;
  derivatives: string[];
  blurDataUrl: string;
  exifData: ExifData | null;
  width: number;
  height: number;
}

let connection: IORedis | undefined;
let queue: Queue<ImageJobData, ImageJobResult> | undefined;

function getConnection(): IORedis {
  if (!connection) {
    connection = new IORedis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableOfflineQueue: false,
    });
  }
  return connection;
}

function getImageQueue(): Queue<ImageJobData, ImageJobResult> {
  if (!queue) {
    queue = new Queue<ImageJobData, ImageJobResult>("image-processing", {
      connection: getConnection(),
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
    });
  }
  return queue;
}

export { getImageQueue as imageQueue };

export async function enqueueImageProcessing(
  photoId: string,
  originalKey: string,
): Promise<string> {
  const job = await getImageQueue().add(
    "process-image",
    { photoId, originalKey },
    { jobId: `photo-${photoId}` },
  );
  return job.id!;
}
