import { NextRequest } from "next/server";
import { deletePhotoFiles } from "@/infrastructure/storage";
import { getAlbumRepository } from "@/infrastructure/database/dynamodb/repositories";
import { z } from "zod";
import { revalidateAlbumPaths } from "@/lib/revalidateAlbumPaths";
import {
  withAuth,
  validateBody,
  validateParamId,
  errorResponse,
  successResponse,
  noContentResponse,
} from "@/lib/apiHelpers";
import { handleRoute } from "@/lib/routeHandler";

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
 * Updates an album's title, description, tags, coverPhotoId, or isPublished.
 *
 * Request body: partial album fields
 * Returns: Updated album object
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  return handleRoute("PATCH /api/admin/albums/[id]", async () =>
    withAuth(async () => {
      const { id } = await context.params;

      const idError = validateParamId(id, "album");
      if (idError) return idError;

      const album = await albumRepository.findById(id);
      if (!album) return errorResponse("Album not found", 404);

      const body = await request.json();
      const result = validateBody(updateAlbumSchema, body);
      if (result.error) return result.error;

      if (result.data.title !== undefined) album.title = result.data.title;
      if (result.data.description !== undefined)
        album.description = result.data.description;
      if (result.data.tags !== undefined) album.tags = result.data.tags;
      if (result.data.coverPhotoId !== undefined)
        album.coverPhotoId = result.data.coverPhotoId;
      if (result.data.isPublished !== undefined)
        album.isPublished = result.data.isPublished;

      await albumRepository.save(album);
      revalidateAlbumPaths(id);

      return successResponse(album);
    }),
  );
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
  return handleRoute("DELETE /api/admin/albums/[id]", async () =>
    withAuth(async () => {
      const { id: albumId } = await context.params;

      const idError = validateParamId(albumId, "album");
      if (idError) return idError;

      const album = await albumRepository.findById(albumId);
      if (!album) return errorResponse("Album not found", 404);

      let body: { deletePhotos?: boolean };
      try {
        body = await request.json();
      } catch {
        body = {};
      }
      const deletePhotos = body.deletePhotos === true;

      if (deletePhotos) {
        const { deletedPhotoIds } =
          await albumRepository.deleteAlbumAndPhotos(albumId);
        for (const photoId of deletedPhotoIds) {
          await deletePhotoFiles(photoId);
        }
      } else {
        await albumRepository.deleteAlbumOnly(albumId);
      }

      revalidateAlbumPaths();

      return noContentResponse();
    }),
  );
}
