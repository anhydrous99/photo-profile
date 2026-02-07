/**
 * Smoke tests for test fixture images.
 *
 * Validates that the generated fixture images are:
 * - Valid and loadable by Sharp
 * - Correct dimensions and formats
 * - EXIF data present (or absent) as expected
 *
 * These tests also serve as usage examples for Phase 17 test authors.
 */

import { describe, it, expect } from "vitest";
import sharp from "sharp";
import path from "path";

const FIXTURES_DIR = path.join(process.cwd(), "src/__tests__/fixtures");

describe("Fixture image smoke tests", () => {
  it("tiny-landscape.jpg is a valid JPEG loadable by Sharp", async () => {
    const metadata = await sharp(
      path.join(FIXTURES_DIR, "tiny-landscape.jpg"),
    ).metadata();

    expect(metadata.format).toBe("jpeg");
    expect(metadata.width).toBe(8);
    expect(metadata.height).toBe(6);
  });

  it("tiny-landscape.jpg has EXIF data", async () => {
    const metadata = await sharp(
      path.join(FIXTURES_DIR, "tiny-landscape.jpg"),
    ).metadata();

    expect(metadata.exif).toBeTruthy();
    expect(metadata.exif).toBeInstanceOf(Buffer);
  });

  it("tiny-portrait.jpg has portrait dimensions", async () => {
    const metadata = await sharp(
      path.join(FIXTURES_DIR, "tiny-portrait.jpg"),
    ).metadata();

    expect(metadata.format).toBe("jpeg");
    expect(metadata.width).toBe(6);
    expect(metadata.height).toBe(8);
  });

  it("tiny-no-exif.png is a valid PNG without EXIF", async () => {
    const metadata = await sharp(
      path.join(FIXTURES_DIR, "tiny-no-exif.png"),
    ).metadata();

    expect(metadata.format).toBe("png");
    expect(metadata.width).toBe(8);
    expect(metadata.height).toBe(8);
    expect(metadata.exif).toBeUndefined();
  });
});
