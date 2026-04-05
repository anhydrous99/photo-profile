import { NextRequest } from "next/server";
import { findOriginalFile } from "@/infrastructure/storage";
import { enqueueImageProcessing } from "@/infrastructure/jobs";
import { getPhotoRepository } from "@/infrastructure/database/dynamodb/repositories";
import { logger } from "@/infrastructure/logging/logger";
import { enqueueWithTimeout } from "@/lib/enqueueWithTimeout";
import { serializeError } from "@/lib/serializeError";
import { ENQUEUE_TIMEOUT_MS } from "@/lib/constants";
import {
  withAuth,
  validateParamId,
  errorResponse,
  successResponse,
} from "@/lib/apiHelpers";
import { handleRoute } from "@/lib/routeHandler";

const photoRepository = getPhotoRepository();

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/admin/photos/[id]/reprocess
 *
 * Re-enqueues a failed or stale photo for image processing.
 *
 * Steps:
 * 1. Verify admin session
 * 2. Fetch photo by ID
 * 3. Guard against reprocessing already-ready photos
 * 4. Discover original file path
 * 5. Reset status to "processing"
 * 6. Re-enqueue processing job
 *
 * Returns: { id, status: "processing" }
 */
export async function POST(_request: NextRequest, context: RouteContext) {
  return handleRoute("POST /api/admin/photos/[id]/reprocess", async () => {
    return withAuth(async () => {
      const { id } = await context.params;

      const idError = validateParamId(id, "photo");
      if (idError) return idError;

      const photo = await photoRepository.findById(id);
      if (!photo) {
        return errorResponse("Photo not found", 404);
      }

      if (photo.status === "ready") {
        return errorResponse("Photo is already processed", 400);
      }

      const originalPath = await findOriginalFile(id);
      if (!originalPath) {
        return errorResponse("Original file not found", 404);
      }

      photo.status = "processing";
      photo.updatedAt = new Date();
      await photoRepository.save(photo);

      try {
        await enqueueWithTimeout(
          enqueueImageProcessing(id, originalPath),
          ENQUEUE_TIMEOUT_MS,
        );
      } catch (enqueueError) {
        logger.error(`Failed to enqueue reprocess for photo ${id}`, {
          component: "reprocess",
          photoId: id,
          error: serializeError(enqueueError),
        });
      }

      return successResponse({ id, status: "processing" });
    });
  });
}
