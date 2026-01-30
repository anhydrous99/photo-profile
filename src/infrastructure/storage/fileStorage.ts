import { mkdir, writeFile } from "fs/promises";
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
