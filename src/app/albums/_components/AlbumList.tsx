import Link from "next/link";
import { connection } from "next/server";
import { getAlbumRepository } from "@/infrastructure/database/dynamodb/repositories";
import { getClientImageUrl } from "@/lib/imageLoader";
import type { Album } from "@/domain/entities/Album";

function ImagePlaceholder() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-surface-secondary">
      <svg
        className="h-8 w-8 text-text-tertiary"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
      </svg>
    </div>
  );
}

async function getAlbumsWithCovers(): Promise<
  Array<{ album: Album; coverPhotoId: string | null }>
> {
  const albumRepo = getAlbumRepository();

  const albums = await albumRepo.findPublished();

  // Sort by sortOrder (admin's drag-drop order)
  albums.sort((a, b) => a.sortOrder - b.sortOrder);

  return albums.map((album) => ({
    album,
    coverPhotoId: album.coverPhotoId,
  }));
}

export async function AlbumList() {
  await connection();

  const albumsWithCovers = await getAlbumsWithCovers();

  if (albumsWithCovers.length === 0) {
    return (
      <p className="text-center text-text-secondary">No albums available.</p>
    );
  }

  return (
    <div className="space-y-4">
      {albumsWithCovers.map(({ album, coverPhotoId }) => (
        <Link
          key={album.id}
          href={`/albums/${album.id}`}
          className="flex items-center gap-4 rounded-lg p-2 transition-colors hover:bg-surface-hover"
        >
          <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg">
            {coverPhotoId ? (
              <picture>
                <source
                  type="image/avif"
                  srcSet={getClientImageUrl(coverPhotoId, "300w.avif")}
                />
                <img
                  src={getClientImageUrl(coverPhotoId, "300w.webp")}
                  alt={album.title}
                  className="absolute inset-0 h-full w-full object-cover"
                  loading="lazy"
                />
              </picture>
            ) : (
              <ImagePlaceholder />
            )}
          </div>
          <span className="text-lg font-medium text-text-primary">
            {album.title}
          </span>
        </Link>
      ))}
    </div>
  );
}
