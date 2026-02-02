"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useState } from "react";

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
}

interface HomepageClientProps {
  photos: PhotoData[];
}

export function HomepageClient({ photos }: HomepageClientProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // Split photos: first = hero, rest = grid
  const heroPhoto = photos[0];
  const gridPhotos = photos.slice(1);

  const handlePhotoClick = (index: number) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  const handleLightboxClose = () => {
    setLightboxOpen(false);
  };

  return (
    <>
      {/* Hero photo */}
      <section className="mb-8">
        <button
          type="button"
          onClick={() => handlePhotoClick(0)}
          className="relative aspect-[3/2] w-full cursor-pointer overflow-hidden focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          aria-label={`View ${heroPhoto.title || heroPhoto.originalFilename}`}
        >
          <Image
            src={`/api/images/${heroPhoto.id}/600w.webp`}
            alt={heroPhoto.title || heroPhoto.originalFilename}
            fill
            sizes="(max-width: 1280px) 100vw, 1152px"
            className="object-cover"
            priority
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
              className="relative aspect-square cursor-pointer overflow-hidden focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              aria-label={`View ${photo.title || photo.originalFilename}`}
            >
              <Image
                src={`/api/images/${photo.id}/600w.webp`}
                alt={photo.title || photo.originalFilename}
                fill
                sizes="(max-width: 768px) 50vw, 33vw"
                className="object-cover"
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
          onIndexChange={setLightboxIndex}
        />
      )}
    </>
  );
}
