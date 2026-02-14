import type {
  SQSEvent,
  SQSBatchResponse,
  SQSBatchItemFailure,
  Context,
} from "aws-lambda";
import { processImageJob } from "@/infrastructure/services/imageProcessingJob";
import { DynamoDBPhotoRepository } from "@/infrastructure/database/dynamodb/repositories";
import { logger } from "@/infrastructure/logging/logger";

const photoRepository = new DynamoDBPhotoRepository();

export async function handler(
  event: SQSEvent,
  context: Context,
): Promise<SQSBatchResponse> {
  const batchItemFailures: SQSBatchItemFailure[] = [];

  logger.info("Lambda image processing batch started", {
    component: "lambda-image-processor",
    awsRequestId: context.awsRequestId,
    recordCount: event.Records.length,
  });

  for (const record of event.Records) {
    try {
      const { photoId, originalKey } = JSON.parse(record.body);

      logger.info("Lambda image processing record started", {
        component: "lambda-image-processor",
        awsRequestId: context.awsRequestId,
        messageId: record.messageId,
        photoId,
      });

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

      logger.info("Lambda image processing record completed", {
        component: "lambda-image-processor",
        awsRequestId: context.awsRequestId,
        messageId: record.messageId,
        photoId,
        width: result.width,
        height: result.height,
      });
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
      } catch (statusUpdateError) {
        logger.warn("Lambda failed to mark photo as error", {
          component: "lambda-image-processor",
          awsRequestId: context.awsRequestId,
          messageId: record.messageId,
          error:
            statusUpdateError instanceof Error
              ? {
                  message: statusUpdateError.message,
                  stack: statusUpdateError.stack,
                }
              : statusUpdateError,
        });
      }

      logger.error("Lambda image processing failed", {
        component: "lambda-image-processor",
        awsRequestId: context.awsRequestId,
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : error,
        messageId: record.messageId,
      });
    }
  }

  logger.info("Lambda image processing batch completed", {
    component: "lambda-image-processor",
    awsRequestId: context.awsRequestId,
    recordCount: event.Records.length,
    failedCount: batchItemFailures.length,
  });

  return { batchItemFailures };
}
