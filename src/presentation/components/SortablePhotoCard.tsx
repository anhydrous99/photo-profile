"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { getClientImageUrl } from "@/lib/imageLoader";

interface SortablePhotoCardProps {
  photo: {
    id: string;
    title: string | null;
    originalFilename: string;
    blurDataUrl: string | null;
  };
  isCover: boolean;
  onSetCover: (photoId: string) => void;
}

/**
 * Sortable photo card for admin album detail grid
 *
 * Features:
 * - Drag-to-reorder via dnd-kit useSortable
 * - Cover photo badge indicator
 * - "Set as cover" button for non-cover photos
 */
export function SortablePhotoCard({
  photo,
  isCover,
  onSetCover,
}: SortablePhotoCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: photo.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative">
      {/* Cover badge */}
      {isCover && (
        <div className="absolute top-2 left-2 z-10 rounded bg-accent px-2 py-0.5 text-xs font-medium text-white">
          Cover
        </div>
      )}

      {/* Draggable photo area */}
      <div {...attributes} {...listeners} className="cursor-grab">
        <div className="aspect-square overflow-hidden rounded-lg border border-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={getClientImageUrl(photo.id, "300w.webp")}
            alt={photo.title || photo.originalFilename}
            className="h-full w-full object-cover"
          />
        </div>
      </div>

      {/* Filename label */}
      <p className="mt-1 truncate text-xs text-text-secondary">
        {photo.title || photo.originalFilename}
      </p>

      {/* Set as cover / Current cover indicator */}
      {isCover ? (
        <p className="text-xs font-medium text-accent">Current cover</p>
      ) : (
        <button
          type="button"
          onClick={() => onSetCover(photo.id)}
          className="text-xs text-text-secondary hover:text-accent"
        >
          Set as cover
        </button>
      )}
    </div>
  );
}
