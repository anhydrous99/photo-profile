import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AlbumGalleryClient } from "@/presentation/components/AlbumGalleryClient";
import { SQLiteAlbumRepository } from "@/infrastructure/database/repositories/SQLiteAlbumRepository";
import { SQLitePhotoRepository } from "@/infrastructure/database/repositories/SQLitePhotoRepository";
import { getImageUrl } from "@/infrastructure/storage";

interface PageProps {
  params: Promise<{ id: string }>;
}

const getAlbum = cache(async (id: string) => {
  const albumRepo = new SQLiteAlbumRepository();
  return albumRepo.findById(id);
});

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const album = await getAlbum(id);

  if (!album || !album.isPublished) {
    return { title: "Album Not Found" };
  }

  const metadata: Metadata = {
    title: album.title,
    description: album.description || `Photos from ${album.title}`,
    openGraph: {
      title: album.title,
      description: album.description || `Photos from ${album.title}`,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
    },
  };

  // Use cover photo or first photo as OG image
  if (album.coverPhotoId) {
    const ogImageUrl = getImageUrl(album.coverPhotoId, "1200w.webp");
    metadata.openGraph!.images = [
      { url: ogImageUrl, width: 1200, type: "image/webp" },
    ];
    metadata.twitter!.images = [ogImageUrl];
  } else {
    const photoRepo = new SQLitePhotoRepository();
    const photos = await photoRepo.findByAlbumId(id);
    const firstReady = photos.find((p) => p.status === "ready");
    if (firstReady) {
      const ogImageUrl = getImageUrl(firstReady.id, "1200w.webp");
      metadata.openGraph!.images = [
        { url: ogImageUrl, width: 1200, type: "image/webp" },
      ];
      metadata.twitter!.images = [ogImageUrl];
    }
  }

  return metadata;
}

export default async function AlbumPage({ params }: PageProps) {
  const { id } = await params;

  const album = await getAlbum(id);
  const photoRepo = new SQLitePhotoRepository();
  const allPhotos = await photoRepo.findByAlbumId(id);

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
        blurDataUrl: p.blurDataUrl,
        exifData: p.exifData,
        width: p.width,
        height: p.height,
      }))}
    />
  );
}
