"use client";

import { RowsPhotoAlbum } from "react-photo-album";
import type {
  Photo as AlbumPhoto,
  RenderImageContext,
  RenderImageProps,
} from "react-photo-album";
import "react-photo-album/rows.css";
import type { PhotoData } from "@/domain/entities/Photo";
import { FadeImage } from "./FadeImage";
import { VideoOverlay } from "./VideoOverlay";

/** react-photo-album photo extended with the original domain record. */
type GalleryPhoto = AlbumPhoto & { data: PhotoData };

interface JustifiedGalleryProps {
  photos: PhotoData[];
  /** Called with the photo's index in `photos` when a tile is activated. */
  onPhotoClick: (index: number) => void;
  /** Responsive `sizes` hint passed through to each image. */
  sizes?: string;
}

const DEFAULT_SIZES =
  "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw";

// Legacy records can have null dimensions — fall back to a neutral 3:2 so the
// justified layout still has an aspect ratio to work with.
const FALLBACK_WIDTH = 1500;
const FALLBACK_HEIGHT = 1000;

export function JustifiedGallery({
  photos,
  onPhotoClick,
  sizes = DEFAULT_SIZES,
}: JustifiedGalleryProps) {
  const slides: GalleryPhoto[] = photos.map((photo) => ({
    // `src` is required by react-photo-album but unused for rendering —
    // FadeImage builds its own AVIF/WebP URLs from the photo id. Width/height
    // drive the row-justification math.
    src: photo.id,
    width: photo.width ?? FALLBACK_WIDTH,
    height: photo.height ?? FALLBACK_HEIGHT,
    key: photo.id,
    label: photo.title || photo.originalFilename,
    data: photo,
  }));

  return (
    <RowsPhotoAlbum
      photos={slides}
      targetRowHeight={300}
      rowConstraints={{ singleRowMaxHeight: 480 }}
      spacing={12}
      defaultContainerWidth={1280}
      onClick={({ index }) => onPhotoClick(index)}
      componentsProps={{
        // The library renders each photo as a <button> when onClick is set.
        // Do NOT set width/display here — that would override the computed
        // flex-item width and break the row layout.
        button: {
          className:
            "group relative overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-ring-offset",
        },
      }}
      render={{
        image: (
          _props: RenderImageProps,
          { photo }: RenderImageContext<GalleryPhoto>,
        ) => {
          const { data } = photo;
          return (
            <div
              className="relative w-full bg-surface-secondary"
              style={{ aspectRatio: `${photo.width} / ${photo.height}` }}
            >
              <FadeImage
                photoId={data.id}
                alt={data.title || data.originalFilename}
                blurDataUrl={data.blurDataUrl}
                sizes={sizes}
                maxWidth={data.width ?? undefined}
                className="transition-transform duration-500 ease-out group-hover:scale-[1.03]"
              />
              {data.mediaType === "video" && (
                <VideoOverlay durationMs={data.durationMs} />
              )}
            </div>
          );
        },
      }}
    />
  );
}
