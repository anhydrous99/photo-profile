import sharp from "sharp";
import fs from "fs/promises";
import path from "path";

/**
 * Thumbnail sizes for derivative generation
 * Images are resized to fit within these widths while maintaining aspect ratio
 */
export const THUMBNAIL_SIZES = [300, 600, 1200, 2400] as const;

/**
 * Quality settings for output formats
 * - WebP 82 balances quality and file size for web delivery
 * - AVIF 80 (more efficient than JPEG, better compression)
 */
const WEBP_QUALITY = 82;
const AVIF_QUALITY = 80;

/**
 * Get metadata from an image file
 *
 * @param inputPath - Path to the image file
 * @returns Sharp metadata including width, height, format, etc.
 */
export async function getImageMetadata(
  inputPath: string,
): Promise<sharp.Metadata> {
  return sharp(inputPath).metadata();
}

/**
 * Generate derivative images in multiple sizes and formats
 *
 * Creates WebP and AVIF versions at each thumbnail size smaller than the original.
 * Handles:
 * - EXIF orientation auto-correction via rotate()
 * - sRGB color profile preservation via withMetadata()
 * - No upscaling (skips sizes larger than original)
 *
 * Output files:
 * - {width}w.webp - WebP format for broad browser support
 * - {width}w.avif - AVIF format for best compression
 *
 * @param inputPath - Path to the original image
 * @param outputDir - Directory to write derivative files
 * @returns Array of generated file paths
 */
export async function generateDerivatives(
  inputPath: string,
  outputDir: string,
): Promise<string[]> {
  // Ensure output directory exists
  await fs.mkdir(outputDir, { recursive: true });

  // Get original metadata to check dimensions
  const metadata = await getImageMetadata(inputPath);
  const originalWidth = metadata.width ?? 0;

  const generatedPaths: string[] = [];

  for (const width of THUMBNAIL_SIZES) {
    // Skip if original is smaller than target (don't upscale)
    if (originalWidth < width) {
      continue;
    }

    // Create Sharp pipeline with:
    // - rotate(): auto-orient from EXIF (CRITICAL - prevents rotated thumbnails)
    // - resize(): fit inside target width, maintain aspect ratio
    // - withMetadata(): preserve sRGB ICC profile (CRITICAL - prevents color shift)
    const pipeline = sharp(inputPath)
      .rotate()
      .resize(width, null, {
        fit: "inside",
        withoutEnlargement: true,
        kernel: "lanczos3",
      })
      .withMetadata();

    // Generate WebP output
    const webpPath = path.join(outputDir, `${width}w.webp`);
    await pipeline
      .clone()
      .webp({
        quality: WEBP_QUALITY,
        effort: 4, // Balance speed/compression (0-6, 4 is good middle ground)
      })
      .toFile(webpPath);
    generatedPaths.push(webpPath);

    // Generate AVIF output
    const avifPath = path.join(outputDir, `${width}w.avif`);
    await pipeline
      .clone()
      .avif({
        quality: AVIF_QUALITY,
        effort: 4, // Balance speed/compression (0-9, 4 is good middle ground)
      })
      .toFile(avifPath);
    generatedPaths.push(avifPath);
  }

  return generatedPaths;
}
