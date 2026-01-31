import type { Photo } from "@/domain/entities";
import Link from "next/link";

interface PhotoGridProps {
  photos: Photo[];
  selectable?: boolean;
  selectedIds?: Set<string>;
  onSelectionChange?: (selectedIds: Set<string>) => void;
  onPhotoClick?: (photoId: string) => void;
}

/**
 * Display grid of photo cards
 *
 * Shows each photo with:
 * - Filename
 * - Status badge
 * - Created date
 *
 * When selectable=true:
 * - Shows checkbox overlay on each PhotoCard
 * - Checkbox visible on hover OR when selected
 * - Clicking checkbox toggles selection
 * - Clicking card body triggers onPhotoClick
 */
export function PhotoGrid({
  photos,
  selectable = false,
  selectedIds = new Set(),
  onSelectionChange,
  onPhotoClick,
}: PhotoGridProps) {
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

  const handleSelect = (photoId: string) => {
    if (!onSelectionChange) return;
    const newSelected = new Set(selectedIds);
    if (newSelected.has(photoId)) {
      newSelected.delete(photoId);
    } else {
      newSelected.add(photoId);
    }
    onSelectionChange(newSelected);
  };

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {photos.map((photo) => (
        <PhotoCard
          key={photo.id}
          photo={photo}
          selectable={selectable}
          isSelected={selectedIds.has(photo.id)}
          onSelect={() => handleSelect(photo.id)}
          onClick={() => onPhotoClick?.(photo.id)}
        />
      ))}
    </div>
  );
}

interface PhotoCardProps {
  photo: Photo;
  selectable?: boolean;
  isSelected?: boolean;
  onSelect?: () => void;
  onClick?: () => void;
}

function PhotoCard({
  photo,
  selectable = false,
  isSelected = false,
  onSelect,
  onClick,
}: PhotoCardProps) {
  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect?.();
  };

  return (
    <div
      className={`group relative overflow-hidden rounded-lg border bg-white cursor-pointer transition-colors ${
        isSelected
          ? "border-blue-500 ring-2 ring-blue-200"
          : "border-gray-200 hover:border-gray-300"
      }`}
      onClick={onClick}
    >
      {/* Selection checkbox overlay - visible on hover or when selected */}
      {selectable && (
        <div
          className={`absolute left-2 top-2 z-10 ${
            isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          } transition-opacity`}
        >
          <button
            type="button"
            onClick={handleCheckboxClick}
            className={`flex h-6 w-6 items-center justify-center rounded border-2 transition-colors ${
              isSelected
                ? "border-blue-500 bg-blue-500 text-white"
                : "border-gray-400 bg-white/90 hover:border-blue-400"
            }`}
            aria-label={isSelected ? "Deselect photo" : "Select photo"}
          >
            {isSelected && (
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={3}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            )}
          </button>
        </div>
      )}

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
