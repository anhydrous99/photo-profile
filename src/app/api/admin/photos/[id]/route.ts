import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/infrastructure/auth";
import { deletePhotoFiles } from "@/infrastructure/storage";
import { SQLitePhotoRepository } from "@/infrastructure/database/repositories";

const photoRepository = new SQLitePhotoRepository();

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/admin/photos/[id]
 *
 * Updates a photo's description.
 *
 * Request body: { description: string | null }
 * Returns: Updated photo object
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  // 1. Verify admin session
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Get photo ID from route params
  const { id } = await context.params;

  // 3. Fetch existing photo
  const photo = await photoRepository.findById(id);
  if (!photo) {
    return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  }

  // 4. Parse request body
  const body = await request.json();
  const { description } = body as { description: string | null };

  // 5. Update photo
  photo.description = description;
  photo.updatedAt = new Date();
  await photoRepository.save(photo);

  return NextResponse.json(photo);
}

/**
 * DELETE /api/admin/photos/[id]
 *
 * Deletes a photo and all associated files.
 *
 * Steps:
 * 1. Verify admin session
 * 2. Fetch photo by ID
 * 3. Delete all files from storage
 * 4. Delete photo record from database
 *
 * Returns: 204 No Content on success
 */
export async function DELETE(_request: NextRequest, context: RouteContext) {
  // 1. Verify admin session
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Get photo ID from route params
  const { id } = await context.params;

  // 3. Fetch existing photo
  const photo = await photoRepository.findById(id);
  if (!photo) {
    return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  }

  // 4. Delete all files from storage (before DB delete)
  await deletePhotoFiles(id);

  // 5. Delete photo record from database
  await photoRepository.delete(id);

  return new NextResponse(null, { status: 204 });
}
