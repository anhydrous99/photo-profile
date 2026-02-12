import type { ExifData } from "@/domain/entities/Photo";

/**
 * Job data for image processing tasks
 */
export interface ImageJobData {
  photoId: string;
  originalKey: string;
}

/**
 * Result returned after successful image processing
 */
export interface ImageJobResult {
  photoId: string;
  derivatives: string[];
  blurDataUrl: string;
  exifData: ExifData | null;
  width: number;
  height: number;
}
