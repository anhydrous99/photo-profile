"use client";

/**
 * Status of a single upload item
 */
export type UploadStatus = "pending" | "uploading" | "complete" | "error";

/**
 * Single upload item in the queue
 */
export interface UploadItem {
  id: string;
  file: File;
  status: UploadStatus;
  progress: number;
  photoId?: string;
  error?: string;
}

interface UploadQueueProps {
  items: UploadItem[];
  onRetry?: (id: string) => void;
}

/**
 * Display upload queue with per-file progress
 *
 * Shows each file with:
 * - Filename
 * - Progress bar (during upload)
 * - Success indicator (after complete)
 * - Error message with retry (on failure)
 */
export function UploadQueue({ items, onRetry }: UploadQueueProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="mt-8 space-y-3">
      <h2 className="text-lg font-medium text-gray-700">Upload Queue</h2>
      <div className="space-y-2">
        {items.map((item) => (
          <UploadItemRow key={item.id} item={item} onRetry={onRetry} />
        ))}
      </div>
    </div>
  );
}

function UploadItemRow({
  item,
  onRetry,
}: {
  item: UploadItem;
  onRetry?: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-gray-200 bg-white p-3">
      {/* Filename */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-700">
          {item.file.name}
        </p>
        <p className="text-xs text-gray-400">
          {formatFileSize(item.file.size)}
        </p>
      </div>

      {/* Status indicator */}
      <div className="w-32">
        {item.status === "pending" && (
          <span className="text-sm text-gray-400">Waiting...</span>
        )}

        {item.status === "uploading" && (
          <div className="space-y-1">
            <div className="h-2 overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full bg-blue-500 transition-all duration-200"
                style={{ width: `${item.progress}%` }}
              />
            </div>
            <span className="text-xs text-gray-500">{item.progress}%</span>
          </div>
        )}

        {item.status === "complete" && (
          <span className="text-sm font-medium text-green-600">Complete</span>
        )}

        {item.status === "error" && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-red-600">Failed</span>
            {onRetry && (
              <button
                onClick={() => onRetry(item.id)}
                className="text-xs text-blue-600 hover:underline"
              >
                Retry
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
