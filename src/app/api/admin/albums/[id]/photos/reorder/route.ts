import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/infrastructure/auth";
import { SQLitePhotoRepository } from "@/infrastructure/database/repositories";
import { z } from "zod";
import { logger } from "@/infrastructure/logging/logger";

const photoRepository = new SQLitePhotoRepository();

const reorderSchema = z.object({
  photoIds: z.array(z.string()),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/admin/albums/[id]/photos/reorder
 *
 * Updates sortOrder for photos within an album based on the provided array order.
 * photoIds[0] gets sortOrder 0, photoIds[1] gets sortOrder 1, etc.
 *
 * Request body: { photoIds: string[] }
 * Returns: { success: true }
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: albumId } = await context.params;

    const body = await request.json();
    const result = reorderSchema.safeParse(body);

    if (!result.success) {
      const flat = z.flattenError(result.error);
      return NextResponse.json(
        { error: "Validation failed", details: flat.fieldErrors },
        { status: 400 },
      );
    }

    await photoRepository.updatePhotoSortOrders(albumId, result.data.photoIds);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("POST /api/admin/albums/[id]/photos/reorder failed", {
      error:
        error instanceof Error
          ? { message: error.message, stack: error.stack }
          : error,
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
