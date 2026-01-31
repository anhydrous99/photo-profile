import Image from "next/image";
import { notFound } from "next/navigation";
import { Breadcrumb } from "@/presentation/components/Breadcrumb";
import { SQLiteAlbumRepository } from "@/infrastructure/database/repositories/SQLiteAlbumRepository";
import { SQLitePhotoRepository } from "@/infrastructure/database/repositories/SQLitePhotoRepository";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AlbumPage({ params }: PageProps) {
  const { id } = await params;

  const albumRepo = new SQLiteAlbumRepository();
  const photoRepo = new SQLitePhotoRepository();

  // Fetch album and photos in parallel
  const [album, allPhotos] = await Promise.all([
    albumRepo.findById(id),
    photoRepo.findByAlbumId(id),
  ]);

  // 404 if album doesn't exist or isn't published
  if (!album || !album.isPublished) {
    notFound();
  }

  // Filter to only show ready photos
  const photos = allPhotos.filter((photo) => photo.status === "ready");

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Breadcrumb
        items={[
          { label: "Home", href: "/" },
          { label: "Albums", href: "/albums" },
          { label: album.title },
        ]}
      />

      <h1 className="text-3xl font-semibold text-gray-900">{album.title}</h1>

      {album.description && (
        <p className="mt-2 mb-8 text-gray-600">{album.description}</p>
      )}

      {!album.description && <div className="mb-8" />}

      {photos.length === 0 ? (
        <p className="py-12 text-center text-gray-500">
          No photos in this album yet.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {photos.map((photo) => (
            <div
              key={photo.id}
              data-photo-id={photo.id}
              className="group relative aspect-square cursor-pointer overflow-hidden rounded-lg"
            >
              <Image
                src={`/api/images/${photo.id}/600w.webp`}
                alt={photo.title || photo.originalFilename}
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                className="object-cover transition-transform duration-300 group-hover:scale-105"
              />
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
