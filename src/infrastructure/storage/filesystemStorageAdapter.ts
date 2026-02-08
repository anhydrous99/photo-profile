import { mkdir, writeFile, readFile, rm, readdir, access } from "fs/promises";
import { createReadStream } from "fs";
import { join, dirname } from "path";
import { Readable } from "stream";
import { env } from "@/infrastructure/config/env";
import { assertValidUUID } from "@/infrastructure/validation";
import type { StorageAdapter } from "./types";

const PHOTO_PATH_PREFIXES = ["originals/", "processed/"] as const;

function validatePhotoKeyIfApplicable(key: string): void {
  for (const prefix of PHOTO_PATH_PREFIXES) {
    if (key.startsWith(prefix)) {
      const photoId = key.slice(prefix.length).split("/")[0];
      assertValidUUID(photoId, "photoId");
      return;
    }
  }
}

export class FilesystemStorageAdapter implements StorageAdapter {
  private resolvePath(key: string): string {
    return join(env.STORAGE_PATH, key);
  }

  async saveFile(
    key: string,
    data: Buffer,
    _contentType: string,
  ): Promise<void> {
    validatePhotoKeyIfApplicable(key);
    const filePath = this.resolvePath(key);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, data);
  }

  async getFile(key: string): Promise<Buffer> {
    validatePhotoKeyIfApplicable(key);
    return readFile(this.resolvePath(key));
  }

  async getFileStream(key: string): Promise<ReadableStream> {
    validatePhotoKeyIfApplicable(key);
    const filePath = this.resolvePath(key);
    await access(filePath);
    const nodeStream = createReadStream(filePath);
    return Readable.toWeb(nodeStream) as ReadableStream;
  }

  async deleteFiles(prefix: string): Promise<void> {
    validatePhotoKeyIfApplicable(prefix);
    const dirPath = this.resolvePath(prefix);
    await rm(dirPath, { recursive: true, force: true });
  }

  async fileExists(key: string): Promise<boolean> {
    validatePhotoKeyIfApplicable(key);
    try {
      await access(this.resolvePath(key));
      return true;
    } catch {
      return false;
    }
  }

  async listFiles(prefix: string): Promise<string[]> {
    validatePhotoKeyIfApplicable(prefix);
    const dirPath = this.resolvePath(prefix);
    try {
      const entries = await readdir(dirPath);
      return entries.map((entry) => `${prefix}/${entry}`);
    } catch {
      return [];
    }
  }
}
