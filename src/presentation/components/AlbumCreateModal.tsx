"use client";

import { useState, useEffect } from "react";
import type { Album } from "@/domain/entities";
import { TagsInput } from "./TagsInput";

interface AlbumCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
  editAlbum?: Album;
}

/**
 * Modal for creating or editing albums
 *
 * Features:
 * - Title (required), description (optional), tags (TagsInput)
 * - Create mode: POST to /api/admin/albums
 * - Edit mode: PATCH to /api/admin/albums/[id]
 * - Loading state and error display
 */
export function AlbumCreateModal({
  isOpen,
  onClose,
  onCreated,
  editAlbum,
}: AlbumCreateModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditMode = !!editAlbum;

  // Populate form when editing
  useEffect(() => {
    if (editAlbum) {
      setTitle(editAlbum.title);
      setDescription(editAlbum.description || "");
      setTags(
        editAlbum.tags ? editAlbum.tags.split(",").map((t) => t.trim()) : [],
      );
    } else {
      setTitle("");
      setDescription("");
      setTags([]);
    }
    setError(null);
  }, [editAlbum, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      setError("Title is required");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const body = {
        title: title.trim(),
        description: description.trim() || null,
        tags: tags.length > 0 ? tags.join(",") : null,
      };

      const url = isEditMode
        ? `/api/admin/albums/${editAlbum.id}`
        : "/api/admin/albums";
      const method = isEditMode ? "PATCH" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to save album");
      }

      onCreated();
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
      <div className="relative mx-4 w-full max-w-md rounded-lg bg-surface p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-text-primary">
          {isEditMode ? "Edit Album" : "Create Album"}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div>
            <label
              htmlFor="album-title"
              className="mb-1 block text-sm font-medium text-text-primary"
            >
              Title <span className="text-red-500">*</span>
            </label>
            <input
              id="album-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              placeholder="Album title"
              disabled={isLoading}
            />
          </div>

          {/* Description */}
          <div>
            <label
              htmlFor="album-description"
              className="mb-1 block text-sm font-medium text-text-primary"
            >
              Description
            </label>
            <textarea
              id="album-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              placeholder="Album description (optional)"
              disabled={isLoading}
            />
          </div>

          {/* Tags */}
          <div>
            <label className="mb-1 block text-sm font-medium text-text-primary">
              Tags
            </label>
            <TagsInput
              value={tags}
              onChange={setTags}
              placeholder="Press Enter to add tags"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-primary hover:bg-surface-secondary disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isLoading
                ? "Saving..."
                : isEditMode
                  ? "Save Changes"
                  : "Create Album"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
