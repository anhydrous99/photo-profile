import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/requireAuth";
import { deletePhotoFiles } from "@/infrastructure/storage";
import {
  getAlbumRepository,
  getPhotoRepository,
} from "@/infrastructure/database/dynamodb/repositories";
import { z } from "zod";
import { logger } from "@/infrastructure/logging/logger";
import { isValidUUID } from "@/infrastructure/validation";
import { revalidateAlbumPaths } from "@/lib/revalidateAlbumPaths";
import { serializeError } from "@/lib/serializeError";

const photoRepository = getPhotoRepository();
const albumRepository = getAlbumRepository();

const updateAlbumSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  tags: z.string().max(200).nullable().optional(),
  coverPhotoId: z
    .string()
    .uuid("Invalid cover photo ID format")
    .nullable()
    .optional(),
  isPublished: z.boolean().optional(),
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
  try {
    const authResult = await requireAuth();
    if (authResult instanceof NextResponse) return authResult;

    const { id } = await context.params;

    // Validate album ID format
    if (!isValidUUID(id)) {
      return NextResponse.json(
        { error: "Invalid album ID format" },
        { status: 400 },
      );
    }

    // Fetch existing album
    const album = await albumRepository.findById(id);
    if (!album) {
      return NextResponse.json({ error: "Album not found" }, { status: 404 });
    }

    const body = await request.json();
    const result = updateAlbumSchema.safeParse(body);

    if (!result.success) {
      const flat = z.flattenError(result.error);
      return NextResponse.json(
        { error: "Validation failed", details: flat.fieldErrors },
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
    if (result.data.isPublished !== undefined) {
      album.isPublished = result.data.isPublished;
    }

    await albumRepository.save(album);

    revalidateAlbumPaths(id);

    return NextResponse.json(album);
  } catch (error) {
    logger.error("PATCH /api/admin/albums/[id] failed", {
      error: serializeError(error),
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
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
  try {
    const authResult = await requireAuth();
    if (authResult instanceof NextResponse) return authResult;

    const { id: albumId } = await context.params;

    // Validate album ID format
    if (!isValidUUID(albumId)) {
      return NextResponse.json(
        { error: "Invalid album ID format" },
        { status: 400 },
      );
    }

    // Verify album exists
    const album = await albumRepository.findById(albumId);
    if (!album) {
      return NextResponse.json({ error: "Album not found" }, { status: 404 });
    }

    // Parse request body for delete mode
    let body: { deletePhotos?: boolean };
    try {
      body = await request.json();
    } catch {
      body = {};
    }
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

    revalidateAlbumPaths();

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    logger.error("DELETE /api/admin/albums/[id] failed", {
      error: serializeError(error),
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
