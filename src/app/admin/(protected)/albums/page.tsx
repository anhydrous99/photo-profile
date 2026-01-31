import { SQLiteAlbumRepository } from "@/infrastructure/database/repositories";
import { AlbumsPageClient } from "./AlbumsPageClient";

const albumRepository = new SQLiteAlbumRepository();

/**
 * Albums Management Page (Server Component)
 *
 * Fetches all albums with photo counts and passes to client component
 * for interactive drag-drop reordering and CRUD operations.
 */
export default async function AlbumsPage() {
  const [albums, photoCounts] = await Promise.all([
    albumRepository.findAll(),
    albumRepository.getPhotoCounts(),
  ]);

  // Merge albums with photo counts and sort by sortOrder
  const albumsWithCounts = albums
    .map((album) => ({
      ...album,
      photoCount: photoCounts.get(album.id) || 0,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="p-8">
      <AlbumsPageClient albums={albumsWithCounts} />
    </div>
  );
}
