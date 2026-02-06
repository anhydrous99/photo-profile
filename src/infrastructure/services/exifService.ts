import sharp from "sharp";
import exifReader from "exif-reader";
import type { ExifData } from "@/domain/entities/Photo";

/**
 * Metering mode numeric codes from EXIF standard
 * Source: https://exiv2.org/tags.html (Tag 0x9207)
 */
const METERING_MODE_MAP: Record<number, string> = {
  0: "Unknown",
  1: "Average",
  2: "Center-weighted average",
  3: "Spot",
  4: "Multi-spot",
  5: "Pattern",
  6: "Partial",
};

/**
 * White balance numeric codes from EXIF standard
 * Source: https://exiv2.org/tags.html (Tag 0xA403)
 */
const WHITE_BALANCE_MAP: Record<number, string> = {
  0: "Auto",
  1: "Manual",
};

/**
 * Flash status codes from EXIF standard (bit field)
 * Source: https://exiv2.org/tags.html (Tag 0x9209)
 *
 * Bit 0: flash fired (0=no, 1=yes)
 * Bits 1-2: return detection
 * Bits 3-4: flash mode
 * Bit 5: flash function present
 * Bit 6: red-eye reduction
 */
const FLASH_MAP: Record<number, string> = {
  0x00: "Did not fire",
  0x01: "Fired",
  0x05: "Fired, return not detected",
  0x07: "Fired, return detected",
  0x08: "Did not fire, compulsory",
  0x09: "Fired, compulsory",
  0x0d: "Fired, compulsory, return not detected",
  0x0f: "Fired, compulsory, return detected",
  0x10: "Did not fire, compulsory suppression",
  0x18: "Did not fire, auto",
  0x19: "Fired, auto",
  0x1d: "Fired, auto, return not detected",
  0x1f: "Fired, auto, return detected",
  0x20: "No flash function",
  0x41: "Fired, red-eye reduction",
  0x45: "Fired, red-eye reduction, return not detected",
  0x47: "Fired, red-eye reduction, return detected",
  0x49: "Fired, compulsory, red-eye reduction",
  0x4d: "Fired, compulsory, red-eye, return not detected",
  0x4f: "Fired, compulsory, red-eye, return detected",
  0x59: "Fired, auto, red-eye reduction",
  0x5d: "Fired, auto, red-eye, return not detected",
  0x5f: "Fired, auto, red-eye, return detected",
};

/**
 * Format ExposureTime (seconds) into photographer-friendly string
 *
 * @param exposureTime - Exposure time in seconds (e.g. 0.004 for 1/250s)
 * @returns Formatted string like "1/250" or "30s", or null if input is null/undefined
 */
function formatShutterSpeed(
  exposureTime: number | undefined | null,
): string | null {
  if (exposureTime == null) return null;
  if (exposureTime >= 1) return `${exposureTime}s`;
  return `1/${Math.round(1 / exposureTime)}`;
}

/**
 * Map EXIF WhiteBalance numeric code to human-readable label
 */
function mapWhiteBalance(value: number | undefined | null): string | null {
  if (value == null) return null;
  return WHITE_BALANCE_MAP[value] ?? null;
}

/**
 * Map EXIF MeteringMode numeric code to human-readable label
 */
function mapMeteringMode(value: number | undefined | null): string | null {
  if (value == null) return null;
  return METERING_MODE_MAP[value] ?? null;
}

/**
 * Map EXIF Flash bit field to human-readable label
 *
 * Falls back to checking bit 0 (fired/did not fire) for unknown codes
 */
function mapFlash(value: number | undefined | null): string | null {
  if (value == null) return null;
  if (FLASH_MAP[value] != null) return FLASH_MAP[value];
  // Fallback: check bit 0 for fired status
  return value & 0x01 ? "Fired" : "Did not fire";
}

/**
 * Extract EXIF metadata from an image file
 *
 * Uses Sharp to read the raw EXIF buffer and exif-reader to parse it.
 * Only extracts the 11 fields defined in ExifData. Privacy-sensitive tags
 * (GPS coordinates, camera serial numbers, software/editor info) are never
 * accessed or stored.
 *
 * @param imagePath - Absolute path to the image file
 * @returns Parsed ExifData or null if no EXIF data / parsing fails
 */
export async function extractExifData(
  imagePath: string,
): Promise<ExifData | null> {
  try {
    const metadata = await sharp(imagePath).metadata();
    if (!metadata.exif) return null;

    const parsed = exifReader(metadata.exif);

    // Extract only the fields we need -- never access GPS, serial, or software tags
    const cameraMake: string | null =
      (parsed.Image?.Make as string | undefined) ??
      (parsed.Photo?.Make as string | undefined) ??
      null;
    const cameraModel: string | null =
      (parsed.Image?.Model as string | undefined) ??
      (parsed.Photo?.Model as string | undefined) ??
      null;
    const lens: string | null = parsed.Photo?.LensModel ?? null;
    const focalLength: number | null = parsed.Photo?.FocalLength ?? null;
    const aperture: number | null = parsed.Photo?.FNumber ?? null;
    const shutterSpeed: string | null = formatShutterSpeed(
      parsed.Photo?.ExposureTime,
    );

    // ISOSpeedRatings is typed as number in exif-reader
    const iso: number | null = parsed.Photo?.ISOSpeedRatings ?? null;

    // DateTimeOriginal in Photo IFD is a Date object
    let dateTaken: string | null = null;
    const dateRaw = parsed.Photo?.DateTimeOriginal;
    if (dateRaw instanceof Date) {
      dateTaken = dateRaw.toISOString();
    } else if (typeof dateRaw === "string") {
      dateTaken = dateRaw;
    }

    const whiteBalance: string | null = mapWhiteBalance(
      parsed.Photo?.WhiteBalance,
    );
    const meteringMode: string | null = mapMeteringMode(
      parsed.Photo?.MeteringMode,
    );
    const flash: string | null = mapFlash(parsed.Photo?.Flash);

    return {
      cameraMake,
      cameraModel,
      lens,
      focalLength,
      aperture,
      shutterSpeed,
      iso,
      dateTaken,
      whiteBalance,
      meteringMode,
      flash,
    };
  } catch {
    // Corrupted or missing EXIF is non-fatal -- return null
    return null;
  }
}
