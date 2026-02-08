import { describe, it, expect } from "vitest";
import path from "path";
import { extractExifData } from "@/infrastructure/services/exifService";

const fixturesDir = path.join(process.cwd(), "src/__tests__/fixtures");

/** All 11 fields defined in the ExifData interface */
const EXIF_DATA_KEYS = [
  "cameraMake",
  "cameraModel",
  "lens",
  "focalLength",
  "aperture",
  "shutterSpeed",
  "iso",
  "dateTaken",
  "whiteBalance",
  "meteringMode",
  "flash",
] as const;

describe("extractExifData", () => {
  describe("tiny-landscape.jpg (has EXIF)", () => {
    it("returns non-null ExifData", async () => {
      const result = await extractExifData(
        path.join(fixturesDir, "tiny-landscape.jpg"),
      );
      expect(result).not.toBeNull();
    });

    it("extracts cameraMake as TestCamera", async () => {
      const result = await extractExifData(
        path.join(fixturesDir, "tiny-landscape.jpg"),
      );
      expect(result!.cameraMake).toBe("TestCamera");
    });

    it("extracts cameraModel as TestModel X100", async () => {
      const result = await extractExifData(
        path.join(fixturesDir, "tiny-landscape.jpg"),
      );
      expect(result!.cameraModel).toBe("TestModel X100");
    });

    it("has all 11 ExifData fields as keys", async () => {
      const result = await extractExifData(
        path.join(fixturesDir, "tiny-landscape.jpg"),
      );
      expect(result).not.toBeNull();
      for (const key of EXIF_DATA_KEYS) {
        expect(result).toHaveProperty(key);
      }
    });
  });

  describe("tiny-portrait.jpg (has EXIF)", () => {
    it("returns non-null ExifData", async () => {
      const result = await extractExifData(
        path.join(fixturesDir, "tiny-portrait.jpg"),
      );
      expect(result).not.toBeNull();
    });

    it("extracts cameraMake as AnotherBrand", async () => {
      const result = await extractExifData(
        path.join(fixturesDir, "tiny-portrait.jpg"),
      );
      expect(result!.cameraMake).toBe("AnotherBrand");
    });

    it("extracts cameraModel as Pro 50", async () => {
      const result = await extractExifData(
        path.join(fixturesDir, "tiny-portrait.jpg"),
      );
      expect(result!.cameraModel).toBe("Pro 50");
    });
  });

  describe("tiny-no-exif.png (no EXIF)", () => {
    it("returns null", async () => {
      const result = await extractExifData(
        path.join(fixturesDir, "tiny-no-exif.png"),
      );
      expect(result).toBeNull();
    });
  });

  describe("non-existent file", () => {
    it("returns null without throwing", async () => {
      const result = await extractExifData("/tmp/does-not-exist-12345.jpg");
      expect(result).toBeNull();
    });
  });
});
