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
  createdAt: Date;
  updatedAt: Date;
}
