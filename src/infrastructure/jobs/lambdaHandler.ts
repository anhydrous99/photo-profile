import type {
  SQSEvent,
  SQSBatchResponse,
  SQSBatchItemFailure,
  Context,
} from "aws-lambda";
import { z } from "zod";
import { processImageJob } from "@/infrastructure/services/imageProcessingJob";
import { getPhotoRepository } from "@/infrastructure/database/dynamodb/repositories";
import { logger } from "@/infrastructure/logging/logger";
import { serializeError } from "@/lib/serializeError";

const JobMessageSchema = z.object({
  photoId: z.string().min(1),
  originalKey: z.string().min(1),
});

const photoRepository = getPhotoRepository();

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
      const parsed = JobMessageSchema.safeParse(JSON.parse(record.body));
      if (!parsed.success) {
        logger.error("Invalid SQS message body", {
          component: "lambda-image-processor",
          awsRequestId: context.awsRequestId,
          messageId: record.messageId,
          body: record.body,
          errors: parsed.error.flatten().fieldErrors,
        });
        continue; // Skip invalid message
      }
      const { photoId, originalKey } = parsed.data;

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
        const parsed = JobMessageSchema.safeParse(JSON.parse(record.body));
        if (parsed.success) {
          const { photoId } = parsed.data;
          const photo = await photoRepository.findById(photoId);
          if (photo) {
            photo.status = "error";
            photo.updatedAt = new Date();
            await photoRepository.save(photo);
          }
        }
      } catch (statusUpdateError) {
        logger.warn("Lambda failed to mark photo as error", {
          component: "lambda-image-processor",
          awsRequestId: context.awsRequestId,
          messageId: record.messageId,
          error: serializeError(statusUpdateError),
        });
      }

      logger.error("Lambda image processing failed", {
        component: "lambda-image-processor",
        awsRequestId: context.awsRequestId,
        error: serializeError(error),
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
