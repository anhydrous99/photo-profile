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
      <p className="py-12 text-center text-text-secondary">
        No albums available.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 lg:gap-x-6 lg:gap-y-12">
      {albumsWithCovers.map(({ album, coverPhotoId }) => (
        <Link
          key={album.id}
          href={`/albums/${album.id}`}
          className="group block"
        >
          <div className="relative aspect-[4/5] w-full overflow-hidden bg-surface-secondary">
            {coverPhotoId ? (
              <picture>
                <source
                  type="image/avif"
                  srcSet={`${getClientImageUrl(coverPhotoId, "600w.avif")} 600w, ${getClientImageUrl(coverPhotoId, "1200w.avif")} 1200w`}
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                />
                <img
                  src={getClientImageUrl(coverPhotoId, "600w.webp")}
                  srcSet={`${getClientImageUrl(coverPhotoId, "600w.webp")} 600w, ${getClientImageUrl(coverPhotoId, "1200w.webp")} 1200w`}
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                  alt={album.title}
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
                />
              </picture>
            ) : (
              <ImagePlaceholder />
            )}
          </div>
          <h2 className="mt-3 text-xs font-medium uppercase tracking-[0.2em] text-text-secondary transition-colors group-hover:text-text-primary">
            {album.title}
          </h2>
        </Link>
      ))}
    </div>
  );
}
