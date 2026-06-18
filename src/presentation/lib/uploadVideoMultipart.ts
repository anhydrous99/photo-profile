import type { UploadResult } from "./uploadFile";
import { VIDEO_EXTENSION_MIME, VIDEO_UPLOAD_MIME_TYPES } from "@/lib/constants";

/**
 * Browser-driven S3 multipart upload for large video files.
 *
 * Flow: POST /create (presign parts) -> PUT each part directly to S3 (parallel,
 * with retry) -> POST /complete (finalize + create record + submit transcode).
 * On failure the multipart upload is aborted via POST /abort.
 *
 * Uses XMLHttpRequest for per-part upload progress (fetch has no upload
 * progress events). Aggregate progress is the sum of bytes across all parts.
 */

interface CreatePart {
  partNumber: number;
  url: string;
}

interface CreateResponse {
  photoId: string;
  key: string;
  uploadId: string;
  partSize: number;
  parts: CreatePart[];
}

const PART_CONCURRENCY = 3;
const PART_MAX_RETRIES = 2;
const PART_TIMEOUT_MS = 600_000;

/**
 * Resolves the content type to register with S3. Browsers occasionally report
 * an empty `file.type` (e.g. for .mov); fall back to the extension so the
 * server's content-type validation passes and the stored object is tagged
 * correctly.
 */
function resolveContentType(file: File): string {
  if ((VIDEO_UPLOAD_MIME_TYPES as readonly string[]).includes(file.type)) {
    return file.type;
  }
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  return VIDEO_EXTENSION_MIME[ext] ?? file.type;
}

function uploadPart(params: {
  url: string;
  blob: Blob;
  onProgress: (loadedBytes: number) => void;
  signal?: AbortSignal;
}): Promise<string> {
  const { url, blob, onProgress, signal } = params;

  return new Promise<string>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Upload cancelled"));
      return;
    }

    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        onProgress(event.loaded);
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const etag = xhr.getResponseHeader("ETag");
        if (!etag) {
          reject(
            new Error(
              "Missing ETag in S3 response (bucket CORS must expose the ETag header)",
            ),
          );
          return;
        }
        onProgress(blob.size);
        resolve(etag);
      } else {
        reject(new Error(`Part upload failed: ${xhr.status}`));
      }
    });

    xhr.addEventListener("error", () =>
      reject(new Error("Network error during upload")),
    );
    xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")));
    xhr.addEventListener("timeout", () =>
      reject(
        new Error(
          "Upload timed out — the file may be too large for your connection speed. Please try again.",
        ),
      ),
    );

    if (signal) {
      signal.addEventListener("abort", () => xhr.abort());
    }

    xhr.open("PUT", url, true);
    xhr.timeout = PART_TIMEOUT_MS;
    xhr.send(blob);
  });
}

export async function uploadVideoMultipart(params: {
  file: File;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}): Promise<UploadResult> {
  const { file, onProgress, signal } = params;

  const createResponse = await fetch("/api/admin/upload/video/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      contentType: resolveContentType(file),
      fileSize: file.size,
    }),
  });

  if (!createResponse.ok) {
    const error = await createResponse.json().catch(() => ({}));
    throw new Error(error.error || `Create failed: ${createResponse.status}`);
  }

  const { photoId, key, uploadId, partSize, parts }: CreateResponse =
    await createResponse.json();

  const loadedBytes = new Array(parts.length).fill(0);
  const fileSize = file.size || 1;
  const reportProgress = () => {
    if (!onProgress) return;
    const total = loadedBytes.reduce((sum, n) => sum + n, 0);
    onProgress(Math.min(100, Math.round((total / fileSize) * 100)));
  };

  const completedParts: { partNumber: number; etag: string }[] = [];

  async function processPart(index: number): Promise<void> {
    const part = parts[index];
    const start = index * partSize;
    const end = Math.min(start + partSize, file.size);
    const blob = file.slice(start, end);

    let attempt = 0;
    for (;;) {
      try {
        const etag = await uploadPart({
          url: part.url,
          blob,
          onProgress: (bytes) => {
            loadedBytes[index] = bytes;
            reportProgress();
          },
          signal,
        });
        completedParts.push({ partNumber: part.partNumber, etag });
        loadedBytes[index] = blob.size;
        reportProgress();
        return;
      } catch (error) {
        if (signal?.aborted) throw error;
        attempt += 1;
        if (attempt > PART_MAX_RETRIES) throw error;
        loadedBytes[index] = 0;
        reportProgress();
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
      }
    }
  }

  try {
    let cursor = 0;
    const worker = async () => {
      for (;;) {
        const index = cursor;
        cursor += 1;
        if (index >= parts.length) return;
        await processPart(index);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(PART_CONCURRENCY, parts.length) }, () =>
        worker(),
      ),
    );
  } catch (error) {
    // Best-effort cleanup of the abandoned multipart upload.
    await fetch("/api/admin/upload/video/abort", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, uploadId }),
    }).catch(() => {});
    throw error;
  }

  const completeResponse = await fetch("/api/admin/upload/video/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      photoId,
      key,
      uploadId,
      originalFilename: file.name,
      parts: completedParts,
    }),
  });

  if (!completeResponse.ok) {
    const error = await completeResponse.json().catch(() => ({}));
    throw new Error(
      error.error || `Complete failed: ${completeResponse.status}`,
    );
  }

  const data = await completeResponse.json();
  return { photoId: data.photoId, status: "processing" };
}
