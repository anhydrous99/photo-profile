"use client";

import { useCallback } from "react";
import { useDropzone, FileRejection, type Accept } from "react-dropzone";
import {
  MAX_FILE_SIZE,
  MAX_VIDEO_FILE_SIZE,
  VIDEO_EXTENSION_MIME,
  VIDEO_UPLOAD_MIME_TYPES,
} from "@/lib/constants";
import { resolveVideoEnabled } from "@/lib/videoFeature";

const videoEnabled = resolveVideoEnabled({
  value: process.env.NEXT_PUBLIC_VIDEO_ENABLED,
  storageBackend: process.env.NEXT_PUBLIC_STORAGE_BACKEND,
});

function isVideoFile(file: File): boolean {
  if ((VIDEO_UPLOAD_MIME_TYPES as readonly string[]).includes(file.type)) {
    return true;
  }
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  return ext in VIDEO_EXTENSION_MIME;
}

interface DropZoneProps {
  onFilesAccepted: (files: File[]) => void;
  onFilesRejected?: (rejections: FileRejection[]) => void;
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
 * @param maxSize - Maximum file size in bytes (default: 100MB)
 * @param disabled - Disable interaction during upload
 */
export function DropZone({
  onFilesAccepted,
  onFilesRejected,
  maxSize,
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

  // Per-type size limits: images 100MB, videos 2GB. react-dropzone's global
  // maxSize is set to the largest allowed value so the validator can enforce
  // the precise per-type limit.
  const fileValidator = useCallback((file: File) => {
    const video = isVideoFile(file);
    const limit = video ? MAX_VIDEO_FILE_SIZE : MAX_FILE_SIZE;
    if (file.size > limit) {
      return {
        code: "file-too-large",
        message: video ? "exceeds 2GB limit" : "exceeds 100MB limit",
      };
    }
    return null;
  }, []);

  const accept: Accept = {
    "image/jpeg": [".jpg", ".jpeg"],
    "image/png": [".png"],
    "image/webp": [".webp"],
    "image/heic": [".heic"],
    ...(videoEnabled
      ? {
          "video/mp4": [".mp4"],
          "video/quicktime": [".mov"],
          "video/webm": [".webm"],
        }
      : {}),
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept,
    maxSize: maxSize ?? (videoEnabled ? MAX_VIDEO_FILE_SIZE : MAX_FILE_SIZE),
    validator: fileValidator,
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
        <p className="text-xl text-accent">Drop files here...</p>
      ) : (
        <>
          <p className="text-xl text-text-secondary">
            Drag and drop {videoEnabled ? "photos or videos" : "photos"} here
          </p>
          <p className="mt-2 text-sm text-text-tertiary">
            or click to select files
          </p>
          <p className="mt-4 text-xs text-text-tertiary">
            {videoEnabled
              ? "JPEG, PNG, WebP, HEIC up to 100MB; MP4, MOV, WebM up to 2GB"
              : "JPEG, PNG, WebP, HEIC up to 100MB each"}
          </p>
        </>
      )}
    </div>
  );
}
