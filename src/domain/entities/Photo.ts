export interface ExifData {
  cameraMake: string | null;
  cameraModel: string | null;
  lens: string | null;
  focalLength: number | null; // in mm
  aperture: number | null; // f-number (e.g. 2.8)
  shutterSpeed: string | null; // formatted string (e.g. "1/250")
  iso: number | null;
  dateTaken: string | null; // ISO 8601 string
  whiteBalance: string | null; // "Auto", "Manual", etc.
  meteringMode: string | null; // "Matrix", "Center-weighted average", etc.
  flash: string | null; // "Fired", "Did not fire", etc.
}

/**
 * Discriminates the kind of media a record represents.
 * Legacy records (created before video support) have no stored value and are
 * treated as "image" when read back from the database.
 */
export type MediaType = "image" | "video";

export interface Photo {
  id: string;
  title: string | null;
  description: string | null;
  originalFilename: string;
  blurDataUrl: string | null;
  exifData: ExifData | null;
  width: number | null;
  height: number | null;
  status: "processing" | "ready" | "error";
  /** "image" (default) or "video". Videos are transcoded to HLS + a poster. */
  mediaType: MediaType;
  /** Video duration in milliseconds; null for images. */
  durationMs: number | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Serializable photo data for client components.
 * A subset of Photo without Date objects (which don't serialize to JSON).
 */
export interface PhotoData {
  id: string;
  title: string | null;
  description: string | null;
  originalFilename: string;
  blurDataUrl: string | null;
  exifData?: ExifData | null;
  width: number | null;
  height: number | null;
  mediaType: MediaType;
  durationMs?: number | null;
}
