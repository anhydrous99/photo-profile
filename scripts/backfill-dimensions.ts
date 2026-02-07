/**
 * Backfill width/height dimensions for existing photos
 *
 * Usage: npm run dimensions:backfill
 *
 * Finds all photos with null width/height and extracts post-rotation
 * dimensions from the original image file on disk using Sharp.
 * Idempotent -- safe to re-run.
 *
 * Environment: Loaded via dotenv/config (--require flag in npm script)
 */
import path from "path";
import fs from "fs/promises";
import sharp from "sharp";
import { eq, isNull } from "drizzle-orm";
import { db } from "@/infrastructure/database/client";
import { photos } from "@/infrastructure/database/schema";
import { env } from "@/infrastructure/config/env";

async function backfill() {
  // Find all photos where width is NULL
  const photosToUpdate = await db
    .select({ id: photos.id, originalFilename: photos.originalFilename })
    .from(photos)
    .where(isNull(photos.width));

  if (photosToUpdate.length === 0) {
    console.log("[Backfill] All photos already have dimensions.");
    return;
  }

  const total = photosToUpdate.length;
  console.log(`[Backfill] Found ${total} photos without dimensions.`);

  let processed = 0;
  let failed = 0;

  for (const photo of photosToUpdate) {
    try {
      // Look for original file in storage/originals/{id}/
      const originalsDir = path.join(env.STORAGE_PATH, "originals", photo.id);

      let originalPath: string | null = null;
      try {
        const files = await fs.readdir(originalsDir);
        const originalFile = files.find((f) => f.startsWith("original."));
        if (originalFile) {
          originalPath = path.join(originalsDir, originalFile);
        }
      } catch {
        // Directory doesn't exist
      }

      if (!originalPath) {
        console.error(
          `[Backfill] Original not found for photo ${photo.id}, counting as failed`,
        );
        failed++;
        continue;
      }

      // Use rotate() to get post-rotation dimensions (handles EXIF orientation)
      const metadata = await sharp(originalPath).rotate().metadata();
      const width = metadata.width;
      const height = metadata.height;

      if (!width || !height) {
        console.error(
          `[Backfill] Could not read dimensions for photo ${photo.id}`,
        );
        failed++;
        continue;
      }

      await db
        .update(photos)
        .set({ width, height })
        .where(eq(photos.id, photo.id));

      processed++;
      console.log(
        `[Backfill] ${processed + failed}/${total} - Photo ${photo.id} (${width}x${height})`,
      );
    } catch (error) {
      failed++;
      console.error(
        `[Backfill] Failed for photo ${photo.id}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  console.log(`[Backfill] Complete.`);
  console.log(`  Processed: ${processed} (dimensions stored)`);
  console.log(`  Failed:    ${failed} (missing file or error)`);
  console.log(`  Total:     ${total}`);
}

backfill().catch((err) => {
  console.error("[Backfill] Fatal error:", err);
  process.exit(1);
});
