import { extname } from "path";
import { getStorageAdapter, getImageUrl } from "./factory";

export { getStorageAdapter, getImageUrl } from "./factory";
export { presignS3Upload } from "./presignS3Upload";
export type { StorageAdapter } from "./types";

export async function saveOriginalFile(
  photoId: string,
  file: File,
): Promise<string> {
  const ext = extname(file.name).toLowerCase() || ".jpg";
  const key = `originals/${photoId}/original${ext}`;
  const bytes = await file.arrayBuffer();
  const adapter = getStorageAdapter();
  await adapter.saveFile(key, Buffer.from(bytes), file.type || "image/jpeg");
  return key;
}

export async function findOriginalFile(
  photoId: string,
): Promise<string | null> {
  const adapter = getStorageAdapter();
  const files = await adapter.listFiles(`originals/${photoId}`);
  const original = files.find((f) => f.includes("original."));
  return original ?? null;
}

export async function deletePhotoFiles(photoId: string): Promise<void> {
  const adapter = getStorageAdapter();
  await Promise.all([
    adapter.deleteFiles(`originals/${photoId}`),
    adapter.deleteFiles(`processed/${photoId}`),
  ]);
}
