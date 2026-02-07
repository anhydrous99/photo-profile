/**
 * Fixture image generator for test suite.
 *
 * Generates 3 tiny test images using Sharp:
 * - tiny-landscape.jpg: 8x6 JPEG with EXIF data (Make, Model)
 * - tiny-portrait.jpg: 6x8 JPEG with EXIF data
 * - tiny-no-exif.png: 8x8 PNG without EXIF
 *
 * Usage: npx tsx src/__tests__/fixtures/generate-fixtures.ts
 */

import sharp from "sharp";
import path from "path";

const FIXTURES_DIR = path.join(process.cwd(), "src/__tests__/fixtures");

async function generateFixtures() {
  // 1. Landscape JPEG with EXIF data (8x6)
  await sharp({
    create: {
      width: 8,
      height: 6,
      channels: 3,
      background: { r: 100, g: 150, b: 200 },
    },
  })
    .jpeg({ quality: 90 })
    .withExif({
      IFD0: {
        Make: "TestCamera",
        Model: "TestModel X100",
        ImageDescription: "Test landscape image",
      },
    })
    .toFile(path.join(FIXTURES_DIR, "tiny-landscape.jpg"));

  // 2. Portrait JPEG with EXIF data (6x8)
  await sharp({
    create: {
      width: 6,
      height: 8,
      channels: 3,
      background: { r: 200, g: 100, b: 100 },
    },
  })
    .jpeg({ quality: 90 })
    .withExif({
      IFD0: {
        Make: "AnotherBrand",
        Model: "Pro 50",
      },
    })
    .toFile(path.join(FIXTURES_DIR, "tiny-portrait.jpg"));

  // 3. PNG without EXIF (8x8)
  await sharp({
    create: {
      width: 8,
      height: 8,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0.5 },
    },
  })
    .png()
    .toFile(path.join(FIXTURES_DIR, "tiny-no-exif.png"));

  console.log("Fixtures generated successfully:");
  console.log("  - tiny-landscape.jpg (8x6 JPEG with EXIF)");
  console.log("  - tiny-portrait.jpg (6x8 JPEG with EXIF)");
  console.log("  - tiny-no-exif.png (8x8 PNG, no EXIF)");
}

generateFixtures().catch((err) => {
  console.error("Failed to generate fixtures:", err);
  process.exit(1);
});
