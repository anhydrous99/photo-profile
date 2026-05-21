import { describe, it, expect, vi, afterEach } from "vitest";
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

const FORBIDDEN_EXIF_KEYS = [
  "gps",
  "gpsLatitude",
  "gpsLongitude",
  "GPSInfo",
  "serialNumber",
  "bodySerialNumber",
  "cameraSerialNumber",
  "software",
  "Software",
  "HostComputer",
] as const;

afterEach(() => {
  vi.doUnmock("sharp");
  vi.doUnmock("exif-reader");
  vi.resetModules();
});

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
      expect(Object.keys(result!)).toEqual([...EXIF_DATA_KEYS]);
    });

    it("does not expose forbidden privacy-sensitive EXIF fields", async () => {
      const result = await extractExifData(
        path.join(fixturesDir, "tiny-landscape.jpg"),
      );

      expect(result).not.toBeNull();
      for (const key of FORBIDDEN_EXIF_KEYS) {
        expect(result).not.toHaveProperty(key);
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

  describe("privacy allowlist contract", () => {
    it("maps only ExifData allowlist fields when raw EXIF includes GPS, serial, and software tags", async () => {
      vi.resetModules();
      vi.doMock("sharp", () => ({
        default: vi.fn(() => ({
          metadata: vi.fn().mockResolvedValue({
            exif: Buffer.from("mock-exif"),
          }),
        })),
      }));
      vi.doMock("exif-reader", () => ({
        default: vi.fn(() => ({
          Image: {
            Make: "AllowedMake",
            Model: "AllowedModel",
            Software: "ForbiddenEditor",
            HostComputer: "ForbiddenHost",
          },
          Photo: {
            LensModel: "AllowedLens",
            FocalLength: 35,
            FNumber: 2.8,
            ExposureTime: 0.004,
            ISOSpeedRatings: 400,
            DateTimeOriginal: new Date("2025-01-02T03:04:05.000Z"),
            WhiteBalance: 1,
            MeteringMode: 5,
            Flash: 0x01,
            BodySerialNumber: "ForbiddenBodySerial",
            CameraSerialNumber: "ForbiddenCameraSerial",
          },
          GPSInfo: {
            GPSLatitude: [40, 42, 51],
            GPSLongitude: [74, 0, 21],
          },
        })),
      }));

      const { extractExifData: isolatedExtractExifData } =
        await import("../exifService");
      const result = await isolatedExtractExifData("/tmp/mock-exif.jpg");

      expect(result).toEqual({
        cameraMake: "AllowedMake",
        cameraModel: "AllowedModel",
        lens: "AllowedLens",
        focalLength: 35,
        aperture: 2.8,
        shutterSpeed: "1/250",
        iso: 400,
        dateTaken: "2025-01-02T03:04:05.000Z",
        whiteBalance: "Manual",
        meteringMode: "Pattern",
        flash: "Fired",
      });
      for (const key of FORBIDDEN_EXIF_KEYS) {
        expect(result).not.toHaveProperty(key);
      }
    });
  });

  describe("non-existent file", () => {
    it("returns null without throwing", async () => {
      const result = await extractExifData("/tmp/does-not-exist-12345.jpg");
      expect(result).toBeNull();
    });
  });
});
