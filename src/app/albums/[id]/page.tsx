import { notFound } from "next/navigation";
import { AlbumGalleryClient } from "@/presentation/components/AlbumGalleryClient";
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

  // Pass only serializable data to client component
  return (
    <AlbumGalleryClient
      album={{
        id: album.id,
        title: album.title,
        description: album.description,
      }}
      photos={photos.map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        originalFilename: p.originalFilename,
      }))}
    />
  );
}
