import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/requireAuth";
import { getAlbumRepository } from "@/infrastructure/database/dynamodb/repositories";
import { z } from "zod";
import { logger } from "@/infrastructure/logging/logger";
import { serializeError } from "@/lib/serializeError";

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
  try {
    const authResult = await requireAuth();
    if (authResult instanceof NextResponse) return authResult;

    const body = await request.json();
    const result = reorderSchema.safeParse(body);

    if (!result.success) {
      const flat = z.flattenError(result.error);
      return NextResponse.json(
        { error: "Validation failed", details: flat.fieldErrors },
        { status: 400 },
      );
    }

    await albumRepository.updateSortOrders(result.data.albumIds);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("POST /api/admin/albums/reorder failed", {
      error: serializeError(error),
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
