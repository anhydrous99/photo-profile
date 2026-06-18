import { NextRequest } from "next/server";
import { z } from "zod";
import {
  createMultipartUpload,
  presignUploadParts,
} from "@/infrastructure/storage";
import { env } from "@/infrastructure/config/env";
import {
  VIDEO_UPLOAD_MIME_TYPES,
  VIDEO_MIME_EXTENSION,
  MAX_VIDEO_FILE_SIZE,
  MULTIPART_PART_SIZE,
  MULTIPART_MAX_PARTS,
  VIDEO_MULTIPART_PRESIGN_EXPIRY_SECONDS,
} from "@/lib/constants";
import {
  withAuth,
  validateBody,
  successResponse,
  errorResponse,
} from "@/lib/apiHelpers";
import { handleRoute } from "@/lib/routeHandler";

const createSchema = z.object({
  filename: z.string().min(1),
  contentType: z.enum(VIDEO_UPLOAD_MIME_TYPES),
  fileSize: z.number().int().positive().max(MAX_VIDEO_FILE_SIZE),
});

export async function POST(request: NextRequest) {
  return handleRoute("POST /api/admin/upload/video/create", async () => {
    return withAuth(async () => {
      if (!env.VIDEO_ENABLED) {
        return errorResponse("Video upload is not enabled", 400);
      }

      const body = await request.json();
      const result = validateBody(createSchema, body);
      if (result.error) return result.error;

      const { contentType, fileSize } = result.data;

      const photoId = crypto.randomUUID();
      const ext = VIDEO_MIME_EXTENSION[contentType] ?? "mp4";
      const key = `originals/${photoId}/original.${ext}`;

      const partCount = Math.max(Math.ceil(fileSize / MULTIPART_PART_SIZE), 1);
      // Guard rather than clamp: clamping would presign fewer parts than the
      // client needs, silently truncating the upload. Unreachable while
      // MAX_VIDEO_FILE_SIZE / MULTIPART_PART_SIZE stays under MULTIPART_MAX_PARTS.
      if (partCount > MULTIPART_MAX_PARTS) {
        return errorResponse("File requires too many upload parts", 400);
      }

      const uploadId = await createMultipartUpload({
        bucket: env.AWS_S3_BUCKET!,
        key,
        contentType,
      });

      const parts = await presignUploadParts({
        bucket: env.AWS_S3_BUCKET!,
        key,
        uploadId,
        partCount,
        expiresIn: VIDEO_MULTIPART_PRESIGN_EXPIRY_SECONDS,
      });

      return successResponse({
        photoId,
        key,
        uploadId,
        partSize: MULTIPART_PART_SIZE,
        parts,
      });
    });
  });
}
