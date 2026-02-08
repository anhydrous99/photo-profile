/**
 * Result from successful upload
 */
export interface UploadResult {
  photoId: string;
  status: "processing";
}

/**
 * Upload error with message
 */
export interface UploadError {
  error: string;
}

/**
 * Controller returned from uploadFile for abort capability
 */
export interface UploadController {
  /** Abort the in-progress upload */
  abort: () => void;
  /** Promise that resolves with upload result or rejects on error */
  promise: Promise<UploadResult>;
}

/**
 * Upload a file to the server with progress tracking
 *
 * Uses XMLHttpRequest instead of fetch because fetch API doesn't
 * support upload progress events (Interop 2026 proposal still pending).
 *
 * @param file - The File to upload
 * @param onProgress - Callback with upload percentage (0-100)
 * @returns Controller with abort() and promise
 */
export function uploadFile(
  file: File,
  onProgress: (percent: number) => void,
): UploadController {
  const xhr = new XMLHttpRequest();

  const promise = new Promise<UploadResult>((resolve, reject) => {
    const formData = new FormData();
    formData.append("file", file);

    // Track upload progress
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        onProgress(percent);
      }
    });

    // Handle completion
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const result = JSON.parse(xhr.responseText) as UploadResult;
          resolve(result);
        } catch {
          reject(new Error("Invalid response from server"));
        }
      } else {
        try {
          const error = JSON.parse(xhr.responseText) as UploadError;
          reject(new Error(error.error || `Upload failed: ${xhr.status}`));
        } catch {
          reject(new Error(`Upload failed: ${xhr.status}`));
        }
      }
    });

    // Handle network errors
    xhr.addEventListener("error", () => {
      reject(new Error("Network error during upload"));
    });

    // Handle user abort
    xhr.addEventListener("abort", () => {
      reject(new Error("Upload cancelled"));
    });

    // Handle timeout
    xhr.addEventListener("timeout", () => {
      reject(
        new Error(
          "Upload timed out — the file may be too large for your connection speed. Please try again.",
        ),
      );
    });

    // Send request
    xhr.open("POST", "/api/admin/upload");
    xhr.timeout = 600000;
    xhr.send(formData);
  });

  return {
    abort: () => xhr.abort(),
    promise,
  };
}
