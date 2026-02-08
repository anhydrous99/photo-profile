import Link from "next/link";
import {
  SQLitePhotoRepository,
  SQLiteAlbumRepository,
} from "@/infrastructure/database/repositories";
import { AdminDashboardClient } from "./AdminDashboardClient";

export const dynamic = "force-dynamic";

const photoRepository = new SQLitePhotoRepository();
const albumRepository = new SQLiteAlbumRepository();

/**
 * Admin Dashboard
 *
 * Shows:
 * - Link to upload page
 * - Grid of uploaded photos with selection support
 * - Batch operations (add to album, delete)
 */
export default async function AdminDashboard() {
  const [photos, albums] = await Promise.all([
    photoRepository.findAll(),
    albumRepository.findAll(),
  ]);

  // Sort photos by newest first
  const sortedPhotos = [...photos].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );

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

      <h2 className="mb-4 text-lg font-medium text-text-primary">
        Photos ({photos.length})
      </h2>

      <AdminDashboardClient photos={sortedPhotos} albums={albums} />
    </div>
  );
}
