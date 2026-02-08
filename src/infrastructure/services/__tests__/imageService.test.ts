import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import sharp from "sharp";
import {
  generateDerivatives,
  generateBlurPlaceholder,
  getImageMetadata,
  THUMBNAIL_SIZES,
} from "@/infrastructure/services/imageService";

const fixturesDir = path.join(process.cwd(), "src/__tests__/fixtures");

// Temp directory for the runtime-generated 400px test image
let largeTmpDir: string;
let largeFixturePath: string;

// Per-test output directory for derivative generation
let outputDir: string;

beforeAll(async () => {
  // Create a 400x300 JPEG image for derivative generation tests
  largeTmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "img-test-large-"));
  largeFixturePath = path.join(largeTmpDir, "test-400x300.jpg");
  await sharp({
    create: {
      width: 400,
      height: 300,
      channels: 3,
      background: { r: 128, g: 128, b: 128 },
    },
  })
    .jpeg({ quality: 80 })
    .toFile(largeFixturePath);
});

afterAll(async () => {
  await fs.rm(largeTmpDir, { recursive: true, force: true });
});

beforeEach(async () => {
  outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "img-test-out-"));
});

afterEach(async () => {
  await fs.rm(outputDir, { recursive: true, force: true });
});

describe("THUMBNAIL_SIZES", () => {
  it("exports the expected size array", () => {
    expect([...THUMBNAIL_SIZES]).toEqual([300, 600, 1200, 2400]);
  });
});

describe("getImageMetadata", () => {
  it("returns correct width and height for tiny-landscape.jpg", async () => {
    const meta = await getImageMetadata(
      path.join(fixturesDir, "tiny-landscape.jpg"),
    );
    expect(meta.width).toBe(8);
    expect(meta.height).toBe(6);
  });

  it("returns correct format for tiny-landscape.jpg", async () => {
    const meta = await getImageMetadata(
      path.join(fixturesDir, "tiny-landscape.jpg"),
    );
    expect(meta.format).toBe("jpeg");
  });
});

describe("generateDerivatives", () => {
  describe("with tiny fixture (8px wide)", () => {
    it("returns empty array since all sizes exceed original width", async () => {
      const tinyPath = path.join(fixturesDir, "tiny-landscape.jpg");
      const result = await generateDerivatives(tinyPath, outputDir);
      expect(result).toEqual([]);
    });

    it("creates output directory but writes no files", async () => {
      const tinyPath = path.join(fixturesDir, "tiny-landscape.jpg");
      await generateDerivatives(tinyPath, outputDir);
      const files = await fs.readdir(outputDir);
      expect(files).toHaveLength(0);
    });
  });

  describe("with 400px-wide image", () => {
    it("returns exactly 2 paths (300w.webp and 300w.avif)", async () => {
      const result = await generateDerivatives(largeFixturePath, outputDir);
      expect(result).toHaveLength(2);
      expect(result[0]).toContain("300w.webp");
      expect(result[1]).toContain("300w.avif");
    });

    it("output directory contains exactly 300w.webp and 300w.avif", async () => {
      await generateDerivatives(largeFixturePath, outputDir);
      const files = (await fs.readdir(outputDir)).sort();
      expect(files).toEqual(["300w.avif", "300w.webp"]);
    });

    it("generates valid WebP output at correct width", async () => {
      await generateDerivatives(largeFixturePath, outputDir);
      const webpMeta = await sharp(
        path.join(outputDir, "300w.webp"),
      ).metadata();
      expect(webpMeta.format).toBe("webp");
      expect(webpMeta.width).toBe(300);
    });

    it("generates valid AVIF output at correct width", async () => {
      await generateDerivatives(largeFixturePath, outputDir);
      const avifMeta = await sharp(
        path.join(outputDir, "300w.avif"),
      ).metadata();
      // Sharp reports AVIF as "heif"
      expect(avifMeta.format).toBe("heif");
      expect(avifMeta.width).toBe(300);
    });
  });
});

describe("generateBlurPlaceholder", () => {
  it("returns a valid base64 WebP data URL", async () => {
    const tinyPath = path.join(fixturesDir, "tiny-landscape.jpg");
    const result = await generateBlurPlaceholder(tinyPath);
    expect(result).toMatch(/^data:image\/webp;base64,/);
  });

  it("produces a result under 500 bytes", async () => {
    const tinyPath = path.join(fixturesDir, "tiny-landscape.jpg");
    const result = await generateBlurPlaceholder(tinyPath);
    expect(result.length).toBeLessThan(500);
  });
});
