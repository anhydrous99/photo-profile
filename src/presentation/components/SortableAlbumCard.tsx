"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Album } from "@/domain/entities";

export interface AlbumWithCount extends Album {
  photoCount: number;
}

interface SortableAlbumCardProps {
  album: AlbumWithCount;
  onEdit: () => void;
  onDelete: () => void;
}

/**
 * Draggable album card for sortable album list
 *
 * Features:
 * - Drag handle for reordering
 * - Album title, description preview, photo count
 * - Tags display as pills
 * - Edit and Delete action buttons
 */
export function SortableAlbumCard({
  album,
  onEdit,
  onDelete,
}: SortableAlbumCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: album.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const tags = album.tags ? album.tags.split(",").map((t) => t.trim()) : [];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-4 rounded-lg border bg-white p-4 ${
        isDragging ? "border-blue-300 shadow-lg" : "border-gray-200"
      }`}
    >
      {/* Drag handle */}
      <button
        type="button"
        className="cursor-grab touch-none text-gray-400 hover:text-gray-600"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
      >
        <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
          <circle cx="9" cy="6" r="1.5" />
          <circle cx="15" cy="6" r="1.5" />
          <circle cx="9" cy="12" r="1.5" />
          <circle cx="15" cy="12" r="1.5" />
          <circle cx="9" cy="18" r="1.5" />
          <circle cx="15" cy="18" r="1.5" />
        </svg>
      </button>

      {/* Album info */}
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-medium text-gray-900">{album.title}</h3>
        {album.description && (
          <p className="mt-1 line-clamp-2 text-sm text-gray-500">
            {album.description}
          </p>
        )}
        {tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Photo count */}
      <div className="flex-shrink-0 text-center">
        <div className="text-2xl font-semibold text-gray-700">
          {album.photoCount}
        </div>
        <div className="text-xs text-gray-500">
          photo{album.photoCount === 1 ? "" : "s"}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-shrink-0 gap-2">
        <button
          type="button"
          onClick={onEdit}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
