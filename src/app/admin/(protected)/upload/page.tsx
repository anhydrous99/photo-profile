"use client";

import { useState, useCallback, useRef } from "react";
import type { FileRejection } from "react-dropzone";
import { DropZone, UploadQueue } from "@/presentation/components";
import type { UploadItem } from "@/presentation/components";
import Link from "next/link";
import { getUploadAdapter } from "./uploadAdapter";

/**
 * Admin Upload Page
 *
 * Orchestrates the batch upload flow:
 * 1. User drops files onto DropZone
 * 2. Files added to upload queue
 * 3. Uploads processed sequentially
 * 4. Progress tracked per file
 * 5. Success/error states displayed
 *
 * Rejected files (too large, wrong type) show a dismissible notification
 * while valid files in the same batch still upload normally.
 */
export default function UploadPage() {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [rejections, setRejections] = useState<string[]>([]);
  const processingRef = useRef(false);
  const rejectionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const uploadAdapter = getUploadAdapter();

  // Process upload queue sequentially
  const processQueue = useCallback(
    async (queue: UploadItem[]) => {
      if (processingRef.current) return; // Prevent double processing
      processingRef.current = true;
      setIsUploading(true);

      for (const item of queue) {
        if (item.status !== "pending") continue;

        // Update to uploading
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? { ...i, status: "uploading" as const, startedAt: Date.now() }
              : i,
          ),
        );

        try {
          const controller = uploadAdapter(item.file, (progress) => {
            setItems((prev) =>
              prev.map((i) => {
                if (i.id !== item.id) return i;

                const update: Partial<UploadItem> = { progress };

                if (progress >= 10 && i.startedAt) {
                  const elapsedMs = Date.now() - i.startedAt;
                  const bytesUploaded = (progress / 100) * i.file.size;
                  const speedBps = bytesUploaded / (elapsedMs / 1000);
                  const remainingBytes = i.file.size - bytesUploaded;
                  update.estimatedSecondsRemaining = remainingBytes / speedBps;
                }

                return { ...i, ...update };
              }),
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
      processingRef.current = false;
    },
    [uploadAdapter],
  );

  // Handle files rejected by DropZone (wrong type, too large, etc.)
  const handleFilesRejected = useCallback((fileRejections: FileRejection[]) => {
    const messages = fileRejections.map((rejection) => {
      const fileName = rejection.file.name;
      const error = rejection.errors[0];
      const reason =
        error?.code === "file-too-large"
          ? "exceeds 100MB limit"
          : (error?.message ?? "rejected");
      return `${fileName}: ${reason}`;
    });

    setRejections(messages);

    // Clear any existing timer
    if (rejectionTimerRef.current) {
      clearTimeout(rejectionTimerRef.current);
    }

    // Auto-clear after 8 seconds
    rejectionTimerRef.current = setTimeout(() => {
      setRejections([]);
      rejectionTimerRef.current = null;
    }, 8000);
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

      setItems((prev) => [...prev, ...newItems]);

      // Start processing if not already active
      if (!isUploading && !processingRef.current) {
        // Use timeout to ensure state is updated first
        setTimeout(() => processQueue(newItems), 0);
      }
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

      <DropZone
        onFilesAccepted={handleFilesAccepted}
        onFilesRejected={handleFilesRejected}
        disabled={isUploading}
      />

      {rejections.length > 0 && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-red-800 dark:text-red-200">
                {rejections.length === 1
                  ? "File rejected"
                  : `${rejections.length} files rejected`}
              </p>
              <ul className="mt-1 text-sm text-red-700 dark:text-red-300">
                {rejections.map((msg, i) => (
                  <li key={i}>{msg}</li>
                ))}
              </ul>
            </div>
            <button
              onClick={() => setRejections([])}
              className="ml-4 text-red-700 hover:text-red-800 dark:text-red-300 dark:hover:text-red-200"
              aria-label="Dismiss"
            >
              &times;
            </button>
          </div>
        </div>
      )}

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
