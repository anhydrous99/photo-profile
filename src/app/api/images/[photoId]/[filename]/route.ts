import { NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import { join } from "path";
import { env } from "@/infrastructure/config/env";

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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ photoId: string; filename: string }> },
): Promise<NextResponse> {
  const { photoId, filename } = await params;

  // Validate filename to prevent directory traversal
  if (!isValidFilename(filename)) {
    return new NextResponse("Invalid filename or unsupported format", {
      status: 400,
    });
  }

  const ext = getExtension(filename);
  const mimeType = MIME_TYPES[ext];
  const filePath = join(env.STORAGE_PATH, "processed", photoId, filename);

  try {
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
  } catch (error) {
    // File not found or other read error
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return new NextResponse("Image not found", { status: 404 });
    }
    // Re-throw unexpected errors
    throw error;
  }
}
