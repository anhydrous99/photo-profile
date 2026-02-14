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

/**
 * Upload a file directly to S3 using a presigned URL
 *
 * @param presignedUrl - The presigned S3 URL
 * @param file - The File to upload
 * @param contentType - Content-Type header (must match presigned URL)
 * @param onProgress - Optional callback with upload percentage (0-100)
 * @param signal - Optional AbortSignal for cancellation
 * @returns Promise that resolves when upload completes
 */
export function uploadFileToS3(params: {
  presignedUrl: string;
  file: File;
  contentType: string;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const { presignedUrl, file, contentType, onProgress, signal } = params;
  const xhr = new XMLHttpRequest();

  return new Promise<void>((resolve, reject) => {
    if (onProgress) {
      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress(percent);
        }
      });
    }

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed: ${xhr.status}`));
      }
    });

    xhr.addEventListener("error", () => {
      reject(new Error("Network error during upload"));
    });

    xhr.addEventListener("abort", () => {
      reject(new Error("Upload cancelled"));
    });

    xhr.addEventListener("timeout", () => {
      reject(
        new Error(
          "Upload timed out — the file may be too large for your connection speed. Please try again.",
        ),
      );
    });

    if (signal) {
      signal.addEventListener("abort", () => xhr.abort());
    }

    xhr.open("PUT", presignedUrl, true);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.timeout = 600000;
    xhr.send(file);
  });
}

/**
 * Upload a file via presigned URL flow: presign → S3 → confirm
 *
 * @param file - The File to upload
 * @param onProgress - Optional callback with upload percentage (0-100)
 * @param signal - Optional AbortSignal for cancellation
 * @returns Promise with photoId and status
 */
export async function uploadFileViaPresign(params: {
  file: File;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}): Promise<{ photoId: string; status: string }> {
  const { file, onProgress, signal } = params;

  const presignResponse = await fetch("/api/admin/upload/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      contentType: file.type,
      fileSize: file.size,
    }),
  });

  if (!presignResponse.ok) {
    const error = await presignResponse.json();
    throw new Error(error.error || `Presign failed: ${presignResponse.status}`);
  }

  const { presignedUrl, photoId, key } = await presignResponse.json();

  await uploadFileToS3({
    presignedUrl,
    file,
    contentType: file.type,
    onProgress,
    signal,
  });

  const confirmResponse = await fetch("/api/admin/upload/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      photoId,
      key,
      originalFilename: file.name,
    }),
  });

  if (!confirmResponse.ok) {
    const error = await confirmResponse.json();
    throw new Error(error.error || `Confirm failed: ${confirmResponse.status}`);
  }

  return confirmResponse.json();
}
