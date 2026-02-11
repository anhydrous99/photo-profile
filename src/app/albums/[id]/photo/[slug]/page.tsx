import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AlbumGalleryClient } from "@/presentation/components/AlbumGalleryClient";
import {
  DynamoDBAlbumRepository,
  DynamoDBPhotoRepository,
} from "@/infrastructure/database/dynamodb/repositories";
import { getImageUrl } from "@/infrastructure/storage";

interface PageProps {
  params: Promise<{ id: string; slug: string }>;
}

const photoRepo = new DynamoDBPhotoRepository();

const getAlbum = cache(async (id: string) => {
  const albumRepo = new DynamoDBAlbumRepository(photoRepo);
  return albumRepo.findById(id);
});

const getAlbumPhotos = cache(async (albumId: string) => {
  const allPhotos = await photoRepo.findByAlbumId(albumId);
  return allPhotos.filter((p) => p.status === "ready");
});

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id, slug } = await params;
  const album = await getAlbum(id);

  if (!album || !album.isPublished) {
    return { title: "Photo Not Found" };
  }

  const photo = await photoRepo.findBySlugPrefix(slug);

  if (!photo) {
    return { title: "Photo Not Found" };
  }

  // Build description from EXIF data if available
  let description = photo.description || `A photo from ${album.title}`;
  if (photo.exifData) {
    const exifParts: string[] = [];
    if (photo.exifData.cameraModel) exifParts.push(photo.exifData.cameraModel);
    if (photo.exifData.focalLength)
      exifParts.push(`${photo.exifData.focalLength}mm`);
    if (photo.exifData.aperture) exifParts.push(`f/${photo.exifData.aperture}`);
    if (photo.exifData.shutterSpeed)
      exifParts.push(photo.exifData.shutterSpeed);
    if (photo.exifData.iso) exifParts.push(`ISO ${photo.exifData.iso}`);
    if (exifParts.length > 0) {
      description = photo.description
        ? `${photo.description} — ${exifParts.join(" | ")}`
        : `${album.title} — ${exifParts.join(" | ")}`;
    }
  }

  const ogImageUrl = getImageUrl(photo.id, "1200w.webp");

  return {
    title: photo.title || album.title,
    description,
    openGraph: {
      title: photo.title || album.title,
      description,
      type: "website",
      images: [{ url: ogImageUrl, width: 1200, type: "image/webp" }],
    },
    twitter: {
      card: "summary_large_image",
      title: photo.title || album.title,
      description,
      images: [ogImageUrl],
    },
  };
}

export default async function AlbumPhotoPage({ params }: PageProps) {
  const { id, slug } = await params;

  const album = await getAlbum(id);

  // 404 if album doesn't exist or isn't published
  if (!album || !album.isPublished) {
    notFound();
  }

  const photos = await getAlbumPhotos(id);

  // Verify the slug matches a photo in this album
  const matchingPhoto = photos.find((p) => p.id.startsWith(slug));
  if (!matchingPhoto) {
    notFound();
  }

  // Render same layout as album page, with lightbox pre-opened on this photo
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
      initialPhotoSlug={slug}
    />
  );
}
