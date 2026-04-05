import { NextRequest } from "next/server";
import { deletePhotoFiles } from "@/infrastructure/storage";
import { getPhotoRepository } from "@/infrastructure/database/dynamodb/repositories";
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

const photoRepository = getPhotoRepository();

const updatePhotoSchema = z.object({
  description: z.string().nullable(),
});

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
  return handleRoute("PATCH /api/admin/photos/[id]", async () => {
    return withAuth(async () => {
      const { id } = await context.params;

      const idError = validateParamId(id, "photo");
      if (idError) return idError;

      const photo = await photoRepository.findById(id);
      if (!photo) {
        return errorResponse("Photo not found", 404);
      }

      const body = await request.json();
      const result = validateBody(updatePhotoSchema, body);
      if (result.error) return result.error;

      photo.description = result.data.description;
      photo.updatedAt = new Date();
      await photoRepository.save(photo);

      revalidateAlbumPaths();

      return successResponse(photo);
    });
  });
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
  return handleRoute("DELETE /api/admin/photos/[id]", async () => {
    return withAuth(async () => {
      const { id } = await context.params;

      const idError = validateParamId(id, "photo");
      if (idError) return idError;

      const photo = await photoRepository.findById(id);
      if (!photo) {
        return errorResponse("Photo not found", 404);
      }

      await deletePhotoFiles(id);
      await photoRepository.delete(id);

      revalidateAlbumPaths();

      return noContentResponse();
    });
  });
}
