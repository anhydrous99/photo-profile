import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/infrastructure/auth";
import { deletePhotoFiles } from "@/infrastructure/storage";
import {
  SQLiteAlbumRepository,
  SQLitePhotoRepository,
} from "@/infrastructure/database/repositories";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const albumRepository = new SQLiteAlbumRepository();
const photoRepository = new SQLitePhotoRepository();

const updateAlbumSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  tags: z.string().max(200).nullable().optional(),
  coverPhotoId: z.string().nullable().optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/admin/albums/[id]
 *
 * Updates an album's title, description, tags, or coverPhotoId.
 *
 * Request body: { title?: string, description?: string | null, tags?: string | null, coverPhotoId?: string | null }
 * Returns: Updated album object
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  // Fetch existing album
  const album = await albumRepository.findById(id);
  if (!album) {
    return NextResponse.json({ error: "Album not found" }, { status: 404 });
  }

  const body = await request.json();
  const result = updateAlbumSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      { error: "Invalid data", details: result.error.flatten() },
      { status: 400 },
    );
  }

  // Update only provided fields
  if (result.data.title !== undefined) {
    album.title = result.data.title;
  }
  if (result.data.description !== undefined) {
    album.description = result.data.description;
  }
  if (result.data.tags !== undefined) {
    album.tags = result.data.tags;
  }
  if (result.data.coverPhotoId !== undefined) {
    album.coverPhotoId = result.data.coverPhotoId;
  }

  await albumRepository.save(album);

  return NextResponse.json(album);
}

/**
 * DELETE /api/admin/albums/[id]
 *
 * Deletes an album with optional cascade to photos.
 *
 * Request body: { deletePhotos?: boolean }
 * - deletePhotos: false (default) - delete album only, photos remain in library
 * - deletePhotos: true - delete album and all photos in it
 *
 * Returns: 204 No Content on success
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: albumId } = await context.params;

  // Verify album exists
  const album = await albumRepository.findById(albumId);
  if (!album) {
    return NextResponse.json({ error: "Album not found" }, { status: 404 });
  }

  // Parse request body for delete mode
  const body = (await request.json().catch(() => ({}))) as {
    deletePhotos?: boolean;
  };
  const deletePhotos = body.deletePhotos === true;

  // Delete album (and get photo IDs if deleting photos)
  const { deletedPhotoIds } = await albumRepository.deleteWithPhotos(
    albumId,
    deletePhotos,
  );

  // Delete photo files and records if requested
  if (deletePhotos) {
    for (const photoId of deletedPhotoIds) {
      await deletePhotoFiles(photoId);
      await photoRepository.delete(photoId);
    }
  }

  revalidatePath("/admin/albums");
  revalidatePath("/admin");

  return new NextResponse(null, { status: 204 });
}
