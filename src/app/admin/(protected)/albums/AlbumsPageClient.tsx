"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import type { Album } from "@/domain/entities";
import {
  SortableAlbumCard,
  AlbumCreateModal,
  DeleteAlbumModal,
  type AlbumWithCount,
} from "@/presentation/components";

interface AlbumsPageClientProps {
  albums: AlbumWithCount[];
}

/**
 * Albums page client component with drag-drop reordering
 *
 * Features:
 * - Sortable album list with dnd-kit
 * - Create, Edit, Delete modals
 * - Optimistic reorder updates with API persistence
 */
export function AlbumsPageClient({
  albums: initialAlbums,
}: AlbumsPageClientProps) {
  const router = useRouter();
  const [albums, setAlbums] = useState<AlbumWithCount[]>(initialAlbums);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editAlbum, setEditAlbum] = useState<Album | undefined>(undefined);
  const [deleteAlbum, setDeleteAlbum] = useState<AlbumWithCount | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor),
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    // Find indices
    const oldIndex = albums.findIndex((a) => a.id === active.id);
    const newIndex = albums.findIndex((a) => a.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    // Optimistic update
    const newAlbums = arrayMove(albums, oldIndex, newIndex);
    setAlbums(newAlbums);
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/albums/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ albumIds: newAlbums.map((a) => a.id) }),
      });

      if (!response.ok) {
        throw new Error("Failed to save order");
      }
    } catch {
      // Revert on error
      setAlbums(albums);
      setError("Failed to save album order. Please try again.");
      setTimeout(() => setError(null), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateSuccess = () => {
    router.refresh();
  };

  const handleEditClick = (album: Album) => {
    setEditAlbum(album);
  };

  const handleDeleteClick = (album: AlbumWithCount) => {
    setDeleteAlbum(album);
  };

  const handleDeleteSuccess = () => {
    router.refresh();
  };

  const handleCloseCreateModal = () => {
    setIsCreateModalOpen(false);
    setEditAlbum(undefined);
  };

  return (
    <>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Albums</h1>
        <button
          type="button"
          onClick={() => setIsCreateModalOpen(true)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Create Album
        </button>
      </div>

      {/* Status messages */}
      {isSaving && (
        <div className="mb-4 rounded-lg bg-blue-50 px-4 py-2 text-sm text-blue-700">
          Saving order...
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Album list */}
      {albums.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-12 text-center">
          <p className="text-gray-500">
            No albums yet. Create your first album.
          </p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={albums.map((a) => a.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-3">
              {albums.map((album) => (
                <SortableAlbumCard
                  key={album.id}
                  album={album}
                  onEdit={() => handleEditClick(album)}
                  onDelete={() => handleDeleteClick(album)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Create/Edit Modal */}
      <AlbumCreateModal
        isOpen={isCreateModalOpen || !!editAlbum}
        onClose={handleCloseCreateModal}
        onCreated={handleCreateSuccess}
        editAlbum={editAlbum}
      />

      {/* Delete Modal */}
      {deleteAlbum && (
        <DeleteAlbumModal
          album={deleteAlbum}
          photoCount={deleteAlbum.photoCount}
          isOpen={true}
          onClose={() => setDeleteAlbum(null)}
          onDeleted={handleDeleteSuccess}
        />
      )}
    </>
  );
}
