"use client";

import { useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Photo, Album } from "@/domain/entities";
import { PhotoGrid, BatchActions, Pagination } from "@/presentation/components";

type StatusFilter = "all" | "processing" | "ready" | "error";
type AlbumFilter = "all" | "none";

interface AdminDashboardClientProps {
  photos: Photo[];
  albums: Album[];
  stalePhotoIds: string[];
  currentPage: number;
  totalPages: number;
  statusFilter: StatusFilter;
  albumFilter: AlbumFilter;
}

export function AdminDashboardClient({
  photos,
  albums,
  stalePhotoIds,
  currentPage,
  totalPages,
  statusFilter,
  albumFilter,
}: AdminDashboardClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [reprocessing, setReprocessing] = useState(false);

  const buildUrl = useCallback(
    (params: { page?: number; status?: string; album?: string }) => {
      const newParams = new URLSearchParams(searchParams.toString());

      if (params.page && params.page > 1) {
        newParams.set("page", String(params.page));
      } else {
        newParams.delete("page");
      }

      if (params.status !== undefined) {
        if (params.status === "all") {
          newParams.delete("status");
        } else {
          newParams.set("status", params.status);
        }
      }

      if (params.album !== undefined) {
        if (params.album === "all") {
          newParams.delete("album");
        } else {
          newParams.set("album", params.album);
        }
      }

      const qs = newParams.toString();
      return qs ? `/admin?${qs}` : "/admin";
    },
    [searchParams],
  );

  const handlePageChange = (page: number) => {
    setSelectedIds(new Set());
    router.push(
      buildUrl({
        page,
        status: statusFilter === "all" ? undefined : statusFilter,
        album: albumFilter === "all" ? undefined : albumFilter,
      }),
    );
  };

  const handleStatusChange = (status: StatusFilter) => {
    setSelectedIds(new Set());
    router.push(buildUrl({ page: 1, status }));
  };

  const handleAlbumFilterChange = (album: AlbumFilter) => {
    setSelectedIds(new Set());
    router.push(buildUrl({ page: 1, album }));
  };

  const handleSelectionChange = (newSelectedIds: Set<string>) => {
    setSelectedIds(newSelectedIds);
  };

  const handlePhotoClick = (photoId: string) => {
    router.push(`/admin/photos/${photoId}`);
  };

  const handleBatchComplete = () => {
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

  const errorCount = photos.filter((p) => p.status === "error").length;
  const hasActionablePhotos = stalePhotoIds.length > 0 || errorCount > 0;

  return (
    <>
      <div className="mb-4 flex items-center gap-3">
        <label
          htmlFor="status-filter"
          className="text-sm font-medium text-text-secondary"
        >
          Status:
        </label>
        <select
          id="status-filter"
          value={statusFilter}
          onChange={(e) => handleStatusChange(e.target.value as StatusFilter)}
          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text-primary"
        >
          <option value="all">All statuses</option>
          <option value="processing">Processing</option>
          <option value="ready">Ready</option>
          <option value="error">Error</option>
        </select>
        <label
          htmlFor="album-filter"
          className="text-sm font-medium text-text-secondary"
        >
          Album:
        </label>
        <select
          id="album-filter"
          value={albumFilter}
          onChange={(e) =>
            handleAlbumFilterChange(e.target.value as AlbumFilter)
          }
          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text-primary"
        >
          <option value="all">All photos</option>
          <option value="none">Not in any album</option>
        </select>
        <span className="text-sm text-text-tertiary">
          {photos.length} {photos.length === 1 ? "photo" : "photos"}
          {statusFilter !== "all" ? ` (${statusFilter})` : ""}
          {albumFilter === "none" ? " · unassigned" : ""}
        </span>
        {photos.length > 0 && (
          <button
            type="button"
            onClick={() => {
              if (selectedIds.size === photos.length) {
                setSelectedIds(new Set());
              } else {
                setSelectedIds(new Set(photos.map((p) => p.id)));
              }
            }}
            className="ml-auto text-sm font-medium text-accent hover:text-blue-700"
          >
            {selectedIds.size === photos.length ? "Deselect all" : "Select all"}
          </button>
        )}
      </div>

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
        photos={photos}
        selectable={true}
        selectedIds={selectedIds}
        onSelectionChange={handleSelectionChange}
        onPhotoClick={handlePhotoClick}
      />
      <div className="mt-6">
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onChange={handlePageChange}
        />
      </div>
    </>
  );
}
