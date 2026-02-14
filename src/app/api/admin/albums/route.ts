import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/infrastructure/auth";
import {
  DynamoDBAlbumRepository,
  DynamoDBPhotoRepository,
} from "@/infrastructure/database/dynamodb/repositories";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logger } from "@/infrastructure/logging/logger";

const photoRepository = new DynamoDBPhotoRepository();
const albumRepository = new DynamoDBAlbumRepository(photoRepository);

const createAlbumSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  tags: z.string().max(200).optional(),
});

/**
 * GET /api/admin/albums
 *
 * Returns all albums sorted by sortOrder, including photo counts.
 */
export async function GET() {
  try {
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const albums = await albumRepository.findAll();
    const photoCounts = await albumRepository.getPhotoCounts();

    // Sort by sortOrder and merge photo counts
    const albumsWithCounts = albums
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((album) => ({
        ...album,
        photoCount: photoCounts.get(album.id) ?? 0,
      }));

    return NextResponse.json(albumsWithCounts);
  } catch (error) {
    logger.error("GET /api/admin/albums failed", {
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
 * POST /api/admin/albums
 *
 * Creates a new album.
 *
 * Request body: { title: string, description?: string, tags?: string }
 * Returns: Created album with 201 status
 */
export async function POST(request: NextRequest) {
  try {
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const result = createAlbumSchema.safeParse(body);

    if (!result.success) {
      const flat = z.flattenError(result.error);
      return NextResponse.json(
        { error: "Validation failed", details: flat.fieldErrors },
        { status: 400 },
      );
    }

    // Get max sortOrder to append at end
    const albums = await albumRepository.findAll();
    const maxSortOrder = Math.max(0, ...albums.map((a) => a.sortOrder));

    const album = {
      id: crypto.randomUUID(),
      title: result.data.title,
      description: result.data.description ?? null,
      tags: result.data.tags ?? null,
      coverPhotoId: null,
      sortOrder: maxSortOrder + 1,
      isPublished: false,
      createdAt: new Date(),
    };

    await albumRepository.save(album);

    revalidatePath("/admin/albums");
    revalidatePath("/admin");
    revalidatePath("/albums");

    return NextResponse.json(album, { status: 201 });
  } catch (error) {
    logger.error("POST /api/admin/albums failed", {
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
