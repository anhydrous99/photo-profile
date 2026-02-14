import {
  uploadFile,
  uploadFileViaPresign,
  type UploadController,
} from "@/presentation/lib";

export function getUploadAdapter(): (
  file: File,
  onProgress: (percent: number) => void,
) => UploadController {
  const storageBackend = process.env.NEXT_PUBLIC_STORAGE_BACKEND;

  if (storageBackend === "s3") {
    return (file: File, onProgress: (percent: number) => void) => {
      const abortController = new AbortController();

      const promise = uploadFileViaPresign({
        file,
        onProgress,
        signal: abortController.signal,
      }).then((result) => ({
        photoId: result.photoId,
        status: "processing" as const,
      }));

      return {
        abort: () => abortController.abort(),
        promise,
      };
    };
  }

  return uploadFile;
}
