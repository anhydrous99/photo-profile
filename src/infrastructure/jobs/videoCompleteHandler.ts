import type { EventBridgeEvent } from "aws-lambda";
import { processImageJob } from "@/infrastructure/services/imageProcessingJob";
import { getStorageAdapter } from "@/infrastructure/storage";
import { getPhotoRepository } from "@/infrastructure/database/dynamodb/repositories";
import { logger } from "@/infrastructure/logging/logger";
import { serializeError } from "@/lib/serializeError";
import { VIDEO_POSTER_PREFIX } from "@/lib/constants";

/**
 * EventBridge handler for MediaConvert "Job State Change" events.
 *
 * On COMPLETE: converts the captured poster frame into the standard
 * {width}w.webp/avif derivative set (reusing the image pipeline), records the
 * blur placeholder / dimensions / duration, and flips the Photo to "ready".
 * On ERROR: marks the Photo "error".
 *
 * The job's UserMetadata.photoId correlates the event back to the record.
 */

interface MediaConvertOutputDetail {
  durationInMs?: number;
  videoDetails?: { widthInPx?: number; heightInPx?: number };
}

interface MediaConvertOutputGroupDetail {
  outputDetails?: MediaConvertOutputDetail[];
}

export interface MediaConvertJobDetail {
  status: string;
  jobId?: string;
  userMetadata?: Record<string, string>;
  outputGroupDetails?: MediaConvertOutputGroupDetail[];
  errorMessage?: string;
}

type MediaConvertEvent = EventBridgeEvent<
  "MediaConvert Job State Change",
  MediaConvertJobDetail
>;

const photoRepository = getPhotoRepository();

/** Longest output duration across all output groups, or null if unknown. */
export function extractDurationMs(
  detail: MediaConvertJobDetail,
): number | null {
  let max = 0;
  for (const group of detail.outputGroupDetails ?? []) {
    for (const output of group.outputDetails ?? []) {
      if (typeof output.durationInMs === "number") {
        max = Math.max(max, output.durationInMs);
      }
    }
  }
  return max > 0 ? max : null;
}

async function findPosterKey(photoId: string): Promise<string | null> {
  const adapter = getStorageAdapter();
  const keys = await adapter.listFiles(
    `processed/${photoId}/${VIDEO_POSTER_PREFIX}/`,
  );
  return keys.find((k) => k.toLowerCase().endsWith(".jpg")) ?? null;
}

async function markError(photoId: string): Promise<void> {
  try {
    const photo = await photoRepository.findById(photoId);
    if (photo) {
      photo.status = "error";
      photo.updatedAt = new Date();
      await photoRepository.save(photo);
    }
  } catch (error) {
    logger.warn("Failed to mark video as error", {
      component: "lambda-video-complete",
      photoId,
      error: serializeError(error),
    });
  }
}

export async function handler(event: MediaConvertEvent): Promise<void> {
  const detail = event.detail;
  const photoId = detail?.userMetadata?.photoId;

  if (!photoId) {
    logger.warn("MediaConvert event missing userMetadata.photoId", {
      component: "lambda-video-complete",
      jobId: detail?.jobId,
      status: detail?.status,
    });
    return;
  }

  if (detail.status === "ERROR") {
    logger.error("MediaConvert job failed", {
      component: "lambda-video-complete",
      photoId,
      jobId: detail.jobId,
      message: detail.errorMessage,
    });
    await markError(photoId);
    return;
  }

  if (detail.status !== "COMPLETE") {
    // Only COMPLETE/ERROR are subscribed; ignore anything else defensively.
    return;
  }

  try {
    const posterKey = await findPosterKey(photoId);
    if (!posterKey) {
      throw new Error(`No poster frame found for video ${photoId}`);
    }

    // Reuse the image pipeline: generates {w}w.webp/avif derivatives + blur +
    // dimensions from the poster JPEG (frame capture carries no EXIF).
    const result = await processImageJob({ photoId, originalKey: posterKey });
    const durationMs = extractDurationMs(detail);

    const photo = await photoRepository.findById(photoId);
    if (photo) {
      photo.status = "ready";
      photo.mediaType = "video";
      photo.blurDataUrl = result.blurDataUrl;
      photo.width = result.width;
      photo.height = result.height;
      photo.durationMs = durationMs;
      photo.updatedAt = new Date();
      await photoRepository.save(photo);
    }

    logger.info("Video processing completed", {
      component: "lambda-video-complete",
      photoId,
      width: result.width,
      height: result.height,
      durationMs,
    });
  } catch (error) {
    logger.error("Video completion handler failed", {
      component: "lambda-video-complete",
      photoId,
      error: serializeError(error),
    });
    await markError(photoId);
  }
}
