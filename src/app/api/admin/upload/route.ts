import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/infrastructure/auth";
import { saveOriginalFile } from "@/infrastructure/storage";
import { enqueueImageProcessing } from "@/infrastructure/jobs";
import { SQLitePhotoRepository } from "@/infrastructure/database/repositories";
import type { Photo } from "@/domain/entities";

const photoRepository = new SQLitePhotoRepository();

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
  console.log("[Upload] POST /api/admin/upload - Request received");
  // 1. Verify session
  const session = await verifySession();
  console.log("[Upload] Session verified:", !!session);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse form data
  console.log("[Upload] Parsing form data...");
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  console.log("[Upload] File received:", file?.name, file?.size);

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  // Validate file type
  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/heic"];
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json(
      {
        error: `Invalid file type: ${file.type}. Allowed: JPEG, PNG, WebP, HEIC`,
      },
      { status: 400 },
    );
  }

  // 3. Generate photo ID
  const photoId = crypto.randomUUID();

  // 4. Save file to disk
  const filePath = await saveOriginalFile(photoId, file);

  // 5. Create photo record
  const now = new Date();
  const photo: Photo = {
    id: photoId,
    title: null,
    description: null,
    originalFilename: file.name,
    status: "processing",
    createdAt: now,
    updatedAt: now,
  };
  await photoRepository.save(photo);

  // 6. Enqueue processing job (gracefully handle Redis unavailable)
  console.log("[Upload] Enqueueing processing job...");
  try {
    // Add timeout to prevent hanging when Redis is unavailable
    await Promise.race([
      enqueueImageProcessing(photoId, filePath),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Job enqueue timeout")), 2000),
      ),
    ]);
    console.log("[Upload] Job enqueued successfully");
  } catch (error) {
    console.warn(
      "[Upload] Failed to enqueue processing job (Redis unavailable):",
      error instanceof Error ? error.message : error,
    );
    // Continue - photo is saved, processing will remain in "processing" status
  }

  console.log("[Upload] Sending response...");
  return NextResponse.json({ photoId, status: "processing" }, { status: 201 });
}
