import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/infrastructure/auth";
import { SQLitePhotoRepository } from "@/infrastructure/database/repositories";
import { z } from "zod";
import { logger } from "@/infrastructure/logging/logger";

const photoRepository = new SQLitePhotoRepository();

const albumIdSchema = z.object({
  albumId: z.string().min(1),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/admin/photos/[id]/albums
 *
 * Returns list of album IDs the photo belongs to.
 */
export async function GET(
  _request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: photoId } = await params;
    const albumIds = await photoRepository.getAlbumIds(photoId);

    return NextResponse.json({ albumIds });
  } catch (error) {
    logger.error("GET /api/admin/photos/[id]/albums failed", {
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

/**
 * POST /api/admin/photos/[id]/albums
 *
 * Adds photo to an album.
 * Body: { albumId: string }
 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: photoId } = await params;

    // Verify photo exists
    const photo = await photoRepository.findById(photoId);
    if (!photo) {
      return NextResponse.json({ error: "Photo not found" }, { status: 404 });
    }

    // Parse and validate request body
    const body = await request.json();
    const result = albumIdSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: z.flattenError(result.error).fieldErrors,
        },
        { status: 400 },
      );
    }

    await photoRepository.addToAlbum(photoId, result.data.albumId);

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    logger.error("POST /api/admin/photos/[id]/albums failed", {
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

/**
 * DELETE /api/admin/photos/[id]/albums
 *
 * Removes photo from an album.
 * Body: { albumId: string }
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: photoId } = await params;

    // Parse and validate request body
    const body = await request.json();
    const result = albumIdSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: z.flattenError(result.error).fieldErrors,
        },
        { status: 400 },
      );
    }

    await photoRepository.removeFromAlbum(photoId, result.data.albumId);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    logger.error("DELETE /api/admin/photos/[id]/albums failed", {
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
