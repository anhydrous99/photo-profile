"use client";

import { useState } from "react";
import Lightbox from "yet-another-react-lightbox";
import Captions from "yet-another-react-lightbox/plugins/captions";
import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/captions.css";
import type { ExifData } from "@/domain/entities/Photo";
import { ExifPanel } from "./ExifPanel";

export interface PhotoData {
  id: string;
  title: string | null;
  description: string | null;
  originalFilename: string;
  exifData?: ExifData | null;
  width: number | null;
  height: number | null;
}

interface PhotoLightboxProps {
  photos: PhotoData[];
  index: number;
  onClose: () => void;
  onIndexChange?: (index: number) => void;
}

export function PhotoLightbox({
  photos,
  index,
  onClose,
  onIndexChange,
}: PhotoLightboxProps) {
  const [exifOpen, setExifOpen] = useState(false);

  // Current photo's EXIF data (updates automatically when index changes)
  const currentExif = photos[index]?.exifData ?? null;

  // Transform photo data to YARL slide format
  // Use 600w as baseline - guaranteed to exist for all photos
  // (larger sizes may not exist if original was smaller than target)
  const slides = photos.map((photo) => ({
    src: `/api/images/${photo.id}/600w.webp`,
    alt: photo.title || photo.originalFilename,
    title: photo.title || undefined,
    description: photo.description || undefined,
  }));

  return (
    <>
      <Lightbox
        open={true}
        close={onClose}
        index={index}
        slides={slides}
        plugins={[Captions]}
        // Solid black background (phase decision)
        styles={{
          container: { backgroundColor: "rgb(0, 0, 0)" },
        }}
        // Image display configuration
        carousel={{
          padding: "5%",
          spacing: "10%",
          imageFit: "contain",
          preload: 2,
        }}
        // Animation timing
        animation={{
          fade: 200,
          swipe: 300,
        }}
        // Controller behavior - X button only (phase decision)
        controller={{
          closeOnBackdropClick: false,
          closeOnPullDown: false,
          closeOnPullUp: false,
        }}
        // Captions configuration
        captions={{
          descriptionTextAlign: "center",
          descriptionMaxLines: 5,
        }}
        // Toolbar with EXIF info toggle before close button
        toolbar={{
          buttons: [
            <button
              key="exif-info"
              type="button"
              className="yarl__button"
              onClick={() => setExifOpen((prev) => !prev)}
              aria-label="Toggle photo information"
              style={{ filter: exifOpen ? "none" : "brightness(0.8)" }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                width={24}
                height={24}
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx={12} cy={12} r={10} />
                <line x1={12} y1={16} x2={12} y2={12} />
                <line x1={12} y1={8} x2={12.01} y2={8} />
              </svg>
            </button>,
            "close",
          ],
        }}
        // Lifecycle callbacks
        on={{
          view: ({ index: newIndex }) => onIndexChange?.(newIndex),
        }}
      />
      <ExifPanel exifData={currentExif} visible={exifOpen} />
    </>
  );
}
