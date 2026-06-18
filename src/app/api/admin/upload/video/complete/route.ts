import { z } from "zod";
import { NextRequest } from "next/server";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { completeMultipartUpload } from "@/infrastructure/storage";
import { submitVideoTranscode } from "@/infrastructure/jobs/mediaConvert";
import { getPhotoRepository } from "@/infrastructure/database/dynamodb/repositories";
import { s3Client } from "@/infrastructure/storage/s3Client";
import { env } from "@/infrastructure/config/env";
import type { Photo } from "@/domain/entities";
import { logger } from "@/infrastructure/logging/logger";
import { VIDEO_UPLOAD_MIME_TYPES, ENQUEUE_TIMEOUT_MS } from "@/lib/constants";
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

const completeSchema = z.object({
  photoId: z.string().uuid("Invalid photo ID"),
  key: z.string().min(1),
  uploadId: z.string().min(1),
  originalFilename: z.string().min(1),
  parts: z
    .array(
      z.object({
        partNumber: z.number().int().positive(),
        etag: z.string().min(1),
      }),
    )
    .min(1),
});

export async function POST(request: NextRequest) {
  return handleRoute("POST /api/admin/upload/video/complete", async () => {
    return withAuth(async () => {
      if (!env.VIDEO_ENABLED) {
        return errorResponse("Video upload is not enabled", 400);
      }

      const body = await request.json();
      const result = validateBody(completeSchema, body);
      if (result.error) return result.error;

      const { photoId, key, uploadId, originalFilename, parts } = result.data;

      // Idempotency: if the record already exists, the upload was already
      // finalized; return its current status.
      const existingPhoto = await photoRepository.findById(photoId);
      if (existingPhoto) {
        return successResponse({ photoId, status: existingPhoto.status }, 200);
      }

      // Finalize the S3 multipart upload, assembling the parts into one object.
      await completeMultipartUpload({
        bucket: env.AWS_S3_BUCKET!,
        key,
        uploadId,
        parts: parts.map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
      });

      // Verify the assembled object exists, is non-empty, and is a video.
      try {
        const headResult = await s3Client.send(
          new HeadObjectCommand({ Bucket: env.AWS_S3_BUCKET, Key: key }),
        );

        if (headResult.ContentLength === 0) {
          return errorResponse("Uploaded file is empty", 400);
        }

        if (
          !headResult.ContentType ||
          !VIDEO_UPLOAD_MIME_TYPES.includes(
            headResult.ContentType as (typeof VIDEO_UPLOAD_MIME_TYPES)[number],
          )
        ) {
          return errorResponse(
            `Invalid file type: ${headResult.ContentType}. Allowed: MP4, MOV, WebM`,
            400,
          );
        }
      } catch (error) {
        // HeadObject throws "NotFound" (404) for a missing key; GetObject uses
        // "NoSuchKey". Handle both so a missing object is a clear 400, not a 500.
        const httpStatus = (
          error as { $metadata?: { httpStatusCode?: number } }
        )?.$metadata?.httpStatusCode;
        if (
          (error instanceof Error &&
            (error.name === "NotFound" || error.name === "NoSuchKey")) ||
          httpStatus === 404
        ) {
          return errorResponse("File not found in S3", 400);
        }
        throw error;
      }

      // Create the media record (poster/dimensions/duration filled in later by
      // the MediaConvert completion handler).
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
        mediaType: "video",
        durationMs: null,
        createdAt: now,
        updatedAt: now,
      };
      await photoRepository.save(photo);

      // Submit the transcode job. Failure leaves the photo in "processing" for
      // manual reprocess (mirrors the image enqueue behavior).
      try {
        await enqueueWithTimeout(
          submitVideoTranscode({ photoId, originalKey: key }),
          ENQUEUE_TIMEOUT_MS,
        );
      } catch (submitError) {
        logger.error(`Failed to submit transcode job for video ${photoId}`, {
          component: "upload-video-complete",
          photoId,
          error: serializeError(submitError),
        });
      }

      return successResponse({ photoId, status: "processing" }, 201);
    });
  });
}
