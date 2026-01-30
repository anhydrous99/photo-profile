"use client";

import { useState, useCallback } from "react";
import { DropZone, UploadQueue } from "@/presentation/components";
import type { UploadItem } from "@/presentation/components";
import { uploadFile } from "@/presentation/lib";
import Link from "next/link";

/**
 * Admin Upload Page
 *
 * Orchestrates the batch upload flow:
 * 1. User drops files onto DropZone
 * 2. Files added to upload queue
 * 3. Uploads processed sequentially
 * 4. Progress tracked per file
 * 5. Success/error states displayed
 */
export default function UploadPage() {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  // Process upload queue sequentially
  const processQueue = useCallback(async (queue: UploadItem[]) => {
    setIsUploading(true);

    for (const item of queue) {
      if (item.status !== "pending") continue;

      // Update to uploading
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id ? { ...i, status: "uploading" as const } : i,
        ),
      );

      try {
        const controller = uploadFile(item.file, (progress) => {
          setItems((prev) =>
            prev.map((i) => (i.id === item.id ? { ...i, progress } : i)),
          );
        });

        const result = await controller.promise;

        // Update to complete
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? { ...i, status: "complete" as const, photoId: result.photoId }
              : i,
          ),
        );
      } catch (error) {
        // Update to error
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? {
                  ...i,
                  status: "error" as const,
                  error:
                    error instanceof Error ? error.message : "Upload failed",
                }
              : i,
          ),
        );
      }
    }

    setIsUploading(false);
  }, []);

  // Handle files dropped onto zone
  const handleFilesAccepted = useCallback(
    (files: File[]) => {
      // Create upload items for each file
      const newItems: UploadItem[] = files.map((file) => ({
        id: crypto.randomUUID(),
        file,
        status: "pending" as const,
        progress: 0,
      }));

      setItems((prev) => {
        const updated = [...prev, ...newItems];
        // Start processing if not already uploading
        if (!isUploading) {
          processQueue(updated);
        }
        return updated;
      });
    },
    [isUploading, processQueue],
  );

  // Retry a failed upload
  const handleRetry = useCallback(
    (id: string) => {
      const itemToRetry = items.find((i) => i.id === id);
      if (!itemToRetry) return;

      const retriedItem = {
        ...itemToRetry,
        status: "pending" as const,
        progress: 0,
      };

      setItems((prev) => prev.map((i) => (i.id === id ? retriedItem : i)));

      // Restart queue processing
      if (!isUploading) {
        processQueue([retriedItem]);
      }
    },
    [items, isUploading, processQueue],
  );

  // Count stats
  const stats = {
    total: items.length,
    complete: items.filter((i) => i.status === "complete").length,
    failed: items.filter((i) => i.status === "error").length,
  };

  return (
    <div className="mx-auto max-w-3xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Upload Photos</h1>
        <Link
          href="/admin"
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Back to Dashboard
        </Link>
      </div>

      <DropZone onFilesAccepted={handleFilesAccepted} disabled={isUploading} />

      <UploadQueue items={items} onRetry={handleRetry} />

      {stats.total > 0 && (
        <div className="mt-4 text-sm text-gray-500">
          {stats.complete} of {stats.total} uploaded
          {stats.failed > 0 && ` (${stats.failed} failed)`}
        </div>
      )}
    </div>
  );
}
