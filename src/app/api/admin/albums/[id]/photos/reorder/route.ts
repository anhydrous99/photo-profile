import { NextRequest } from "next/server";
import { getPhotoRepository } from "@/infrastructure/database/dynamodb/repositories";
import { z } from "zod";
import { revalidateAlbumPaths } from "@/lib/revalidateAlbumPaths";
import {
  withAuth,
  validateBody,
  validateParamId,
  successResponse,
} from "@/lib/apiHelpers";
import { handleRoute } from "@/lib/routeHandler";

const photoRepository = getPhotoRepository();

const reorderSchema = z.object({
  photoIds: z.array(z.string().uuid("Invalid photo ID format")),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/admin/albums/[id]/photos/reorder
 *
 * Updates sortOrder for photos within an album based on the provided array order.
 *
 * Request body: { photoIds: string[] }
 * Returns: { success: true }
 */
export async function POST(request: NextRequest, context: RouteContext) {
  return handleRoute("POST /api/admin/albums/[id]/photos/reorder", async () => {
    return withAuth(async () => {
      const { id: albumId } = await context.params;

      const idError = validateParamId(albumId, "album");
      if (idError) return idError;

      const body = await request.json();
      const result = validateBody(reorderSchema, body);
      if (result.error) return result.error;

      await photoRepository.updatePhotoSortOrders(
        albumId,
        result.data.photoIds,
      );

      revalidateAlbumPaths(albumId);

      return successResponse({ success: true });
    });
  });
}
