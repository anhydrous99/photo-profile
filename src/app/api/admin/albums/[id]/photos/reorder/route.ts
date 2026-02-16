import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/requireAuth";
import { DynamoDBPhotoRepository } from "@/infrastructure/database/dynamodb/repositories";
import { z } from "zod";
import { logger } from "@/infrastructure/logging/logger";
import { isValidUUID } from "@/infrastructure/validation";
import { serializeError } from "@/lib/serializeError";

const photoRepository = new DynamoDBPhotoRepository();

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
 * photoIds[0] gets sortOrder 0, photoIds[1] gets sortOrder 1, etc.
 *
 * Request body: { photoIds: string[] }
 * Returns: { success: true }
 */
export async function POST(request: NextRequest, context: RouteContext) {
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
      error: serializeError(error),
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
