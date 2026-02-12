import path from "path";
import fs from "fs/promises";
import sharp from "sharp";
import { logger } from "@/infrastructure/logging/logger";
import {
  generateDerivatives,
  generateBlurPlaceholder,
} from "@/infrastructure/services/imageService";
import { extractExifData } from "@/infrastructure/services/exifService";
import { getStorageAdapter } from "@/infrastructure/storage";
import type { ImageJobResult } from "@/infrastructure/jobs/queues";

const CONTENT_TYPES: Record<string, string> = {
  ".webp": "image/webp",
  ".avif": "image/avif",
};

export async function processImageJob(data: {
  photoId: string;
  originalKey: string;
}): Promise<ImageJobResult> {
  const { photoId, originalKey } = data;
  const tempDir = `/tmp/photo-worker-${photoId}-${Date.now()}`;
  const originalFilename = path.basename(originalKey);
  const tempOriginalPath = path.join(tempDir, originalFilename);

  try {
    await fs.mkdir(tempDir, { recursive: true });

    const adapter = getStorageAdapter();
    const originalBuffer = await adapter.getFile(originalKey);
    await fs.writeFile(tempOriginalPath, originalBuffer);

    const derivatives = await generateDerivatives(tempOriginalPath, tempDir);

    const rotatedMeta = await sharp(tempOriginalPath).rotate().metadata();
    const width = rotatedMeta.width!;
    const height = rotatedMeta.height!;

    const exifData = await extractExifData(tempOriginalPath);

    const blurDataUrl = await generateBlurPlaceholder(tempOriginalPath);

    const entries = await fs.readdir(tempDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (entry.name.startsWith("original")) continue;

      const ext = path.extname(entry.name);
      const contentType = CONTENT_TYPES[ext];
      if (!contentType) continue;

      const fileBuffer = await fs.readFile(path.join(tempDir, entry.name));
      await adapter.saveFile(
        `processed/${photoId}/${entry.name}`,
        fileBuffer,
        contentType,
      );
    }

    logger.info(
      `Generated ${derivatives.length} files + blur placeholder + EXIF + dimensions (${width}x${height}) for photo ${photoId}`,
      {
        component: "image-processing",
        photoId,
        derivativeCount: derivatives.length,
        width,
        height,
      },
    );

    return { photoId, derivatives, blurDataUrl, exifData, width, height };
  } finally {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      logger.warn(`Failed to clean up temp dir: ${tempDir}`, {
        component: "image-processing",
        photoId,
      });
    }
  }
}
