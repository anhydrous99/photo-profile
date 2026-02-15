"use client";

import Image from "next/image";
import { useState } from "react";

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
      <Image
        src={`/api/images/${photoId}${maxWidth ? `?maxWidth=${maxWidth}` : ""}`}
        alt={alt}
        fill
        sizes={sizes}
        preload={preload}
        draggable={false}
        className={`object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}
