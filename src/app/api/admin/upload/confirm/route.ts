import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/requireAuth";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { enqueueImageProcessing } from "@/infrastructure/jobs";
import { getPhotoRepository } from "@/infrastructure/database/dynamodb/repositories";
import { s3Client } from "@/infrastructure/storage/s3Client";
import { env } from "@/infrastructure/config/env";
import type { Photo } from "@/domain/entities";
import { logger } from "@/infrastructure/logging/logger";
import { PRESIGN_MIME_TYPES } from "@/lib/constants";
import { enqueueWithTimeout } from "@/lib/enqueueWithTimeout";
import { serializeError } from "@/lib/serializeError";

export const maxDuration = 300;

const photoRepository = getPhotoRepository();

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (authResult instanceof NextResponse) return authResult;

    const body = await request.json();

    const schema = z.object({
      photoId: z.string().uuid(),
      key: z.string().min(1),
      originalFilename: z.string().min(1),
    });

    const result = schema.safeParse(body);
    if (!result.success) {
      const errors = z.flattenError(result.error).fieldErrors;
      return NextResponse.json(
        { error: "Validation failed", details: errors },
        { status: 400 },
      );
    }

    const { photoId, key, originalFilename } = result.data;

    const existingPhoto = await photoRepository.findById(photoId);
    if (existingPhoto) {
      return NextResponse.json(
        { photoId, status: existingPhoto.status },
        { status: 200 },
      );
    }

    try {
      const headResult = await s3Client.send(
        new HeadObjectCommand({
          Bucket: env.AWS_S3_BUCKET,
          Key: key,
        }),
      );

      if (headResult.ContentLength === 0) {
        return NextResponse.json(
          { error: "Uploaded file is empty" },
          { status: 400 },
        );
      }

      if (
        !headResult.ContentType ||
        !PRESIGN_MIME_TYPES.includes(
          headResult.ContentType as (typeof PRESIGN_MIME_TYPES)[number],
        )
      ) {
        return NextResponse.json(
          {
            error: `Invalid file type: ${headResult.ContentType}. Allowed: JPEG, PNG, WebP, HEIC, HEIF`,
          },
          { status: 400 },
        );
      }
    } catch (error) {
      if (error instanceof Error && error.name === "NoSuchKey") {
        return NextResponse.json(
          { error: "File not found in S3" },
          { status: 400 },
        );
      }
      throw error;
    }

    const now = new Date();
    const photo: Photo = {
      id: photoId,
      title: null,
      description: null,
      originalFilename,
      blurDataUrl: null,
      exifData: null,
      width: null,
      height: null,
      status: "processing",
      createdAt: now,
      updatedAt: now,
    };
    await photoRepository.save(photo);

    try {
      await enqueueWithTimeout(enqueueImageProcessing(photoId, key), 10000);
    } catch (enqueueError) {
      logger.error(`Failed to enqueue processing for photo ${photoId}`, {
        component: "upload-confirm",
        photoId,
        error: serializeError(enqueueError),
      });
    }

    return NextResponse.json(
      { photoId, status: "processing" },
      { status: 201 },
    );
  } catch (error) {
    logger.error("POST /api/admin/upload/confirm failed", {
      error: serializeError(error),
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
