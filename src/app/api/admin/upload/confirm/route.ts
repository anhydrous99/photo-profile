import { z } from "zod";
import { NextRequest } from "next/server";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { enqueueImageProcessing } from "@/infrastructure/jobs";
import { getPhotoRepository } from "@/infrastructure/database/dynamodb/repositories";
import { s3Client } from "@/infrastructure/storage/s3Client";
import { env } from "@/infrastructure/config/env";
import type { Photo } from "@/domain/entities";
import { logger } from "@/infrastructure/logging/logger";
import { PRESIGN_MIME_TYPES, ENQUEUE_TIMEOUT_MS } from "@/lib/constants";
import { enqueueWithTimeout } from "@/lib/enqueueWithTimeout";
import { serializeError } from "@/lib/serializeError";
import {
  withAuth,
  validateBody,
  errorResponse,
  successResponse,
} from "@/lib/apiHelpers";
import { handleRoute } from "@/lib/routeHandler";

export const maxDuration = 300;

const photoRepository = getPhotoRepository();

const confirmSchema = z.object({
  photoId: z.string().uuid("Invalid photo ID"),
  key: z.string().min(1),
  originalFilename: z.string().min(1),
});

export async function POST(request: NextRequest) {
  return handleRoute("POST /api/admin/upload/confirm", async () => {
    return withAuth(async () => {
      const body = await request.json();
      const result = validateBody(confirmSchema, body);
      if (result.error) return result.error;

      const { photoId, key, originalFilename } = result.data;

      // Check for duplicate
      const existingPhoto = await photoRepository.findById(photoId);
      if (existingPhoto) {
        return successResponse({ photoId, status: existingPhoto.status }, 200);
      }

      // Verify file exists in S3
      try {
        const headResult = await s3Client.send(
          new HeadObjectCommand({
            Bucket: env.AWS_S3_BUCKET,
            Key: key,
          }),
        );

        if (headResult.ContentLength === 0) {
          return errorResponse("Uploaded file is empty", 400);
        }

        if (
          !headResult.ContentType ||
          !PRESIGN_MIME_TYPES.includes(
            headResult.ContentType as (typeof PRESIGN_MIME_TYPES)[number],
          )
        ) {
          return errorResponse(
            `Invalid file type: ${headResult.ContentType}. Allowed: JPEG, PNG, WebP, HEIC, HEIF`,
            400,
          );
        }
      } catch (error) {
        if (error instanceof Error && error.name === "NoSuchKey") {
          return errorResponse("File not found in S3", 400);
        }
        throw error;
      }

      // Create photo record
      const now = new Date();
      const photo: Photo = {
        id: photoId,
        title: null,
        description: null,
        originalFilename,
        blurDataUrl: null,
        exifData: null,
        width: null,
        height: null,
        status: "processing",
        createdAt: now,
        updatedAt: now,
      };
      await photoRepository.save(photo);

      // Enqueue processing job
      try {
        await enqueueWithTimeout(
          enqueueImageProcessing(photoId, key),
          ENQUEUE_TIMEOUT_MS,
        );
      } catch (enqueueError) {
        logger.error(`Failed to enqueue processing for photo ${photoId}`, {
          component: "upload-confirm",
          photoId,
          error: serializeError(enqueueError),
        });
      }

      return successResponse({ photoId, status: "processing" }, 201);
    });
  });
}
