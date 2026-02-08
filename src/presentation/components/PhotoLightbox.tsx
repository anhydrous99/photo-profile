"use client";

import { useState } from "react";
import Lightbox from "yet-another-react-lightbox";
import Captions from "yet-another-react-lightbox/plugins/captions";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import Fullscreen from "yet-another-react-lightbox/plugins/fullscreen";
import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/captions.css";
import type { ExifData } from "@/domain/entities/Photo";
import { ExifPanel } from "./ExifPanel";
import { getClientImageUrl } from "@/lib/imageLoader";

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

const DERIVATIVE_WIDTHS = [300, 600, 1200, 2400] as const;

function buildSrcSet(photoId: string, width: number, height: number) {
  const aspectRatio = height / width;
  return DERIVATIVE_WIDTHS.map((w) => ({
    src: getClientImageUrl(photoId, `${w}w.webp`),
    width: w,
    height: Math.round(w * aspectRatio),
  }));
}

export function PhotoLightbox({
  photos,
  index,
  onClose,
  onIndexChange,
}: PhotoLightboxProps) {
  const [exifOpen, setExifOpen] = useState(false);
  const [currentZoom, setCurrentZoom] = useState(1);

  // Current photo's EXIF data (updates automatically when index changes)
  const currentExif = photos[index]?.exifData ?? null;

  // Hide EXIF panel when zoomed in
  const effectiveExifVisible = exifOpen && currentZoom <= 1;

  // Transform photo data to YARL slide format
  // Use 600w as baseline - guaranteed to exist for all photos
  // Only include srcSet when dimensions are known (graceful fallback for legacy photos)
  const slides = photos.map((photo) => ({
    src: getClientImageUrl(photo.id, "600w.webp"),
    alt: photo.title || photo.originalFilename,
    ...(photo.width && photo.height
      ? {
          width: photo.width,
          height: photo.height,
          srcSet: buildSrcSet(photo.id, photo.width, photo.height),
        }
      : {}),
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
        plugins={[Zoom, Fullscreen, Captions]}
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
        // Animation timing (includes zoom)
        animation={{
          fade: 200,
          swipe: 300,
          zoom: 300,
        }}
        // Controller behavior - pull-down close for mobile (LBOX-02)
        controller={{
          closeOnPullDown: true,
          closeOnPullUp: false,
          closeOnBackdropClick: false,
        }}
        // Zoom configuration (LBOX-03)
        zoom={{
          maxZoomPixelRatio: 1,
          doubleClickMaxStops: 2,
          scrollToZoom: false,
          pinchZoomV4: true,
        }}
        // Fullscreen configuration (LBOX-04)
        fullscreen={{
          auto: false,
        }}
        // Captions configuration
        captions={{
          descriptionTextAlign: "center",
          descriptionMaxLines: 5,
        }}
        // Toolbar with zoom, fullscreen, EXIF info toggle, and close button
        toolbar={{
          buttons: [
            "zoom",
            "fullscreen",
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
          view: ({ index: newIndex }) => {
            onIndexChange?.(newIndex);
            setCurrentZoom(1); // Reset zoom tracking on slide change
          },
          zoom: ({ zoom }) => setCurrentZoom(zoom),
        }}
      />
      <ExifPanel exifData={currentExif} visible={effectiveExifVisible} />
    </>
  );
}
