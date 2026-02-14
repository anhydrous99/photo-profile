"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { ExifData } from "@/domain/entities/Photo";
import { FadeImage } from "./FadeImage";

// Dynamic import - lightbox bundle only loads when user clicks
const PhotoLightbox = dynamic(
  () => import("./PhotoLightbox").then((mod) => mod.PhotoLightbox),
  { ssr: false },
);

export interface PhotoData {
  id: string;
  title: string | null;
  description: string | null;
  originalFilename: string;
  blurDataUrl: string | null;
  exifData?: ExifData | null;
  width: number | null;
  height: number | null;
}

interface HomepageClientProps {
  photos: PhotoData[];
  initialPhotoSlug?: string;
}

function getSlug(photoId: string): string {
  return photoId.slice(0, 8);
}

export function HomepageClient({
  photos,
  initialPhotoSlug,
}: HomepageClientProps) {
  const [lightboxIndex, setLightboxIndex] = useState(() => {
    if (!initialPhotoSlug) return 0;
    const idx = photos.findIndex((p) => p.id.startsWith(initialPhotoSlug));
    return idx >= 0 ? idx : 0;
  });
  const [lightboxOpen, setLightboxOpen] = useState(() => {
    if (!initialPhotoSlug) return false;
    return photos.some((p) => p.id.startsWith(initialPhotoSlug));
  });

  // Split photos: first = hero, rest = grid
  const heroPhoto = photos[0];
  const gridPhotos = photos.slice(1);

  const handlePhotoClick = (index: number) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
    const slug = getSlug(photos[index].id);
    window.history.replaceState(null, "", `/photo/${slug}`);
  };

  const handleIndexChange = (newIndex: number) => {
    setLightboxIndex(newIndex);
    const slug = getSlug(photos[newIndex].id);
    window.history.replaceState(null, "", `/photo/${slug}`);
  };

  const handleLightboxClose = () => {
    window.history.replaceState(null, "", "/");
    setLightboxOpen(false);
  };

  return (
    <>
      {/* Hero photo */}
      <section className="mb-8">
        <button
          type="button"
          onClick={() => handlePhotoClick(0)}
          className="relative aspect-[3/2] w-full cursor-pointer overflow-hidden focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-ring-offset"
          aria-label={`View ${heroPhoto.title || heroPhoto.originalFilename}`}
        >
          <FadeImage
            photoId={heroPhoto.id}
            alt={heroPhoto.title || heroPhoto.originalFilename}
            blurDataUrl={heroPhoto.blurDataUrl}
            sizes="(max-width: 1280px) 100vw, 1152px"
            preload
            maxWidth={heroPhoto.width ?? undefined}
          />
        </button>
      </section>

      {/* Grid photos */}
      {gridPhotos.length > 0 && (
        <section className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:gap-6">
          {gridPhotos.map((photo, index) => (
            <button
              key={photo.id}
              type="button"
              onClick={() => handlePhotoClick(index + 1)}
              className="relative aspect-square cursor-pointer overflow-hidden focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-ring-offset"
              aria-label={`View ${photo.title || photo.originalFilename}`}
            >
              <FadeImage
                photoId={photo.id}
                alt={photo.title || photo.originalFilename}
                blurDataUrl={photo.blurDataUrl}
                sizes="(max-width: 768px) 50vw, 33vw"
                maxWidth={photo.width ?? undefined}
              />
            </button>
          ))}
        </section>
      )}

      {/* Lightbox portal - only rendered when open */}
      {lightboxOpen && (
        <PhotoLightbox
          photos={photos}
          index={lightboxIndex}
          onClose={handleLightboxClose}
          onIndexChange={handleIndexChange}
        />
      )}
    </>
  );
}
