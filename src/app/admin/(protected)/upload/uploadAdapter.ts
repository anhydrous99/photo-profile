import {
  uploadFile,
  uploadFileViaPresign,
  uploadVideoMultipart,
  type UploadController,
} from "@/presentation/lib";
import { VIDEO_EXTENSION_MIME, VIDEO_UPLOAD_MIME_TYPES } from "@/lib/constants";
import { resolveVideoEnabled } from "@/lib/videoFeature";

const videoEnabled = resolveVideoEnabled({
  value: process.env.NEXT_PUBLIC_VIDEO_ENABLED,
  storageBackend: process.env.NEXT_PUBLIC_STORAGE_BACKEND,
});

function isVideoFile(file: File): boolean {
  if ((VIDEO_UPLOAD_MIME_TYPES as readonly string[]).includes(file.type)) {
    return true;
  }
  // Fall back to extension: some OS/browser combos report an empty file.type
  // (notably .mov), and DropZone accepts those by extension.
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  return ext in VIDEO_EXTENSION_MIME;
}

type AdapterFn = (
  file: File,
  onProgress: (percent: number) => void,
) => UploadController;

export function getUploadAdapter(): AdapterFn {
  const storageBackend = process.env.NEXT_PUBLIC_STORAGE_BACKEND;

  const uploadImage: AdapterFn =
    storageBackend === "s3"
      ? (file, onProgress) => {
          const abortController = new AbortController();
          const promise = uploadFileViaPresign({
            file,
            onProgress,
            signal: abortController.signal,
          }).then((result) => ({
            photoId: result.photoId,
            status: "processing" as const,
          }));
          return { abort: () => abortController.abort(), promise };
        }
      : uploadFile;

  return (file, onProgress) => {
    // Video is uploaded via S3 multipart and transcoded by MediaConvert.
    if (videoEnabled && isVideoFile(file)) {
      const abortController = new AbortController();
      const promise = uploadVideoMultipart({
        file,
        onProgress,
        signal: abortController.signal,
      });
      return { abort: () => abortController.abort(), promise };
    }

    return uploadImage(file, onProgress);
  };
}
