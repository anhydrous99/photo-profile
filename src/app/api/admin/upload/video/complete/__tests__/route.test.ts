import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const {
  mockVerifySession,
  mockPhotoRepositoryFindById,
  mockPhotoRepositorySave,
  mockCompleteMultipartUpload,
  mockSubmitVideoTranscode,
  mockS3ClientSend,
} = vi.hoisted(() => ({
  mockVerifySession: vi.fn(),
  mockPhotoRepositoryFindById: vi.fn(),
  mockPhotoRepositorySave: vi.fn(),
  mockCompleteMultipartUpload: vi.fn(),
  mockSubmitVideoTranscode: vi.fn(),
  mockS3ClientSend: vi.fn(),
}));

vi.mock("@/infrastructure/auth", () => ({
  verifySession: mockVerifySession,
}));

vi.mock("@/infrastructure/database/dynamodb/repositories", () => ({
  getPhotoRepository: vi.fn(() => ({
    findById: mockPhotoRepositoryFindById,
    save: mockPhotoRepositorySave,
  })),
  getAlbumRepository: vi.fn(),
}));

vi.mock("@/infrastructure/storage", () => ({
  completeMultipartUpload: mockCompleteMultipartUpload,
}));

vi.mock("@/infrastructure/jobs/mediaConvert", () => ({
  submitVideoTranscode: mockSubmitVideoTranscode,
}));

vi.mock("@/infrastructure/storage/s3Client", () => ({
  s3Client: {
    send: mockS3ClientSend,
  },
}));

vi.mock("@/infrastructure/config/env", () => ({
  env: {
    VIDEO_ENABLED: true,
    AWS_S3_BUCKET: "test-bucket",
  },
}));

import { POST } from "../route";

const photoId = "550e8400-e29b-41d4-a716-446655440000";
const key = `originals/${photoId}/original.mp4`;

const validBody = {
  photoId,
  key,
  uploadId: "upload-id",
  originalFilename: "clip.mp4",
  parts: [
    { partNumber: 2, etag: "etag-2" },
    { partNumber: 1, etag: "etag-1" },
  ],
};

function createRequest(body: unknown) {
  return new NextRequest(
    "http://localhost:3000/api/admin/upload/video/complete",
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

describe("POST /api/admin/upload/video/complete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifySession.mockResolvedValue({ userId: "admin" });
    mockPhotoRepositoryFindById.mockResolvedValue(null);
    mockPhotoRepositorySave.mockResolvedValue(undefined);
    mockCompleteMultipartUpload.mockResolvedValue(undefined);
    mockSubmitVideoTranscode.mockResolvedValue(undefined);
    mockS3ClientSend.mockResolvedValue({
      ContentLength: 1024,
      ContentType: "video/mp4",
    });
  });

  it("returns existing status without completing S3 upload when the photo already exists", async () => {
    mockPhotoRepositoryFindById.mockResolvedValue({
      id: photoId,
      status: "ready",
      mediaType: "video",
    });

    const response = await POST(createRequest(validBody));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ photoId, status: "ready" });
    expect(mockCompleteMultipartUpload).not.toHaveBeenCalled();
    expect(mockS3ClientSend).not.toHaveBeenCalled();
    expect(mockPhotoRepositorySave).not.toHaveBeenCalled();
    expect(mockSubmitVideoTranscode).not.toHaveBeenCalled();
  });

  it("returns 400 when HeadObject reports NotFound", async () => {
    const notFoundError = new Error("NotFound");
    notFoundError.name = "NotFound";
    mockS3ClientSend.mockRejectedValue(notFoundError);

    const response = await POST(createRequest(validBody));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual({ error: "File not found in S3" });
    expect(mockCompleteMultipartUpload).toHaveBeenCalledOnce();
    expect(mockPhotoRepositorySave).not.toHaveBeenCalled();
    expect(mockSubmitVideoTranscode).not.toHaveBeenCalled();
  });

  it("returns 400 when HeadObject reports HTTP 404 metadata", async () => {
    const notFoundError = new Error("missing") as Error & {
      $metadata: { httpStatusCode: number };
    };
    notFoundError.$metadata = { httpStatusCode: 404 };
    mockS3ClientSend.mockRejectedValue(notFoundError);

    const response = await POST(createRequest(validBody));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual({ error: "File not found in S3" });
    expect(mockCompleteMultipartUpload).toHaveBeenCalledOnce();
    expect(mockPhotoRepositorySave).not.toHaveBeenCalled();
    expect(mockSubmitVideoTranscode).not.toHaveBeenCalled();
  });

  it("saves a video record and submits the transcode job for a valid upload", async () => {
    const response = await POST(createRequest(validBody));
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data).toEqual({ photoId, status: "processing" });
    expect(mockCompleteMultipartUpload).toHaveBeenCalledWith({
      bucket: "test-bucket",
      key,
      uploadId: "upload-id",
      parts: [
        { PartNumber: 2, ETag: "etag-2" },
        { PartNumber: 1, ETag: "etag-1" },
      ],
    });
    expect(mockS3ClientSend).toHaveBeenCalledOnce();
    expect(mockPhotoRepositorySave).toHaveBeenCalledOnce();
    expect(mockPhotoRepositorySave.mock.calls[0][0]).toMatchObject({
      id: photoId,
      originalFilename: "clip.mp4",
      status: "processing",
      mediaType: "video",
      durationMs: null,
      width: null,
      height: null,
      blurDataUrl: null,
      exifData: null,
    });
    expect(mockPhotoRepositorySave.mock.calls[0][0].createdAt).toBeInstanceOf(
      Date,
    );
    expect(mockPhotoRepositorySave.mock.calls[0][0].updatedAt).toBeInstanceOf(
      Date,
    );
    expect(mockSubmitVideoTranscode).toHaveBeenCalledWith({
      photoId,
      originalKey: key,
    });
  });
});
