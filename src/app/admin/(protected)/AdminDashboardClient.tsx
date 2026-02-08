"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Photo, Album } from "@/domain/entities";
import { PhotoGrid, BatchActions } from "@/presentation/components";

type StatusFilter = "all" | "processing" | "ready" | "error";

interface AdminDashboardClientProps {
  photos: Photo[];
  albums: Album[];
  stalePhotoIds: string[];
}

/**
 * Client-side interactive portion of admin dashboard
 *
 * Manages:
 * - Photo selection state
 * - Batch operations (via BatchActions)
 * - Navigation to photo detail page
 * - Status filtering (all / processing / ready / error)
 * - Stale photo notification and reprocess controls
 */
export function AdminDashboardClient({
  photos,
  albums,
  stalePhotoIds,
}: AdminDashboardClientProps) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [reprocessing, setReprocessing] = useState(false);

  const handleSelectionChange = (newSelectedIds: Set<string>) => {
    setSelectedIds(newSelectedIds);
  };

  const handlePhotoClick = (photoId: string) => {
    router.push(`/admin/photos/${photoId}`);
  };

  const handleBatchComplete = () => {
    // Clear selection and refresh the page to show updated photo list
    setSelectedIds(new Set());
    router.refresh();
  };

  const handleReprocess = async (photoId: string) => {
    try {
      const res = await fetch(`/api/admin/photos/${photoId}/reprocess`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Reprocess failed");
        return;
      }
      router.refresh();
    } catch {
      alert("Failed to reprocess photo");
    }
  };

  const handleReprocessAll = async () => {
    const targetPhotos = photos.filter(
      (p) => p.status === "error" || stalePhotoIds.includes(p.id),
    );
    if (targetPhotos.length === 0) return;

    setReprocessing(true);
    try {
      for (const photo of targetPhotos) {
        await handleReprocess(photo.id);
      }
    } finally {
      setReprocessing(false);
    }
  };

  // Filter photos by selected status
  const filteredPhotos =
    statusFilter === "all"
      ? photos
      : photos.filter((p) => p.status === statusFilter);

  const errorCount = photos.filter((p) => p.status === "error").length;
  const hasActionablePhotos = stalePhotoIds.length > 0 || errorCount > 0;

  return (
    <>
      {/* Status filter and count */}
      <div className="mb-4 flex items-center gap-3">
        <label
          htmlFor="status-filter"
          className="text-sm font-medium text-text-secondary"
        >
          Filter by status:
        </label>
        <select
          id="status-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text-primary"
        >
          <option value="all">All statuses</option>
          <option value="processing">Processing</option>
          <option value="ready">Ready</option>
          <option value="error">Error</option>
        </select>
        <span className="text-sm text-text-tertiary">
          {filteredPhotos.length}{" "}
          {filteredPhotos.length === 1 ? "photo" : "photos"}
        </span>
      </div>

      {/* Stale/error notification bar */}
      {hasActionablePhotos && (
        <div className="mb-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="text-yellow-700 dark:text-yellow-400">
              {stalePhotoIds.length > 0 && (
                <p>
                  {stalePhotoIds.length}{" "}
                  {stalePhotoIds.length === 1 ? "photo" : "photos"} stuck in
                  processing (&gt;30 min)
                </p>
              )}
              {errorCount > 0 && (
                <p>
                  {errorCount} {errorCount === 1 ? "photo" : "photos"} failed
                  processing
                </p>
              )}
            </div>
            <button
              onClick={handleReprocessAll}
              disabled={reprocessing}
              className="shrink-0 rounded-lg bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {reprocessing ? "Reprocessing..." : "Reprocess All"}
            </button>
          </div>
        </div>
      )}

      <BatchActions
        selectedIds={selectedIds}
        albums={albums}
        onComplete={handleBatchComplete}
      />
      <PhotoGrid
        photos={filteredPhotos}
        selectable={true}
        selectedIds={selectedIds}
        onSelectionChange={handleSelectionChange}
        onPhotoClick={handlePhotoClick}
      />
    </>
  );
}
