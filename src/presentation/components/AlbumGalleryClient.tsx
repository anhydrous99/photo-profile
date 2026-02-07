"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { ExifData } from "@/domain/entities/Photo";
import { Breadcrumb } from "@/presentation/components/Breadcrumb";
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

interface AlbumGalleryClientProps {
  album: {
    id: string;
    title: string;
    description: string | null;
  };
  photos: PhotoData[];
}

export function AlbumGalleryClient({ album, photos }: AlbumGalleryClientProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const handlePhotoClick = (index: number) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  const handleLightboxClose = () => {
    setLightboxOpen(false);
  };

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
          {photos.map((photo, index) => (
            <button
              key={photo.id}
              type="button"
              onClick={() => handlePhotoClick(index)}
              className="group relative aspect-square cursor-pointer overflow-hidden rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              aria-label={`View ${photo.title || photo.originalFilename}`}
            >
              <div className="absolute inset-0 transition-transform duration-300 group-hover:scale-105">
                <FadeImage
                  photoId={photo.id}
                  alt={photo.title || photo.originalFilename}
                  blurDataUrl={photo.blurDataUrl}
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                />
              </div>
            </button>
          ))}
        </div>
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
    </main>
  );
}
