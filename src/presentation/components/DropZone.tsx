"use client";

import { useCallback } from "react";
import { useDropzone, FileRejection } from "react-dropzone";

interface DropZoneProps {
  onFilesAccepted: (files: File[]) => void;
  onFilesRejected?: (rejections: FileRejection[]) => void;
  maxFiles?: number;
  maxSize?: number;
  disabled?: boolean;
}

/**
 * Drag-and-drop file upload zone
 *
 * Large, prominent drop target following the "photos speak for themselves"
 * design philosophy. Minimal visual states: idle and active (dragging).
 *
 * @param onFilesAccepted - Called with accepted File array
 * @param onFilesRejected - Called with rejected files (wrong type/size)
 * @param maxFiles - Maximum files per drop (default: 20)
 * @param maxSize - Maximum file size in bytes (default: 100MB)
 * @param disabled - Disable interaction during upload
 */
export function DropZone({
  onFilesAccepted,
  onFilesRejected,
  maxFiles = 20,
  maxSize = 100 * 1024 * 1024,
  disabled = false,
}: DropZoneProps) {
  const onDrop = useCallback(
    (acceptedFiles: File[], rejections: FileRejection[]) => {
      if (rejections.length > 0 && onFilesRejected) {
        onFilesRejected(rejections);
      }
      if (acceptedFiles.length > 0) {
        onFilesAccepted(acceptedFiles);
      }
    },
    [onFilesAccepted, onFilesRejected],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/jpeg": [".jpg", ".jpeg"],
      "image/png": [".png"],
      "image/webp": [".webp"],
      "image/heic": [".heic"],
    },
    maxFiles,
    maxSize,
    disabled,
  });

  return (
    <div
      {...getRootProps()}
      className={`
        flex min-h-[400px] cursor-pointer flex-col items-center justify-center
        rounded-lg border-2 border-dashed p-12 text-center
        transition-colors duration-200
        ${disabled ? "cursor-not-allowed opacity-50" : ""}
        ${
          isDragActive
            ? "border-accent bg-accent-surface"
            : "border-border hover:border-border-strong"
        }
      `}
    >
      <input {...getInputProps()} />
      {isDragActive ? (
        <p className="text-xl text-accent">Drop photos here...</p>
      ) : (
        <>
          <p className="text-xl text-text-secondary">
            Drag and drop photos here
          </p>
          <p className="mt-2 text-sm text-text-tertiary">
            or click to select files
          </p>
          <p className="mt-4 text-xs text-text-tertiary">
            JPEG, PNG, WebP, HEIC up to 100MB each
          </p>
        </>
      )}
    </div>
  );
}
