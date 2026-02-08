import { NextResponse } from "next/server";
import { readFile, readdir, stat } from "fs/promises";
import { join } from "path";
import { env } from "@/infrastructure/config/env";
import { logger } from "@/infrastructure/logging/logger";

const MIME_TYPES: Record<string, string> = {
  ".webp": "image/webp",
  ".avif": "image/avif",
};

function getExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot === -1) return "";
  return filename.slice(lastDot).toLowerCase();
}

function isValidFilename(filename: string): boolean {
  // Reject directory traversal attempts
  if (filename.includes("..") || filename.includes("/")) {
    return false;
  }
  // Validate extension is supported
  const ext = getExtension(filename);
  return ext in MIME_TYPES;
}

/**
 * Find the largest available derivative of the same format.
 *
 * When the original image is smaller than some derivative widths,
 * generateDerivatives() correctly skips those sizes (no upscaling).
 * The custom image loader doesn't know which sizes exist, so it may
 * request e.g. 1200w.webp when only 300w.webp and 600w.webp exist.
 * This function falls back to the largest available file of the same format.
 */
async function findLargestDerivative(
  photoDir: string,
  ext: string,
): Promise<string | null> {
  try {
    const files = await readdir(photoDir);
    const matching = files
      .filter((f) => f.endsWith(ext))
      .map((f) => {
        const widthMatch = f.match(/^(\d+)w\./);
        return widthMatch
          ? { file: f, width: parseInt(widthMatch[1], 10) }
          : null;
      })
      .filter(
        (entry): entry is { file: string; width: number } => entry !== null,
      )
      .sort((a, b) => b.width - a.width);

    return matching.length > 0 ? matching[0].file : null;
  } catch {
    return null;
  }
}

async function serveImage(
  filePath: string,
  mimeType: string,
): Promise<NextResponse> {
  const [fileBuffer, fileStat] = await Promise.all([
    readFile(filePath),
    stat(filePath),
  ]);

  return new NextResponse(fileBuffer, {
    status: 200,
    headers: {
      "Content-Type": mimeType,
      "Content-Length": fileStat.size.toString(),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ photoId: string; filename: string }> },
): Promise<NextResponse> {
  try {
    const { photoId, filename } = await params;

    // Validate filename to prevent directory traversal
    if (!isValidFilename(filename)) {
      return new NextResponse("Invalid filename or unsupported format", {
        status: 400,
      });
    }

    const ext = getExtension(filename);
    const mimeType = MIME_TYPES[ext];
    const photoDir = join(env.STORAGE_PATH, "processed", photoId);
    const filePath = join(photoDir, filename);

    try {
      return await serveImage(filePath, mimeType);
    } catch (error) {
      // File not found - try falling back to largest available derivative
      if (
        error instanceof Error &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "ENOENT"
      ) {
        const fallback = await findLargestDerivative(photoDir, ext);
        if (fallback) {
          try {
            return await serveImage(join(photoDir, fallback), mimeType);
          } catch {
            // Fallback also failed, return 404
          }
        }
        return new NextResponse("Image not found", { status: 404 });
      }
      // Non-ENOENT error - log and return 500
      throw error;
    }
  } catch (error) {
    logger.error("GET /api/images/[photoId]/[filename] failed", {
      error:
        error instanceof Error
          ? { message: error.message, stack: error.stack }
          : error,
    });
    return new NextResponse("Internal server error", { status: 500 });
  }
}
