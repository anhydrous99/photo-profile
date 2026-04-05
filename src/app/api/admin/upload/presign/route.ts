import { NextRequest } from "next/server";
import { presignS3Upload } from "@/infrastructure/storage";
import { env } from "@/infrastructure/config/env";
import { z } from "zod";
import {
  PRESIGN_MIME_TYPES,
  MAX_FILE_SIZE,
  S3_PRESIGN_EXPIRY_SECONDS,
} from "@/lib/constants";
import { withAuth, validateBody, successResponse } from "@/lib/apiHelpers";
import { handleRoute } from "@/lib/routeHandler";

import { z as zod } from "zod";

const presignSchema = z.object({
  filename: z.string().min(1),
  contentType: z.enum(PRESIGN_MIME_TYPES),
  fileSize: z.number().int().positive().max(MAX_FILE_SIZE),
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
  return handleRoute("POST /api/admin/upload/presign", async () => {
    return withAuth(async () => {
      const body = await request.json();
      const result = validateBody(presignSchema, body);
      if (result.error) return result.error;

      const { filename, contentType } = result.data;

      const photoId = crypto.randomUUID();
      const ext = extractExtension(filename, contentType);
      const key = `originals/${photoId}/original.${ext}`;

      const presignedUrl = await presignS3Upload({
        bucket: env.AWS_S3_BUCKET!,
        key,
        contentType,
        expiresIn: S3_PRESIGN_EXPIRY_SECONDS,
      });

      return successResponse({ presignedUrl, photoId, key });
    });
  });
}
