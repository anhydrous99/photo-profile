import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/infrastructure/auth";
import { findOriginalFile } from "@/infrastructure/storage";
import { enqueueImageProcessing } from "@/infrastructure/jobs";
import { DynamoDBPhotoRepository } from "@/infrastructure/database/dynamodb/repositories";
import { logger } from "@/infrastructure/logging/logger";
import { isValidUUID } from "@/infrastructure/validation";

const photoRepository = new DynamoDBPhotoRepository();

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
 * 6. Re-enqueue processing job via SQS
 *
 * Returns: { id, status: "processing" }
 */
export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    // 1. Verify admin session
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
      await Promise.race([
        enqueueImageProcessing(id, originalPath), // originalPath is S3 key or filesystem path
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Job enqueue timeout")), 10000),
        ),
      ]);
    } catch (enqueueError) {
      logger.error(`Failed to enqueue reprocess for photo ${id}`, {
        component: "reprocess",
        photoId: id,
        error:
          enqueueError instanceof Error
            ? { message: enqueueError.message, stack: enqueueError.stack }
            : enqueueError,
      });
      // Status already set to "processing" - will appear as stale if worker never picks it up
    }

    return NextResponse.json({ id, status: "processing" });
  } catch (error) {
    logger.error("POST /api/admin/photos/[id]/reprocess failed", {
      error:
        error instanceof Error
          ? { message: error.message, stack: error.stack }
          : error,
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
