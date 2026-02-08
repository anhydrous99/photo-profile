import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { getStorageAdapter } from "@/infrastructure/storage";
import { logger } from "@/infrastructure/logging/logger";
import { isValidUUID } from "@/infrastructure/validation";

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
  if (filename.includes("..") || filename.includes("/")) {
    return false;
  }
  const ext = getExtension(filename);
  return ext in MIME_TYPES;
}

function isFileNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.message.startsWith("File not found");
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
  prefix: string,
  ext: string,
): Promise<string | null> {
  try {
    const adapter = getStorageAdapter();
    const keys = await adapter.listFiles(prefix);
    const matching = keys
      .filter((k) => k.endsWith(ext))
      .map((k) => {
        const filename = k.split("/").pop() ?? "";
        const widthMatch = filename.match(/^(\d+)w\./);
        return widthMatch
          ? { key: k, width: parseInt(widthMatch[1], 10) }
          : null;
      })
      .filter(
        (entry): entry is { key: string; width: number } => entry !== null,
      )
      .sort((a, b) => b.width - a.width);

    return matching.length > 0 ? matching[0].key : null;
  } catch {
    return null;
  }
}

function generateContentETag(buffer: Buffer): string {
  const hash = createHash("md5").update(buffer).digest("hex").slice(0, 16);
  return `"${hash}"`;
}

async function serveImage(
  request: Request,
  key: string,
  mimeType: string,
): Promise<NextResponse> {
  const adapter = getStorageAdapter();
  const fileBuffer = await adapter.getFile(key);
  const etag = generateContentETag(fileBuffer);

  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: { ETag: etag },
    });
  }

  return new NextResponse(new Uint8Array(fileBuffer), {
    status: 200,
    headers: {
      "Content-Type": mimeType,
      "Content-Length": fileBuffer.length.toString(),
      "Cache-Control": "public, max-age=31536000, immutable",
      ETag: etag,
    },
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ photoId: string; filename: string }> },
): Promise<NextResponse> {
  try {
    const { photoId, filename } = await params;

    if (!isValidUUID(photoId)) {
      return new NextResponse("Invalid photo ID format", {
        status: 400,
      });
    }

    if (!isValidFilename(filename)) {
      return new NextResponse("Invalid filename or unsupported format", {
        status: 400,
      });
    }

    const ext = getExtension(filename);
    const mimeType = MIME_TYPES[ext];
    const key = `processed/${photoId}/${filename}`;
    const prefix = `processed/${photoId}/`;

    try {
      return await serveImage(request, key, mimeType);
    } catch (error) {
      if (isFileNotFoundError(error)) {
        const fallbackKey = await findLargestDerivative(prefix, ext);
        if (fallbackKey) {
          try {
            return await serveImage(request, fallbackKey, mimeType);
          } catch {
            /* empty — fall through to 404 */
          }
        }
        return new NextResponse("Image not found", { status: 404 });
      }
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
