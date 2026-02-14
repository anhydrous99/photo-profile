import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/infrastructure/auth";
import { presignS3Upload } from "@/infrastructure/storage";
import { env } from "@/infrastructure/config/env";
import { z } from "zod";
import { logger } from "@/infrastructure/logging/logger";

const presignSchema = z.object({
  filename: z.string().min(1),
  contentType: z.enum([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
  ]),
  fileSize: z
    .number()
    .int()
    .positive()
    .max(100 * 1024 * 1024),
});

function extractExtension(filename: string, contentType: string): string {
  const ext = filename.toLowerCase().split(".").pop() || "";
  const allowedExtensions = ["jpg", "jpeg", "png", "webp", "heic", "heif"];

  if (allowedExtensions.includes(ext)) {
    return ext;
  }

  const mimeToExt: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif",
  };

  return mimeToExt[contentType] || "jpg";
}

export async function POST(request: NextRequest) {
  try {
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const result = presignSchema.safeParse(body);

    if (!result.success) {
      const flat = z.flattenError(result.error);
      return NextResponse.json(
        { error: "Validation failed", details: flat.fieldErrors },
        { status: 400 },
      );
    }

    const { filename, contentType, fileSize } = result.data;

    const photoId = crypto.randomUUID();
    const ext = extractExtension(filename, contentType);
    const key = `originals/${photoId}/original.${ext}`;

    const presignedUrl = await presignS3Upload({
      bucket: env.AWS_S3_BUCKET!,
      key,
      contentType,
      expiresIn: 900,
    });

    return NextResponse.json({ presignedUrl, photoId, key }, { status: 200 });
  } catch (error) {
    logger.error("POST /api/admin/upload/presign failed", {
      error:
        error instanceof Error
          ? { message: error.message, stack: error.stack }
          : error,
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
