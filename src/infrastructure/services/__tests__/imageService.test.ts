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
} from "@/infrastructure/services/imageService";
import {
  THUMBNAIL_SIZES,
  WEBP_QUALITY,
  AVIF_QUALITY,
  WEBP_EFFORT,
  AVIF_EFFORT,
} from "@/lib/constants";

const fixturesDir = path.join(process.cwd(), "src/__tests__/fixtures");
const imageServicePath = path.join(
  process.cwd(),
  "src/infrastructure/services/imageService.ts",
);

// Temp directory for the runtime-generated 400px test image
let largeTmpDir: string;
let largeFixturePath: string;

// Temp directory for a full-width test image that crosses every derivative threshold
let fullTmpDir: string;
let fullFixturePath: string;

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

  fullTmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "img-test-full-"));
  fullFixturePath = path.join(fullTmpDir, "test-2400x16.jpg");
  await sharp({
    create: {
      width: 2400,
      height: 16,
      channels: 3,
      background: { r: 80, g: 120, b: 160 },
    },
  })
    .jpeg({ quality: 80 })
    .toFile(fullFixturePath);
});

afterAll(async () => {
  await fs.rm(largeTmpDir, { recursive: true, force: true });
  await fs.rm(fullTmpDir, { recursive: true, force: true });
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

  describe("Sharp pipeline contract", () => {
    it("keeps orientation, color metadata, no-upscale, and codec quality options frozen", async () => {
      const source = await fs.readFile(imageServicePath, "utf8");

      expect(source).toContain(".rotate()");
      expect(source).toContain(".withMetadata()");
      expect(source).toContain("withoutEnlargement: true");
      expect(source).toContain('fit: "inside"');
      expect(WEBP_QUALITY).toBe(82);
      expect(AVIF_QUALITY).toBe(80);
      expect(WEBP_EFFORT).toBe(4);
      expect(AVIF_EFFORT).toBe(4);
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

  describe("with 2400px-wide image", () => {
    it("returns all 8 derivative paths in width and format order", async () => {
      const result = await generateDerivatives(fullFixturePath, outputDir);
      const filenames = result.map((resultPath) => path.basename(resultPath));

      expect(filenames).toEqual([
        "300w.webp",
        "300w.avif",
        "600w.webp",
        "600w.avif",
        "1200w.webp",
        "1200w.avif",
        "2400w.webp",
        "2400w.avif",
      ]);
    });

    it("writes valid derivatives at the exact frozen widths without upscaling", async () => {
      await generateDerivatives(fullFixturePath, outputDir);

      for (const width of THUMBNAIL_SIZES) {
        const webpMeta = await sharp(
          path.join(outputDir, `${width}w.webp`),
        ).metadata();
        const avifMeta = await sharp(
          path.join(outputDir, `${width}w.avif`),
        ).metadata();

        expect(webpMeta.format).toBe("webp");
        expect(webpMeta.width).toBe(width);
        expect(avifMeta.format).toBe("heif");
        expect(avifMeta.width).toBe(width);
      }
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

  it("encodes a 10px-wide WebP placeholder with quality 20", async () => {
    const result = await generateBlurPlaceholder(largeFixturePath);
    const base64Payload = result.replace("data:image/webp;base64,", "");
    const metadata = await sharp(
      Buffer.from(base64Payload, "base64"),
    ).metadata();
    const source = await fs.readFile(imageServicePath, "utf8");

    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBe(10);
    expect(source).toContain(".webp({ quality: 20 })");
  });
});
