import { NextRequest } from "next/server";
import { z } from "zod";
import { abortMultipartUpload } from "@/infrastructure/storage";
import { env } from "@/infrastructure/config/env";
import {
  withAuth,
  validateBody,
  successResponse,
  errorResponse,
} from "@/lib/apiHelpers";
import { handleRoute } from "@/lib/routeHandler";

const abortSchema = z.object({
  key: z.string().min(1),
  uploadId: z.string().min(1),
});

export async function POST(request: NextRequest) {
  return handleRoute("POST /api/admin/upload/video/abort", async () => {
    return withAuth(async () => {
      if (!env.VIDEO_ENABLED) {
        return errorResponse("Video upload is not enabled", 400);
      }

      const body = await request.json();
      const result = validateBody(abortSchema, body);
      if (result.error) return result.error;

      const { key, uploadId } = result.data;

      await abortMultipartUpload({
        bucket: env.AWS_S3_BUCKET!,
        key,
        uploadId,
      });

      return successResponse({ aborted: true });
    });
  });
}
