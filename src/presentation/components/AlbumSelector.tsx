"use client";

import { useState } from "react";
import type { Album } from "@/domain/entities";

interface AlbumSelectorProps {
  photoId: string;
  albums: Album[];
  selectedAlbumIds: string[];
}

/**
 * Album checkbox selection component
 *
 * Features:
 * - Checkbox list of all albums
 * - Optimistic updates on toggle
 * - API calls to add/remove photo from albums
 * - Error handling with state rollback
 */
export function AlbumSelector({
  photoId,
  albums,
  selectedAlbumIds,
}: AlbumSelectorProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(selectedAlbumIds),
  );
  const [error, setError] = useState<string | null>(null);

  const handleToggle = async (
    albumId: string,
    isCurrentlySelected: boolean,
  ) => {
    // Clear any previous error
    setError(null);

    // Optimistically update local state
    const newSelectedIds = new Set(selectedIds);
    if (isCurrentlySelected) {
      newSelectedIds.delete(albumId);
    } else {
      newSelectedIds.add(albumId);
    }
    setSelectedIds(newSelectedIds);

    try {
      if (isCurrentlySelected) {
        // Remove from album
        const response = await fetch(`/api/admin/photos/${photoId}/albums`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ albumId }),
        });

        if (!response.ok) {
          throw new Error("Failed to remove from album");
        }
      } else {
        // Add to album
        const response = await fetch(`/api/admin/photos/${photoId}/albums`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ albumId }),
        });

        if (!response.ok) {
          throw new Error("Failed to add to album");
        }
      }
    } catch {
      // Revert optimistic update on error
      setSelectedIds(new Set(selectedIds));
      setError(
        isCurrentlySelected
          ? "Failed to remove from album"
          : "Failed to add to album",
      );
      // Clear error after 3 seconds
      setTimeout(() => setError(null), 3000);
    }
  };

  // Empty state - no albums exist
  if (albums.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 p-6">
        <h3 className="text-sm font-medium text-gray-900">Albums</h3>
        <p className="mt-2 text-sm text-gray-500">
          No albums yet. Create albums in Album Management.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-medium text-gray-900">Albums</h3>

      {error && (
        <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-2">
        {albums.map((album) => {
          const isSelected = selectedIds.has(album.id);

          return (
            <label
              key={album.id}
              className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-gray-50"
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => handleToggle(album.id, isSelected)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">{album.title}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
