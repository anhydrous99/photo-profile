"use client";

import dynamic from "next/dynamic";
import { useState, useEffect } from "react";
import type { PhotoData } from "@/domain/entities/Photo";
import { Breadcrumb } from "@/presentation/components/Breadcrumb";
import { JustifiedGallery } from "./JustifiedGallery";
import { getSlug } from "@/lib/getSlug";

// Dynamic import - lightbox bundle only loads when user clicks
const PhotoLightbox = dynamic(
  () => import("./PhotoLightbox").then((mod) => mod.PhotoLightbox),
  { ssr: false },
);

interface AlbumGalleryClientProps {
  album: {
    id: string;
    title: string;
    description: string | null;
  };
  photos: PhotoData[];
  initialPhotoSlug?: string;
}

export function AlbumGalleryClient({
  album,
  photos,
  initialPhotoSlug,
}: AlbumGalleryClientProps) {
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

  const handlePhotoClick = (index: number) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
    const slug = getSlug(photos[index].id);
    window.history.replaceState(null, "", `/albums/${album.id}/photo/${slug}`);
  };

  const handleIndexChange = (newIndex: number) => {
    setLightboxIndex(newIndex);
    const slug = getSlug(photos[newIndex].id);
    window.history.replaceState(null, "", `/albums/${album.id}/photo/${slug}`);
  };

  const handleLightboxClose = () => {
    window.history.replaceState(null, "", `/albums/${album.id}`);
    setLightboxOpen(false);
  };

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-10 sm:px-6 md:py-16 lg:px-8">
      <Breadcrumb
        items={[
          { label: "Home", href: "/" },
          { label: "Albums", href: "/albums" },
          { label: album.title },
        ]}
      />

      <header className="mb-8 md:mb-12">
        <h1 className="text-3xl font-medium tracking-tight text-text-primary md:text-5xl">
          {album.title}
        </h1>
        {album.description && (
          <p className="mt-3 max-w-2xl text-base text-text-secondary">
            {album.description}
          </p>
        )}
        {photos.length > 0 && (
          <p className="mt-4 text-xs font-medium uppercase tracking-[0.2em] text-text-tertiary">
            {photos.length} {photos.length === 1 ? "Photograph" : "Photographs"}
          </p>
        )}
      </header>

      {photos.length === 0 ? (
        <p className="py-12 text-center text-text-secondary">
          No photos in this album yet.
        </p>
      ) : (
        <JustifiedGallery photos={photos} onPhotoClick={handlePhotoClick} />
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
    </main>
  );
}
