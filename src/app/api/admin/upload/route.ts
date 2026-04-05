import { NextRequest } from "next/server";
import { saveOriginalFile } from "@/infrastructure/storage";
import { enqueueImageProcessing } from "@/infrastructure/jobs";
import { getPhotoRepository } from "@/infrastructure/database/dynamodb/repositories";
import type { Photo } from "@/domain/entities";
import { logger } from "@/infrastructure/logging/logger";
import {
  UPLOAD_MIME_TYPES,
  MAX_FILE_SIZE,
  MULTIPART_OVERHEAD,
  ENQUEUE_TIMEOUT_MS,
  MAX_ROUTE_DURATION,
} from "@/lib/constants";
import { enqueueWithTimeout } from "@/lib/enqueueWithTimeout";
import { serializeError } from "@/lib/serializeError";
import { withAuth, errorResponse, successResponse } from "@/lib/apiHelpers";
import { handleRoute } from "@/lib/routeHandler";

export const maxDuration = MAX_ROUTE_DURATION;

const photoRepository = getPhotoRepository();

/**
 * POST /api/admin/upload
 *
 * Handles single file upload:
 * 1. Verifies admin session
 * 2. Extracts file from multipart form data
 * 3. Generates unique photo ID
 * 4. Saves file to storage/originals/{photoId}/
 * 5. Creates photo record with status "processing"
 * 6. Enqueues image processing job
 *
 * Returns: { photoId, status: "processing" }
 */
export async function POST(request: NextRequest) {
  return handleRoute("POST /api/admin/upload", async () => {
    return withAuth(async () => {
      // Early reject oversized uploads before reading into memory
      const contentLength = parseInt(
        request.headers.get("content-length") || "0",
        10,
      );
      if (contentLength > MAX_FILE_SIZE + MULTIPART_OVERHEAD) {
        return errorResponse("File exceeds 100MB limit", 413);
      }

      // Parse form data
      const formData = await request.formData();
      const file = formData.get("file") as File | null;

      if (!file) {
        return errorResponse("No file provided", 400);
      }

      if (file.size > MAX_FILE_SIZE) {
        return errorResponse("File exceeds 100MB limit", 413);
      }

      if (
        !UPLOAD_MIME_TYPES.includes(
          file.type as (typeof UPLOAD_MIME_TYPES)[number],
        )
      ) {
        return errorResponse(
          `Invalid file type: ${file.type}. Allowed: JPEG, PNG, WebP, HEIC`,
          400,
        );
      }

      // Generate photo ID and save file
      const photoId = crypto.randomUUID();
      const filePath = await saveOriginalFile(photoId, file);

      // Create photo record
      const now = new Date();
      const photo: Photo = {
        id: photoId,
        title: null,
        description: null,
        originalFilename: file.name,
        blurDataUrl: null,
        exifData: null,
        width: null,
        height: null,
        status: "processing",
        createdAt: now,
        updatedAt: now,
      };
      await photoRepository.save(photo);

      // Enqueue processing job (gracefully handle Redis unavailable)
      try {
        await enqueueWithTimeout(
          enqueueImageProcessing(photoId, filePath),
          ENQUEUE_TIMEOUT_MS,
        );
      } catch (enqueueError) {
        logger.error(`Failed to enqueue processing for photo ${photoId}`, {
          component: "upload",
          photoId,
          error: serializeError(enqueueError),
        });
        // Photo saved with "processing" status - will need manual requeue
      }

      return successResponse({ photoId, status: "processing" }, 201);
    });
  });
}
