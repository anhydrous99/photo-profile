import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/infrastructure/auth";
import { SQLiteAlbumRepository } from "@/infrastructure/database/repositories";
import { z } from "zod";

const albumRepository = new SQLiteAlbumRepository();

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
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
    console.error("[API] POST /api/admin/albums/reorder:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
