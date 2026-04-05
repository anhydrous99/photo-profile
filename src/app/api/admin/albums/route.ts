import { NextRequest } from "next/server";
import { getAlbumRepository } from "@/infrastructure/database/dynamodb/repositories";
import { z } from "zod";
import { revalidateAlbumPaths } from "@/lib/revalidateAlbumPaths";
import { withAuth, validateBody, successResponse } from "@/lib/apiHelpers";
import { handleRoute } from "@/lib/routeHandler";

const albumRepository = getAlbumRepository();

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
  return handleRoute("GET /api/admin/albums", async () => {
    return withAuth(async () => {
      const albums = await albumRepository.findAll();
      const photoCounts = await albumRepository.getPhotoCounts();

      const albumsWithCounts = albums
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((album) => ({
          ...album,
          photoCount: photoCounts.get(album.id) ?? 0,
        }));

      return successResponse(albumsWithCounts);
    });
  });
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
  return handleRoute("POST /api/admin/albums", async () => {
    return withAuth(async () => {
      const body = await request.json();
      const result = validateBody(createAlbumSchema, body);
      if (result.error) return result.error;

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

      revalidateAlbumPaths();

      return successResponse(album, 201);
    });
  });
}
