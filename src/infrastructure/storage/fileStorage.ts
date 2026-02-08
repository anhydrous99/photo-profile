import { mkdir, writeFile, rm, readdir } from "fs/promises";
import { join, extname } from "path";
import { env } from "@/infrastructure/config/env";

/**
 * Save an uploaded file to the originals storage directory
 *
 * Directory structure: storage/originals/{photoId}/original.{ext}
 *
 * @param photoId - Unique identifier for the photo
 * @param file - The uploaded File object
 * @returns Full path to the saved file
 */
export async function saveOriginalFile(
  photoId: string,
  file: File,
): Promise<string> {
  const ext = extname(file.name).toLowerCase() || ".jpg";
  const dir = join(env.STORAGE_PATH, "originals", photoId);
  const filePath = join(dir, `original${ext}`);

  await mkdir(dir, { recursive: true });

  const bytes = await file.arrayBuffer();
  await writeFile(filePath, Buffer.from(bytes));

  return filePath;
}

/**
 * Find the original file path for a given photoId
 *
 * Scans the originals directory for files starting with "original."
 * Returns the full path if found, null otherwise.
 *
 * @param photoId - Unique identifier for the photo
 * @returns Full path to the original file, or null if not found
 */
export async function findOriginalFile(
  photoId: string,
): Promise<string | null> {
  const dir = join(env.STORAGE_PATH, "originals", photoId);
  try {
    const files = await readdir(dir);
    const original = files.find((f) => f.startsWith("original."));
    return original ? join(dir, original) : null;
  } catch {
    return null; // Directory doesn't exist
  }
}

/**
 * Delete all files associated with a photo
 *
 * Removes both originals and processed directories for the given photoId.
 * Uses recursive delete with force option - won't throw if directories don't exist.
 *
 * @param photoId - Unique identifier for the photo
 */
export async function deletePhotoFiles(photoId: string): Promise<void> {
  const originalsDir = join(env.STORAGE_PATH, "originals", photoId);
  const processedDir = join(env.STORAGE_PATH, "processed", photoId);

  // rm with { recursive: true, force: true } won't throw if directory doesn't exist
  await Promise.all([
    rm(originalsDir, { recursive: true, force: true }),
    rm(processedDir, { recursive: true, force: true }),
  ]);
}
