"use client";

import { useState } from "react";
import type { Album } from "@/domain/entities";

interface BatchActionsProps {
  selectedIds: Set<string>;
  albums: Album[];
  onComplete: () => void;
}

/**
 * Batch operation controls for selected photos
 *
 * Shows when selectedIds.size > 0:
 * - Selection count
 * - Album assignment dropdown with "Add to Album" button
 * - Delete button (red, with warning icon)
 */
export function BatchActions({
  selectedIds,
  albums,
  onComplete,
}: BatchActionsProps) {
  const [selectedAlbumId, setSelectedAlbumId] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (selectedIds.size === 0) {
    return null;
  }

  const clearMessages = () => {
    setError(null);
    setSuccess(null);
  };

  const handleBatchAddToAlbum = async () => {
    if (!selectedAlbumId) return;

    clearMessages();
    setIsProcessing(true);

    try {
      const results = await Promise.all(
        Array.from(selectedIds).map((photoId) =>
          fetch(`/api/admin/photos/${photoId}/albums`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ albumId: selectedAlbumId }),
          }),
        ),
      );

      const errors = results.filter((r) => !r.ok);
      if (errors.length > 0) {
        setError(`Failed to add ${errors.length} photo(s) to album`);
      } else {
        setSuccess(`Added ${selectedIds.size} photo(s) to album`);
        setSelectedAlbumId("");
        onComplete();
      }
    } catch {
      setError("Network error while adding to album");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBatchDelete = async () => {
    const count = selectedIds.size;
    const confirmed = window.confirm(
      `Delete ${count} photo${count === 1 ? "" : "s"}? This cannot be undone.`,
    );

    if (!confirmed) return;

    clearMessages();
    setIsProcessing(true);

    try {
      const results = await Promise.all(
        Array.from(selectedIds).map((photoId) =>
          fetch(`/api/admin/photos/${photoId}`, {
            method: "DELETE",
          }),
        ),
      );

      const errors = results.filter((r) => !r.ok);
      if (errors.length > 0) {
        setError(`Failed to delete ${errors.length} photo(s)`);
      } else {
        setSuccess(`Deleted ${count} photo(s)`);
        onComplete();
      }
    } catch {
      setError("Network error while deleting");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="mb-4 flex flex-wrap items-center gap-4 rounded-lg border border-blue-200 bg-blue-50 p-3">
      {/* Selection count */}
      <span className="font-medium text-blue-800">
        {selectedIds.size} photo{selectedIds.size === 1 ? "" : "s"} selected
      </span>

      {/* Album assignment */}
      <div className="flex items-center gap-2">
        <select
          value={selectedAlbumId}
          onChange={(e) => setSelectedAlbumId(e.target.value)}
          disabled={isProcessing || albums.length === 0}
          className="rounded border border-gray-300 px-2 py-1 text-sm disabled:opacity-50"
        >
          <option value="">Select album...</option>
          {albums.map((album) => (
            <option key={album.id} value={album.id}>
              {album.title}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleBatchAddToAlbum}
          disabled={isProcessing || !selectedAlbumId}
          className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {isProcessing ? "Adding..." : "Add to Album"}
        </button>
      </div>

      {/* Delete button */}
      <button
        type="button"
        onClick={handleBatchDelete}
        disabled={isProcessing}
        className="flex items-center gap-1 rounded bg-red-600 px-3 py-1 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
          />
        </svg>
        {isProcessing ? "Deleting..." : "Delete"}
      </button>

      {/* Status messages */}
      {error && (
        <span className="text-sm font-medium text-red-600">{error}</span>
      )}
      {success && (
        <span className="text-sm font-medium text-green-600">{success}</span>
      )}
    </div>
  );
}
