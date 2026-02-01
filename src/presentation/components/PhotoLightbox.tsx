"use client";

import Lightbox from "yet-another-react-lightbox";
import Captions from "yet-another-react-lightbox/plugins/captions";
import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/captions.css";

export interface PhotoData {
  id: string;
  title: string | null;
  description: string | null;
  originalFilename: string;
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
  // Transform photo data to YARL slide format
  const slides = photos.map((photo) => ({
    src: `/api/images/${photo.id}/2400w.webp`,
    alt: photo.title || photo.originalFilename,
    title: photo.title || undefined,
    description: photo.description || undefined,
  }));

  return (
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
      // Lifecycle callbacks
      on={{
        view: ({ index: newIndex }) => onIndexChange?.(newIndex),
      }}
    />
  );
}
