/**
 * Backfill blur placeholders for existing photos
 *
 * Usage: npx tsx scripts/backfill-blur-placeholders.ts
 *
 * Finds all photos with null blurDataUrl and generates a tiny base64
 * LQIP (Low Quality Image Placeholder) from the 300w.webp derivative.
 * Falls back to original image if derivative doesn't exist.
 */
import path from "path";
import fs from "fs/promises";
import { eq, isNull } from "drizzle-orm";
import { db } from "@/infrastructure/database/client";
import { photos } from "@/infrastructure/database/schema";
import { generateBlurPlaceholder } from "@/infrastructure/services/imageService";
import { env } from "@/infrastructure/config/env";

async function backfill() {
  // Find all photos without blur data
  const photosToUpdate = await db
    .select({ id: photos.id })
    .from(photos)
    .where(isNull(photos.blurDataUrl));

  if (photosToUpdate.length === 0) {
    console.log("[Backfill] All photos already have blur placeholders.");
    return;
  }

  console.log(
    `[Backfill] Found ${photosToUpdate.length} photos without blur placeholders.`,
  );

  let success = 0;
  let failed = 0;

  for (const photo of photosToUpdate) {
    try {
      // Prefer 300w.webp derivative (faster than processing original)
      const derivativePath = path.join(
        env.STORAGE_PATH,
        "processed",
        photo.id,
        "300w.webp",
      );

      // Check if derivative exists, fall back to original
      let sourcePath: string;
      try {
        await fs.access(derivativePath);
        sourcePath = derivativePath;
      } catch {
        // Try to find original image
        const originalsDir = path.join(env.STORAGE_PATH, "originals", photo.id);
        const files = await fs.readdir(originalsDir);
        const originalFile = files.find((f) => f.startsWith("original."));
        if (!originalFile) {
          console.error(
            `[Backfill] No source image found for photo ${photo.id}, skipping.`,
          );
          failed++;
          continue;
        }
        sourcePath = path.join(originalsDir, originalFile);
      }

      const blurDataUrl = await generateBlurPlaceholder(sourcePath);

      await db
        .update(photos)
        .set({ blurDataUrl })
        .where(eq(photos.id, photo.id));

      success++;
      console.log(
        `[Backfill] ${success}/${photosToUpdate.length} - Photo ${photo.id} (${blurDataUrl.length} bytes)`,
      );
    } catch (error) {
      failed++;
      console.error(
        `[Backfill] Failed for photo ${photo.id}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  console.log(
    `[Backfill] Complete. ${success} updated, ${failed} failed out of ${photosToUpdate.length} total.`,
  );
}

backfill().catch((err) => {
  console.error("[Backfill] Fatal error:", err);
  process.exit(1);
});
