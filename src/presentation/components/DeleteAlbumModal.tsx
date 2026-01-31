"use client";

import { useState } from "react";
import type { Album } from "@/domain/entities";

interface DeleteAlbumModalProps {
  album: Album;
  photoCount: number;
  isOpen: boolean;
  onClose: () => void;
  onDeleted: () => void;
}

/**
 * Confirmation modal for album deletion
 *
 * Features:
 * - Radio buttons for delete mode: album only vs album + photos
 * - Warning text explaining each option
 * - DELETE to /api/admin/albums/[id] with deletePhotos flag
 */
export function DeleteAlbumModal({
  album,
  photoCount,
  isOpen,
  onClose,
  onDeleted,
}: DeleteAlbumModalProps) {
  const [deletePhotos, setDeletePhotos] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/albums/${album.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deletePhotos }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete album");
      }

      onDeleted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="relative mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 className="mb-2 text-lg font-semibold text-gray-900">
          Delete Album
        </h2>
        <p className="mb-4 text-sm text-gray-600">
          Delete &quot;{album.title}&quot;
          {photoCount > 0 && (
            <>
              {" "}
              ({photoCount} photo{photoCount === 1 ? "" : "s"})
            </>
          )}
        </p>

        {/* Delete mode selection */}
        <div className="mb-4 space-y-3">
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 p-3 hover:bg-gray-50">
            <input
              type="radio"
              name="deleteMode"
              checked={!deletePhotos}
              onChange={() => setDeletePhotos(false)}
              className="mt-0.5 h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <div>
              <div className="font-medium text-gray-900">Album only</div>
              <div className="text-sm text-gray-500">
                Delete the album but keep all photos in the library
              </div>
            </div>
          </label>

          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 p-3 hover:bg-gray-50">
            <input
              type="radio"
              name="deleteMode"
              checked={deletePhotos}
              onChange={() => setDeletePhotos(true)}
              className="mt-0.5 h-4 w-4 border-gray-300 text-red-600 focus:ring-red-500"
            />
            <div>
              <div className="font-medium text-gray-900">Album and photos</div>
              <div className="text-sm text-gray-500">
                Delete the album and permanently remove all {photoCount} photo
                {photoCount === 1 ? "" : "s"} from the library
              </div>
            </div>
          </label>
        </div>

        {/* Warning for destructive option */}
        {deletePhotos && photoCount > 0 && (
          <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            <strong>Warning:</strong> This will permanently delete {photoCount}{" "}
            photo{photoCount === 1 ? "" : "s"} and cannot be undone.
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isLoading}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {isLoading ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
