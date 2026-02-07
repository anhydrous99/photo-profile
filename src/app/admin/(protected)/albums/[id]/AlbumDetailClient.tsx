"use client";

import { useState } from "react";
import Link from "next/link";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import type { Album } from "@/domain/entities";
import { SortablePhotoCard } from "@/presentation/components";

interface AlbumPhoto {
  id: string;
  title: string | null;
  originalFilename: string;
  blurDataUrl: string | null;
}

interface AlbumDetailClientProps {
  album: Album;
  photos: AlbumPhoto[];
}

/**
 * Admin album detail client component with drag-drop reorder and cover selection
 *
 * Features:
 * - Sortable photo grid with dnd-kit (rectSortingStrategy)
 * - DragOverlay for clean drag visual feedback
 * - Click to set cover photo with optimistic updates
 * - Drag to reorder with API persistence
 */
export function AlbumDetailClient({
  album: initialAlbum,
  photos: initialPhotos,
}: AlbumDetailClientProps) {
  const [album, setAlbum] = useState<Album>(initialAlbum);
  const [photos, setPhotos] = useState<AlbumPhoto[]>(initialPhotos);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor),
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveId(null);

    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = photos.findIndex((p) => p.id === active.id);
    const newIndex = photos.findIndex((p) => p.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    // Optimistic update
    const previousPhotos = photos;
    const newPhotos = arrayMove(photos, oldIndex, newIndex);
    setPhotos(newPhotos);
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/admin/albums/${album.id}/photos/reorder`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ photoIds: newPhotos.map((p) => p.id) }),
        },
      );

      if (!response.ok) {
        throw new Error("Failed to save photo order");
      }
    } catch {
      // Revert on error
      setPhotos(previousPhotos);
      setError("Failed to save photo order. Please try again.");
      setTimeout(() => setError(null), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSetCover = async (photoId: string) => {
    // Optimistic update
    const previousCoverPhotoId = album.coverPhotoId;
    setAlbum((prev) => ({ ...prev, coverPhotoId: photoId }));
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/albums/${album.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coverPhotoId: photoId }),
      });

      if (!response.ok) {
        throw new Error("Failed to set cover photo");
      }
    } catch {
      // Revert on error
      setAlbum((prev) => ({ ...prev, coverPhotoId: previousCoverPhotoId }));
      setError("Failed to set cover photo. Please try again.");
      setTimeout(() => setError(null), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const activePhoto = activeId ? photos.find((p) => p.id === activeId) : null;

  return (
    <>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link
            href="/admin/albums"
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            &larr; Back to Albums
          </Link>
          <h1 className="mt-1 text-2xl font-bold">{album.title}</h1>
          <p className="text-sm text-gray-500">
            {photos.length} photo{photos.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      {/* Status messages */}
      {isSaving && (
        <div className="mb-4 rounded-lg bg-blue-50 px-4 py-2 text-sm text-blue-700">
          Saving...
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Photo grid */}
      {photos.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-12 text-center">
          <p className="text-gray-500">
            No photos in this album. Add photos from the photo library.
          </p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={photos.map((p) => p.id)}
            strategy={rectSortingStrategy}
          >
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {photos.map((photo) => (
                <SortablePhotoCard
                  key={photo.id}
                  photo={photo}
                  isCover={album.coverPhotoId === photo.id}
                  onSetCover={handleSetCover}
                />
              ))}
            </div>
          </SortableContext>

          {/* Drag overlay */}
          <DragOverlay>
            {activePhoto ? (
              <div className="rounded-lg opacity-80 shadow-xl">
                <div className="aspect-square overflow-hidden rounded-lg border border-gray-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/images/${activePhoto.id}/300w.webp`}
                    alt={activePhoto.title || activePhoto.originalFilename}
                    className="h-full w-full object-cover"
                  />
                </div>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </>
  );
}
