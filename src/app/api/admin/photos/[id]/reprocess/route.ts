import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/requireAuth";
import { findOriginalFile } from "@/infrastructure/storage";
import { enqueueImageProcessing } from "@/infrastructure/jobs";
import { getPhotoRepository } from "@/infrastructure/database/dynamodb/repositories";
import { logger } from "@/infrastructure/logging/logger";
import { isValidUUID } from "@/infrastructure/validation";
import { enqueueWithTimeout } from "@/lib/enqueueWithTimeout";
import { serializeError } from "@/lib/serializeError";

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
  try {
    const authResult = await requireAuth();
    if (authResult instanceof NextResponse) return authResult;

    // 2. Get photo ID
    const { id } = await context.params;

    // 2.1 Validate photo ID format
    if (!isValidUUID(id)) {
      return NextResponse.json(
        { error: "Invalid photo ID format" },
        { status: 400 },
      );
    }

    // 3. Fetch photo
    const photo = await photoRepository.findById(id);
    if (!photo) {
      return NextResponse.json({ error: "Photo not found" }, { status: 404 });
    }

    // 4. Only allow reprocessing of error or processing (stale) photos
    if (photo.status === "ready") {
      return NextResponse.json(
        { error: "Photo is already processed" },
        { status: 400 },
      );
    }

    // 5. Find original file
    const originalPath = await findOriginalFile(id);
    if (!originalPath) {
      return NextResponse.json(
        { error: "Original file not found" },
        { status: 404 },
      );
    }

    // 6. Reset photo status
    photo.status = "processing";
    photo.updatedAt = new Date();
    await photoRepository.save(photo);

    // 7. Re-enqueue processing job
    try {
      await enqueueWithTimeout(
        enqueueImageProcessing(id, originalPath), // originalPath is S3 key or filesystem path
        10000,
      );
    } catch (enqueueError) {
      logger.error(`Failed to enqueue reprocess for photo ${id}`, {
        component: "reprocess",
        photoId: id,
        error: serializeError(enqueueError),
      });
      // Status already set to "processing" - will appear as stale if worker never picks it up
    }

    return NextResponse.json({ id, status: "processing" });
  } catch (error) {
    logger.error("POST /api/admin/photos/[id]/reprocess failed", {
      error: serializeError(error),
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
