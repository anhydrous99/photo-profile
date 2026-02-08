import { env } from "@/infrastructure/config/env";
import { FilesystemStorageAdapter } from "./filesystemStorageAdapter";
import { S3StorageAdapter } from "./s3StorageAdapter";
import type { StorageAdapter } from "./types";

let instance: StorageAdapter | null = null;

export function getStorageAdapter(): StorageAdapter {
  if (!instance) {
    instance =
      env.STORAGE_BACKEND === "s3"
        ? new S3StorageAdapter()
        : new FilesystemStorageAdapter();
  }
  return instance;
}

export function resetStorageAdapter(): void {
  instance = null;
}

export function getImageUrl(photoId: string, filename: string): string {
  if (env.STORAGE_BACKEND === "s3") {
    return `https://${env.AWS_CLOUDFRONT_DOMAIN}/processed/${photoId}/${filename}`;
  }
  return `/api/images/${photoId}/${filename}`;
}
