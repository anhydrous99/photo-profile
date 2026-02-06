/**
 * Backfill EXIF metadata for existing photos
 *
 * Usage: npm run exif:backfill
 *
 * Finds all photos with null exif_data and extracts EXIF metadata
 * from the original image file on disk. Idempotent -- safe to re-run.
 *
 * Environment: Loaded via dotenv/config (--require flag in npm script)
 */
import path from "path";
import fs from "fs/promises";
import { eq, isNull } from "drizzle-orm";
import { db } from "@/infrastructure/database/client";
import { photos } from "@/infrastructure/database/schema";
import { extractExifData } from "@/infrastructure/services/exifService";
import { env } from "@/infrastructure/config/env";

async function backfill() {
  // Find all photos where exif_data is NULL
  const photosToUpdate = await db
    .select({ id: photos.id, originalFilename: photos.originalFilename })
    .from(photos)
    .where(isNull(photos.exifData));

  if (photosToUpdate.length === 0) {
    console.log("[Backfill] All photos already have EXIF data.");
    return;
  }

  const total = photosToUpdate.length;
  console.log(`[Backfill] Found ${total} photos without EXIF data.`);

  let processed = 0;
  let skipped = 0;
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

      // Extract EXIF using the same service as the worker
      const exifData = await extractExifData(originalPath);

      if (exifData === null) {
        // Store empty JSON object to mark as "checked, no EXIF" for idempotency.
        // Without this, photos with no EXIF would be re-processed every run.
        await db
          .update(photos)
          .set({ exifData: "{}" })
          .where(eq(photos.id, photo.id));
        console.log(
          `[Backfill] No EXIF data in photo ${photo.id}, marked as checked`,
        );
        skipped++;
        continue;
      }

      // Store EXIF data as JSON
      await db
        .update(photos)
        .set({ exifData: JSON.stringify(exifData) })
        .where(eq(photos.id, photo.id));

      processed++;
      console.log(
        `[Backfill] ${processed + skipped + failed}/${total} - Photo ${photo.id} (${exifData.cameraModel || "unknown camera"})`,
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
  console.log(`  Processed: ${processed} (EXIF extracted and stored)`);
  console.log(`  Skipped:   ${skipped} (no EXIF data in image)`);
  console.log(`  Failed:    ${failed} (missing file or error)`);
  console.log(`  Total:     ${total}`);
}

backfill().catch((err) => {
  console.error("[Backfill] Fatal error:", err);
  process.exit(1);
});
