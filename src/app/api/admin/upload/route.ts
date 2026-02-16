import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/requireAuth";
import { saveOriginalFile } from "@/infrastructure/storage";
import { enqueueImageProcessing } from "@/infrastructure/jobs";
import { DynamoDBPhotoRepository } from "@/infrastructure/database/dynamodb/repositories";
import type { Photo } from "@/domain/entities";
import { logger } from "@/infrastructure/logging/logger";
import {
  UPLOAD_MIME_TYPES,
  MAX_FILE_SIZE,
  MULTIPART_OVERHEAD,
} from "@/lib/constants";
import { enqueueWithTimeout } from "@/lib/enqueueWithTimeout";

export const maxDuration = 300;

const photoRepository = new DynamoDBPhotoRepository();

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
    const authResult = await requireAuth();
    if (authResult instanceof NextResponse) return authResult;

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
    if (
      !UPLOAD_MIME_TYPES.includes(
        file.type as (typeof UPLOAD_MIME_TYPES)[number],
      )
    ) {
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
      await enqueueWithTimeout(
        enqueueImageProcessing(photoId, filePath), // filePath is S3 key or filesystem path
        10000,
      );
    } catch {
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
