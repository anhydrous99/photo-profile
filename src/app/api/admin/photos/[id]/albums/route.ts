import { NextRequest } from "next/server";
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

const albumIdSchema = z.object({
  albumId: z.string().uuid("Invalid album ID format"),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/admin/photos/[id]/albums
 *
 * Returns list of album IDs the photo belongs to.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  return handleRoute("GET /api/admin/photos/[id]/albums", async () => {
    return withAuth(async () => {
      const { id: photoId } = await params;

      const idError = validateParamId(photoId, "photo");
      if (idError) return idError;

      const albumIds = await photoRepository.getAlbumIds(photoId);

      return successResponse({ albumIds });
    });
  });
}

/**
 * POST /api/admin/photos/[id]/albums
 *
 * Adds photo to an album.
 * Body: { albumId: string }
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  return handleRoute("POST /api/admin/photos/[id]/albums", async () => {
    return withAuth(async () => {
      const { id: photoId } = await params;

      const idError = validateParamId(photoId, "photo");
      if (idError) return idError;

      const photo = await photoRepository.findById(photoId);
      if (!photo) {
        return errorResponse("Photo not found", 404);
      }

      const body = await request.json();
      const result = validateBody(albumIdSchema, body);
      if (result.error) return result.error;

      await photoRepository.addToAlbum(photoId, result.data.albumId);

      revalidateAlbumPaths(result.data.albumId);

      return successResponse({ success: true }, 201);
    });
  });
}

/**
 * DELETE /api/admin/photos/[id]/albums
 *
 * Removes photo from an album.
 * Body: { albumId: string }
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  return handleRoute("DELETE /api/admin/photos/[id]/albums", async () => {
    return withAuth(async () => {
      const { id: photoId } = await params;

      const idError = validateParamId(photoId, "photo");
      if (idError) return idError;

      const body = await request.json();
      const result = validateBody(albumIdSchema, body);
      if (result.error) return result.error;

      await photoRepository.removeFromAlbum(photoId, result.data.albumId);

      revalidateAlbumPaths(result.data.albumId);

      return noContentResponse();
    });
  });
}
