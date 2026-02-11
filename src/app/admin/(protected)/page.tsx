import Link from "next/link";
import {
  SQLitePhotoRepository,
  SQLiteAlbumRepository,
} from "@/infrastructure/database/repositories";
import { AdminDashboardClient } from "./AdminDashboardClient";
import type { Photo } from "@/domain/entities";

export const dynamic = "force-dynamic";

const photoRepository = new SQLitePhotoRepository();
const albumRepository = new SQLiteAlbumRepository();

const PAGE_SIZE = 24;
const STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

const VALID_STATUSES: Photo["status"][] = ["processing", "ready", "error"];
const VALID_ALBUM_FILTERS = ["all", "none"] as const;
type AlbumFilter = (typeof VALID_ALBUM_FILTERS)[number];

interface PageProps {
  searchParams: Promise<{
    cursor?: string;
    cursors?: string;
    status?: string;
    album?: string;
  }>;
}

/**
 * Admin Dashboard
 *
 * Shows:
 * - Link to upload page
 * - Paginated grid of uploaded photos with selection support
 * - Batch operations (add to album, delete)
 * - Server-side status filtering and pagination via query params
 */
export default async function AdminDashboard({ searchParams }: PageProps) {
  const params = await searchParams;

  const cursor = params.cursor || undefined;
  const cursorHistory = params.cursors
    ? params.cursors.split(",").filter(Boolean)
    : [];
  const statusFilter = VALID_STATUSES.includes(params.status as Photo["status"])
    ? (params.status as Photo["status"])
    : undefined;
  const albumFilter: AlbumFilter = VALID_ALBUM_FILTERS.includes(
    params.album as AlbumFilter,
  )
    ? (params.album as AlbumFilter)
    : "all";

  const [{ data: photos, nextCursor }, albums, stalePhotos] = await Promise.all(
    [
      photoRepository.findPaginated({
        limit: PAGE_SIZE,
        cursor,
        status: statusFilter,
        albumFilter: albumFilter === "all" ? undefined : albumFilter,
      }),
      albumRepository.findAll(),
      photoRepository.findStaleProcessing(STALE_THRESHOLD_MS),
    ],
  );

  const stalePhotoIds = stalePhotos.map((p) => p.id);

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <div className="flex gap-3">
          <Link
            href="/admin/albums"
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-primary hover:bg-surface-hover"
          >
            Manage Albums
          </Link>
          <Link
            href="/admin/upload"
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Upload Photos
          </Link>
        </div>
      </div>

      <h2 className="mb-4 text-lg font-medium text-text-primary">Photos</h2>

      <AdminDashboardClient
        photos={photos}
        albums={albums}
        stalePhotoIds={stalePhotoIds}
        nextCursor={nextCursor}
        cursorHistory={cursorHistory}
        statusFilter={statusFilter ?? "all"}
        albumFilter={albumFilter}
      />
    </div>
  );
}
