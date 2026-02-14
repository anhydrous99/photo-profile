"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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

  useEffect(() => {
    setAlbums(initialAlbums);
  }, [initialAlbums]);

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

  const handleManageClick = (albumId: string) => {
    router.push(`/admin/albums/${albumId}`);
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

  const handlePublishToggle = async (
    albumId: string,
    isPublished: boolean,
  ): Promise<void> => {
    const response = await fetch(`/api/admin/albums/${albumId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPublished }),
    });

    if (!response.ok) {
      throw new Error("Failed to update publish status");
    }

    // Update local state to reflect the change
    setAlbums((prev) =>
      prev.map((a) => (a.id === albumId ? { ...a, isPublished } : a)),
    );
  };

  return (
    <>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link
            href="/admin"
            className="text-sm text-text-secondary hover:text-text-primary"
          >
            &larr; Back to Dashboard
          </Link>
          <h1 className="mt-1 text-2xl font-bold">Albums</h1>
        </div>
        <button
          type="button"
          onClick={() => setIsCreateModalOpen(true)}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Create Album
        </button>
      </div>

      {/* Status messages */}
      {isSaving && (
        <div className="mb-4 rounded-lg bg-accent-surface px-4 py-2 text-sm text-accent-text">
          Saving order...
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-status-error-surface-text">
          {error}
        </div>
      )}

      {/* Album list */}
      {albums.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <p className="text-text-secondary">
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
                  onManage={() => handleManageClick(album.id)}
                  onEdit={() => handleEditClick(album)}
                  onDelete={() => handleDeleteClick(album)}
                  onPublishToggle={handlePublishToggle}
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
