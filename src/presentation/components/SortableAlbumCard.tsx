"use client";

import { useState } from "react";
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
  onManage?: () => void;
  onPublishToggle?: (albumId: string, isPublished: boolean) => Promise<void>;
}

/**
 * Draggable album card for sortable album list
 *
 * Features:
 * - Drag handle for reordering
 * - Album title, description preview, photo count
 * - Tags display as pills
 * - Publish toggle with visual indicator
 * - Edit and Delete action buttons
 */
export function SortableAlbumCard({
  album,
  onEdit,
  onDelete,
  onManage,
  onPublishToggle,
}: SortableAlbumCardProps) {
  const [isToggling, setIsToggling] = useState(false);
  const [optimisticPublished, setOptimisticPublished] = useState(
    album.isPublished,
  );

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: album.id });

  const handlePublishToggle = async () => {
    if (!onPublishToggle || isToggling) return;

    const newValue = !optimisticPublished;
    setOptimisticPublished(newValue);
    setIsToggling(true);

    try {
      await onPublishToggle(album.id, newValue);
    } catch {
      // Revert on error
      setOptimisticPublished(!newValue);
    } finally {
      setIsToggling(false);
    }
  };

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
      className={`flex items-center gap-4 rounded-lg border bg-surface p-4 ${
        isDragging ? "border-blue-300 shadow-lg" : "border-border"
      }`}
    >
      {/* Drag handle */}
      <button
        type="button"
        className="cursor-grab touch-none text-text-tertiary hover:text-text-secondary"
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
        <h3 className="truncate font-medium text-text-primary">
          {album.title}
        </h3>
        {album.description && (
          <p className="mt-1 line-clamp-2 text-sm text-text-secondary">
            {album.description}
          </p>
        )}
        {tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-surface-secondary px-2 py-0.5 text-xs text-text-secondary"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Photo count */}
      <div className="flex-shrink-0 text-center">
        <div className="text-2xl font-semibold text-text-primary">
          {album.photoCount}
        </div>
        <div className="text-xs text-text-secondary">
          photo{album.photoCount === 1 ? "" : "s"}
        </div>
      </div>

      {/* Publish toggle */}
      <button
        type="button"
        onClick={handlePublishToggle}
        disabled={isToggling}
        className={`flex-shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
          optimisticPublished
            ? "bg-green-100 text-green-700 hover:bg-green-200"
            : "bg-surface-secondary text-text-secondary hover:bg-gray-200"
        } ${isToggling ? "opacity-50" : ""}`}
        aria-label={optimisticPublished ? "Unpublish album" : "Publish album"}
      >
        {optimisticPublished ? "Published" : "Draft"}
      </button>

      {/* Actions */}
      <div className="flex flex-shrink-0 gap-2">
        {onManage && (
          <button
            type="button"
            onClick={onManage}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50"
          >
            Manage Photos
          </button>
        )}
        <button
          type="button"
          onClick={onEdit}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent-surface"
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
