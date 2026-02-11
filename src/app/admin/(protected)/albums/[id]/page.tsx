import { notFound } from "next/navigation";
import {
  DynamoDBAlbumRepository,
  DynamoDBPhotoRepository,
} from "@/infrastructure/database/dynamodb/repositories";
import { AlbumDetailClient } from "./AlbumDetailClient";

interface PageProps {
  params: Promise<{ id: string }>;
}

const photoRepository = new DynamoDBPhotoRepository();
const albumRepository = new DynamoDBAlbumRepository(photoRepository);
// photoRepository already instantiated above

/**
 * Admin Album Detail Page (Server Component)
 *
 * Fetches album and its photos, then passes to client component
 * for interactive drag-drop reordering and cover photo selection.
 */
export default async function AlbumDetailPage({ params }: PageProps) {
  const { id } = await params;

  const [album, allPhotos] = await Promise.all([
    albumRepository.findById(id),
    photoRepository.findByAlbumId(id),
  ]);

  if (!album) {
    notFound();
  }

  // Only show ready photos (same filter as public page)
  const photos = allPhotos.filter((photo) => photo.status === "ready");

  return (
    <div className="p-8">
      <AlbumDetailClient
        album={album}
        photos={photos.map((p) => ({
          id: p.id,
          title: p.title,
          originalFilename: p.originalFilename,
          blurDataUrl: p.blurDataUrl,
        }))}
      />
    </div>
  );
}
