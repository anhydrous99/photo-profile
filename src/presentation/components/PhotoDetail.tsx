"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Photo, Album } from "@/domain/entities";

interface PhotoDetailProps {
  photo: Photo;
  albums: Album[];
  photoAlbumIds: string[];
}

/**
 * Photo detail display with editable description
 *
 * Features:
 * - Photo metadata display (filename, status, dates)
 * - Description textarea with auto-save on blur
 * - Delete button with confirmation
 */
export function PhotoDetail({ photo }: PhotoDetailProps) {
  const router = useRouter();
  const [description, setDescription] = useState(photo.description ?? "");
  const [originalDescription] = useState(photo.description ?? "");
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDescriptionBlur = async () => {
    // Only save if value changed
    if (description === originalDescription) {
      return;
    }

    setSaveStatus("saving");

    try {
      const response = await fetch(`/api/admin/photos/${photo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: description || null }),
      });

      if (!response.ok) {
        throw new Error("Failed to save");
      }

      setSaveStatus("saved");
      // Clear "Saved" indicator after 2 seconds
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch {
      setSaveStatus("error");
      // Clear error after 3 seconds
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  };

  const handleDelete = async () => {
    // Browser confirmation dialog
    const confirmed = confirm(
      `Are you sure you want to delete "${photo.originalFilename}"? This action cannot be undone.`,
    );

    if (!confirmed) {
      return;
    }

    setIsDeleting(true);

    try {
      const response = await fetch(`/api/admin/photos/${photo.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete");
      }

      // Redirect to dashboard on success
      router.push("/admin");
    } catch {
      setIsDeleting(false);
      alert("Failed to delete photo. Please try again.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Photo Preview Placeholder */}
      <div className="flex h-64 items-center justify-center rounded-lg bg-surface-secondary">
        <span className="text-text-tertiary">
          {photo.status === "processing" ? "Processing..." : "No preview"}
        </span>
      </div>

      {/* Photo Info */}
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-text-primary">
            {photo.originalFilename}
          </h2>
          <div className="mt-1 flex items-center gap-3">
            <StatusBadge status={photo.status} />
            <span className="text-sm text-text-secondary">ID: {photo.id}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-text-secondary">Created:</span>
            <span className="ml-2 text-text-primary">
              {formatDate(photo.createdAt)}
            </span>
          </div>
          <div>
            <span className="text-text-secondary">Updated:</span>
            <span className="ml-2 text-text-primary">
              {formatDate(photo.updatedAt)}
            </span>
          </div>
        </div>
      </div>

      {/* Description Field */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <label
            htmlFor="description"
            className="block text-sm font-medium text-text-primary"
          >
            Description
          </label>
          <SaveIndicator status={saveStatus} />
        </div>
        <textarea
          id="description"
          rows={4}
          className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          placeholder="Add a description for this photo..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={handleDescriptionBlur}
        />
      </div>

      {/* Delete Button */}
      <div className="border-t border-border pt-6">
        <button
          onClick={handleDelete}
          disabled={isDeleting}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isDeleting ? "Deleting..." : "Delete Photo"}
        </button>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Photo["status"] }) {
  const styles = {
    processing: "bg-yellow-100 text-yellow-800",
    ready: "bg-green-100 text-green-800",
    error: "bg-red-100 text-red-800",
  };

  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}
    >
      {status}
    </span>
  );
}

function SaveIndicator({
  status,
}: {
  status: "idle" | "saving" | "saved" | "error";
}) {
  if (status === "idle") return null;

  const styles = {
    saving: "text-text-secondary",
    saved: "text-green-600",
    error: "text-red-600",
  };

  const labels = {
    saving: "Saving...",
    saved: "Saved",
    error: "Error saving",
  };

  return (
    <span className={`text-xs font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
