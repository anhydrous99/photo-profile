"use client";

import { useState } from "react";
import { getClientImageUrl, buildSrcSet } from "@/lib/imageLoader";
import { THUMBNAIL_SIZES } from "@/lib/constants";

interface FadeImageProps {
  photoId: string;
  alt: string;
  blurDataUrl?: string | null;
  sizes: string;
  preload?: boolean;
  className?: string;
  maxWidth?: number;
}

export function FadeImage({
  photoId,
  alt,
  blurDataUrl,
  sizes,
  preload,
  className,
  maxWidth,
}: FadeImageProps) {
  const [loaded, setLoaded] = useState(false);

  const fallbackWidth = maxWidth
    ? (THUMBNAIL_SIZES.filter((w) => w <= maxWidth).at(-1) ??
      THUMBNAIL_SIZES[0])
    : THUMBNAIL_SIZES[THUMBNAIL_SIZES.length - 1];

  return (
    <div
      className={`absolute inset-0 overflow-hidden select-none ${className ?? ""}`}
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      style={{ WebkitTouchCallout: "none" }}
    >
      {/* Blur placeholder background */}
      {blurDataUrl && (
        <img
          src={blurDataUrl}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full scale-110 object-cover blur-lg"
        />
      )}

      {/* Full-resolution image with fade-in */}
      <picture>
        <source
          type="image/avif"
          srcSet={buildSrcSet(photoId, "avif", maxWidth)}
          sizes={sizes}
        />
        <img
          src={getClientImageUrl(photoId, `${fallbackWidth}w.webp`)}
          srcSet={buildSrcSet(photoId, "webp", maxWidth)}
          sizes={sizes}
          alt={alt}
          loading={preload ? "eager" : "lazy"}
          fetchPriority={preload ? "high" : undefined}
          draggable={false}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
          onLoad={() => setLoaded(true)}
        />
      </picture>
    </div>
  );
}
