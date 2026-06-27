"use client";

import dynamic from "next/dynamic";
import { useState, useEffect } from "react";
import type { PhotoData } from "@/domain/entities/Photo";
import { FadeImage } from "./FadeImage";
import { VideoOverlay } from "./VideoOverlay";
import { JustifiedGallery } from "./JustifiedGallery";
import { getSlug } from "@/lib/getSlug";

// Dynamic import - lightbox bundle only loads when user clicks
const PhotoLightbox = dynamic(
  () => import("./PhotoLightbox").then((mod) => mod.PhotoLightbox),
  { ssr: false },
);

interface HomepageClientProps {
  photos: PhotoData[];
  initialPhotoSlug?: string;
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

  // Intercept Ctrl+S / Cmd+S to prevent browser save dialog
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

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
      {/* Hero photo — rendered at its true aspect ratio, capped at 80vh */}
      <section className="mb-10 md:mb-16">
        <button
          type="button"
          onClick={() => handlePhotoClick(0)}
          className="group relative block max-h-[80vh] w-full cursor-pointer overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-ring-offset"
          style={{
            aspectRatio: `${heroPhoto.width ?? 3} / ${heroPhoto.height ?? 2}`,
          }}
          aria-label={`View ${heroPhoto.title || heroPhoto.originalFilename}`}
        >
          <FadeImage
            photoId={heroPhoto.id}
            alt={heroPhoto.title || heroPhoto.originalFilename}
            blurDataUrl={heroPhoto.blurDataUrl}
            sizes="100vw"
            preload
            maxWidth={heroPhoto.width ?? undefined}
            className="transition-transform duration-700 ease-out group-hover:scale-[1.02]"
          />
          {heroPhoto.mediaType === "video" && (
            <VideoOverlay durationMs={heroPhoto.durationMs} />
          )}
        </button>
      </section>

      {/* Remaining photos — justified rows preserve each photo's composition */}
      {gridPhotos.length > 0 && (
        <JustifiedGallery
          photos={gridPhotos}
          onPhotoClick={(index) => handlePhotoClick(index + 1)}
        />
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
