import Link from "next/link";
import { SQLitePhotoRepository } from "@/infrastructure/database/repositories";
import { PhotoGrid } from "@/presentation/components";

const photoRepository = new SQLitePhotoRepository();

/**
 * Admin Dashboard
 *
 * Shows:
 * - Link to upload page
 * - Grid of uploaded photos
 */
export default async function AdminDashboard() {
  const photos = await photoRepository.findAll();

  // Sort by newest first
  const sortedPhotos = [...photos].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <Link
          href="/admin/upload"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Upload Photos
        </Link>
      </div>

      <h2 className="mb-4 text-lg font-medium text-gray-700">
        Photos ({photos.length})
      </h2>

      <PhotoGrid photos={sortedPhotos} />
    </div>
  );
}
