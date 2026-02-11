import Image from "next/image";
import Link from "next/link";
import {
  DynamoDBAlbumRepository,
  DynamoDBPhotoRepository,
} from "@/infrastructure/database/dynamodb/repositories";
import { Breadcrumb } from "@/presentation/components/Breadcrumb";
import type { Album } from "@/domain/entities/Album";

export const dynamic = "force-dynamic";

// Placeholder icon for albums without photos
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
  const photoRepo = new DynamoDBPhotoRepository();
  const albumRepo = new DynamoDBAlbumRepository(photoRepo);

  const albums = await albumRepo.findPublished();

  // Sort by sortOrder (admin's drag-drop order)
  albums.sort((a, b) => a.sortOrder - b.sortOrder);

  // Resolve cover photos
  const albumsWithCovers = await Promise.all(
    albums.map(async (album) => {
      let coverPhotoId = album.coverPhotoId;

      // If no explicit cover, use first photo from album
      if (!coverPhotoId) {
        const photos = await photoRepo.findByAlbumId(album.id);
        const readyPhoto = photos.find((p) => p.status === "ready");
        coverPhotoId = readyPhoto?.id ?? null;
      }

      return { album, coverPhotoId };
    }),
  );

  return albumsWithCovers;
}

export default async function AlbumsPage() {
  const albumsWithCovers = await getAlbumsWithCovers();

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Albums" }]} />
      <h1 className="mb-8 text-2xl font-semibold text-text-primary">Albums</h1>

      {albumsWithCovers.length === 0 ? (
        <p className="text-center text-text-secondary">No albums available.</p>
      ) : (
        <div className="space-y-4">
          {albumsWithCovers.map(({ album, coverPhotoId }) => (
            <Link
              key={album.id}
              href={`/albums/${album.id}`}
              className="flex items-center gap-4 rounded-lg p-2 transition-colors hover:bg-surface-hover"
            >
              <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg">
                {coverPhotoId ? (
                  <Image
                    src={`/api/images/${coverPhotoId}`}
                    alt={album.title}
                    fill
                    sizes="80px"
                    className="object-cover"
                  />
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
      )}
    </main>
  );
}
