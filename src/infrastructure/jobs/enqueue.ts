import { enqueueSQS } from "./sqsEnqueue";
import type { ImageJobData, ImageJobResult } from "./types";

export type { ImageJobData, ImageJobResult };

export async function enqueueImageProcessing(
  photoId: string,
  originalKey: string,
): Promise<string> {
  return await enqueueSQS(photoId, originalKey);
}
