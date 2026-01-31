import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/infrastructure/auth";
import { SQLitePhotoRepository } from "@/infrastructure/database/repositories";

const photoRepository = new SQLitePhotoRepository();

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
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: photoId } = await params;
  const albumIds = await photoRepository.getAlbumIds(photoId);

  return NextResponse.json({ albumIds });
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

  // Parse request body
  const body = (await request.json()) as { albumId?: string };
  if (!body.albumId || typeof body.albumId !== "string") {
    return NextResponse.json({ error: "albumId is required" }, { status: 400 });
  }

  await photoRepository.addToAlbum(photoId, body.albumId);

  return NextResponse.json({ success: true }, { status: 201 });
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
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: photoId } = await params;

  // Parse request body
  const body = (await request.json()) as { albumId?: string };
  if (!body.albumId || typeof body.albumId !== "string") {
    return NextResponse.json({ error: "albumId is required" }, { status: 400 });
  }

  await photoRepository.removeFromAlbum(photoId, body.albumId);

  return new NextResponse(null, { status: 204 });
}
