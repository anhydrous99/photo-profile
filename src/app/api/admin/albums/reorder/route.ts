import { NextRequest } from "next/server";
import { getAlbumRepository } from "@/infrastructure/database/dynamodb/repositories";
import { z } from "zod";
import { revalidateAlbumPaths } from "@/lib/revalidateAlbumPaths";
import { withAuth, validateBody, successResponse } from "@/lib/apiHelpers";
import { handleRoute } from "@/lib/routeHandler";

const albumRepository = getAlbumRepository();

const reorderSchema = z.object({
  albumIds: z.array(z.string()),
});

/**
 * POST /api/admin/albums/reorder
 *
 * Updates sortOrder for all albums based on the provided array order.
 * albumIds[0] gets sortOrder 0, albumIds[1] gets sortOrder 1, etc.
 *
 * Request body: { albumIds: string[] }
 * Returns: { success: true }
 */
export async function POST(request: NextRequest) {
  return handleRoute("POST /api/admin/albums/reorder", async () => {
    return withAuth(async () => {
      const body = await request.json();
      const result = validateBody(reorderSchema, body);
      if (result.error) return result.error;

      await albumRepository.updateSortOrders(result.data.albumIds);

      revalidateAlbumPaths();

      return successResponse({ success: true });
    });
  });
}
