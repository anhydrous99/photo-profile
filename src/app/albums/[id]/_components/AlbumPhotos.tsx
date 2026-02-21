import { connection } from "next/server";
import { AlbumGalleryClient } from "@/presentation/components/AlbumGalleryClient";
import { getPhotoRepository } from "@/infrastructure/database/dynamodb/repositories";

interface AlbumPhotosProps {
  album: {
    id: string;
    title: string;
    description: string | null;
  };
}

export async function AlbumPhotos({ album }: AlbumPhotosProps) {
  await connection();

  const photoRepo = getPhotoRepository();
  const allPhotos = await photoRepo.findByAlbumId(album.id);

  // Filter to only show ready photos
  const photos = allPhotos.filter((photo) => photo.status === "ready");

  return (
    <AlbumGalleryClient
      album={album}
      photos={photos.map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        originalFilename: p.originalFilename,
        blurDataUrl: p.blurDataUrl,
        exifData: p.exifData,
        width: p.width,
        height: p.height,
      }))}
    />
  );
}
