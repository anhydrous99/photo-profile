import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Photo } from "@/domain/entities";

// --- Hoisted mocks ---

const mockProcessImageJob = vi.hoisted(() => vi.fn());
const mockAdapter = vi.hoisted(() => ({ listFiles: vi.fn() }));
const mockPhotoRepository = vi.hoisted(() => ({
  findById: vi.fn(),
  save: vi.fn(),
}));
const mockLogger = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

// --- Module mocks ---

vi.mock("@/infrastructure/services/imageProcessingJob", () => ({
  processImageJob: mockProcessImageJob,
}));

vi.mock("@/infrastructure/storage", () => ({
  getStorageAdapter: () => mockAdapter,
}));

vi.mock("@/infrastructure/database/dynamodb/repositories", () => ({
  DynamoDBPhotoRepository: vi.fn(),
  getPhotoRepository: () => mockPhotoRepository,
  getAlbumRepository: vi.fn(),
}));

vi.mock("@/infrastructure/logging/logger", () => ({ logger: mockLogger }));

import {
  handler,
  extractDurationMs,
  type MediaConvertJobDetail,
} from "../videoCompleteHandler";

const PHOTO_ID = "00000000-0000-0000-0000-000000000001";
const POSTER_KEY = `processed/${PHOTO_ID}/poster/poster.0000000.jpg`;

function makeVideoPhoto(): Photo {
  return {
    id: PHOTO_ID,
    title: null,
    description: null,
    originalFilename: "clip.mp4",
    blurDataUrl: null,
    exifData: null,
    width: null,
    height: null,
    status: "processing",
    mediaType: "video",
    durationMs: null,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
  };
}

function makeEvent(detail: MediaConvertJobDetail) {
  return {
    detail,
  } as Parameters<typeof handler>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("extractDurationMs", () => {
  it("returns the maximum durationInMs across outputs", () => {
    const detail: MediaConvertJobDetail = {
      status: "COMPLETE",
      outputGroupDetails: [
        { outputDetails: [{ durationInMs: 1000 }, { durationInMs: 5000 }] },
        { outputDetails: [{}] },
      ],
    };
    expect(extractDurationMs(detail)).toBe(5000);
  });

  it("returns null when no duration is present", () => {
    expect(extractDurationMs({ status: "COMPLETE" })).toBeNull();
  });
});

describe("videoCompleteHandler", () => {
  it("on COMPLETE generates poster derivatives and marks the photo ready", async () => {
    mockAdapter.listFiles.mockResolvedValue([POSTER_KEY]);
    mockProcessImageJob.mockResolvedValue({
      photoId: PHOTO_ID,
      derivatives: ["300w.webp"],
      blurDataUrl: "data:image/webp;base64,AAAA",
      exifData: null,
      width: 1920,
      height: 1080,
    });
    const photo = makeVideoPhoto();
    mockPhotoRepository.findById.mockResolvedValue(photo);

    await handler(
      makeEvent({
        status: "COMPLETE",
        userMetadata: { photoId: PHOTO_ID },
        outputGroupDetails: [{ outputDetails: [{ durationInMs: 4200 }] }],
      }),
    );

    expect(mockProcessImageJob).toHaveBeenCalledWith({
      photoId: PHOTO_ID,
      originalKey: POSTER_KEY,
    });
    expect(mockPhotoRepository.save).toHaveBeenCalledTimes(1);
    const saved = mockPhotoRepository.save.mock.calls[0][0] as Photo;
    expect(saved.status).toBe("ready");
    expect(saved.mediaType).toBe("video");
    expect(saved.durationMs).toBe(4200);
    expect(saved.width).toBe(1920);
    expect(saved.height).toBe(1080);
    expect(saved.blurDataUrl).toBe("data:image/webp;base64,AAAA");
  });

  it("marks the photo as error when no poster frame is found", async () => {
    mockAdapter.listFiles.mockResolvedValue([]);
    const photo = makeVideoPhoto();
    mockPhotoRepository.findById.mockResolvedValue(photo);

    await handler(
      makeEvent({
        status: "COMPLETE",
        userMetadata: { photoId: PHOTO_ID },
      }),
    );

    expect(mockProcessImageJob).not.toHaveBeenCalled();
    expect(mockPhotoRepository.save).toHaveBeenCalledTimes(1);
    const saved = mockPhotoRepository.save.mock.calls[0][0] as Photo;
    expect(saved.status).toBe("error");
  });

  it("marks the photo as error on a MediaConvert ERROR event", async () => {
    const photo = makeVideoPhoto();
    mockPhotoRepository.findById.mockResolvedValue(photo);

    await handler(
      makeEvent({
        status: "ERROR",
        userMetadata: { photoId: PHOTO_ID },
        errorMessage: "decode failed",
      }),
    );

    expect(mockProcessImageJob).not.toHaveBeenCalled();
    expect(mockAdapter.listFiles).not.toHaveBeenCalled();
    const saved = mockPhotoRepository.save.mock.calls[0][0] as Photo;
    expect(saved.status).toBe("error");
  });

  it("does nothing when the event has no photoId", async () => {
    await handler(makeEvent({ status: "COMPLETE" }));

    expect(mockPhotoRepository.findById).not.toHaveBeenCalled();
    expect(mockProcessImageJob).not.toHaveBeenCalled();
  });
});
