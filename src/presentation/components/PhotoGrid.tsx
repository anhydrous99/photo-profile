import type { Photo } from "@/domain/entities";
import Link from "next/link";

interface PhotoGridProps {
  photos: Photo[];
}

/**
 * Display grid of photo cards
 *
 * Shows each photo with:
 * - Filename
 * - Status badge
 * - Created date
 */
export function PhotoGrid({ photos }: PhotoGridProps) {
  if (photos.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 p-12 text-center">
        <p className="text-gray-500">No photos uploaded yet.</p>
        <Link
          href="/admin/upload"
          className="mt-2 inline-block text-blue-600 hover:underline"
        >
          Upload your first photo
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {photos.map((photo) => (
        <PhotoCard key={photo.id} photo={photo} />
      ))}
    </div>
  );
}

function PhotoCard({ photo }: { photo: Photo }) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      {/* Placeholder for thumbnail - will be added in Phase 7 */}
      <div className="flex h-32 items-center justify-center bg-gray-100">
        <span className="text-sm text-gray-400">
          {photo.status === "processing" ? "Processing..." : "No preview"}
        </span>
      </div>

      <div className="p-3">
        <p className="truncate text-sm font-medium text-gray-700">
          {photo.originalFilename}
        </p>
        <div className="mt-1 flex items-center justify-between">
          <StatusBadge status={photo.status} />
          <span className="text-xs text-gray-400">
            {formatDate(photo.createdAt)}
          </span>
        </div>
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

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}
