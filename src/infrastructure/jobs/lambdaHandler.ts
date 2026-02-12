import type {
  SQSEvent,
  SQSBatchResponse,
  SQSBatchItemFailure,
} from "aws-lambda";
import { processImageJob } from "@/infrastructure/services/imageProcessingJob";
import { DynamoDBPhotoRepository } from "@/infrastructure/database/dynamodb/repositories";
import { logger } from "@/infrastructure/logging/logger";

const photoRepository = new DynamoDBPhotoRepository();

export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
  const batchItemFailures: SQSBatchItemFailure[] = [];

  for (const record of event.Records) {
    try {
      const { photoId, originalKey } = JSON.parse(record.body);
      const result = await processImageJob({ photoId, originalKey });

      const photo = await photoRepository.findById(photoId);
      if (photo) {
        photo.status = "ready";
        photo.blurDataUrl = result.blurDataUrl;
        photo.exifData = result.exifData;
        photo.width = result.width;
        photo.height = result.height;
        photo.updatedAt = new Date();
        await photoRepository.save(photo);
      }
    } catch (error) {
      batchItemFailures.push({ itemIdentifier: record.messageId });

      try {
        const { photoId } = JSON.parse(record.body);
        const photo = await photoRepository.findById(photoId);
        if (photo) {
          photo.status = "error";
          photo.updatedAt = new Date();
          await photoRepository.save(photo);
        }
      } catch {
        /* best effort */
      }

      logger.error("Lambda image processing failed", {
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : error,
        record: record.messageId,
      });
    }
  }

  return { batchItemFailures };
}
