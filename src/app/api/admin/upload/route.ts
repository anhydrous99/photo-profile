import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/infrastructure/auth";
import { saveOriginalFile } from "@/infrastructure/storage";
import { enqueueImageProcessing } from "@/infrastructure/jobs";
import { DynamoDBPhotoRepository } from "@/infrastructure/database/dynamodb/repositories";
import type { Photo } from "@/domain/entities";
import { logger } from "@/infrastructure/logging/logger";

export const maxDuration = 300;

const photoRepository = new DynamoDBPhotoRepository();

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const MULTIPART_OVERHEAD = 5 * 1024 * 1024; // 5MB

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
  try {
    // 1. Verify session
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Early reject oversized uploads before reading into memory
    const contentLength = parseInt(
      request.headers.get("content-length") || "0",
      10,
    );
    if (contentLength > MAX_FILE_SIZE + MULTIPART_OVERHEAD) {
      return NextResponse.json(
        { error: "File exceeds 100MB limit" },
        { status: 413 },
      );
    }

    // 3. Parse form data
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file size after parsing
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File exceeds 100MB limit" },
        { status: 413 },
      );
    }

    // Validate file type
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
    ];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        {
          error: `Invalid file type: ${file.type}. Allowed: JPEG, PNG, WebP, HEIC`,
        },
        { status: 400 },
      );
    }

    // 4. Generate photo ID
    const photoId = crypto.randomUUID();

    // 5. Save file to disk
    const filePath = await saveOriginalFile(photoId, file);

    // 6. Create photo record
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

    // 7. Enqueue processing job (gracefully handle Redis unavailable)
    try {
      // Add timeout to prevent hanging when Redis is unavailable
      await Promise.race([
        enqueueImageProcessing(photoId, filePath), // filePath is S3 key or filesystem path
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Job enqueue timeout")), 10000),
        ),
      ]);
    } catch (enqueueError) {
      logger.error(`Failed to enqueue processing for photo ${photoId}`, {
        component: "upload",
        photoId,
        error:
          enqueueError instanceof Error
            ? { message: enqueueError.message, stack: enqueueError.stack }
            : enqueueError,
      });
      // Photo saved with "processing" status - will need manual requeue when Redis is available
    }

    return NextResponse.json(
      { photoId, status: "processing" },
      { status: 201 },
    );
  } catch (error) {
    logger.error("POST /api/admin/upload failed", {
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
