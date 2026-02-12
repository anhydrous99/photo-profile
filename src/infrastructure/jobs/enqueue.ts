import { env } from "@/infrastructure/config/env";
import type { ImageJobData, ImageJobResult } from "./queues";

export type { ImageJobData, ImageJobResult };

export async function enqueueImageProcessing(
  photoId: string,
  originalKey: string,
): Promise<string> {
  if (env.QUEUE_BACKEND === "sqs") {
    const { enqueueSQS } = await import("./sqsEnqueue");
    return enqueueSQS(photoId, originalKey);
  }

  const { enqueueImageProcessing: enqueueBullMQ } = await import("./queues");
  return enqueueBullMQ(photoId, originalKey);
}

export async function imageQueue() {
  const { imageQueue: queue } = await import("./queues");
  return queue;
}
