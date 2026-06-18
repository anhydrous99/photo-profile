import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const {
  mockVerifySession,
  mockCreateMultipartUpload,
  mockPresignUploadParts,
  mockEnv,
} = vi.hoisted(() => ({
  mockVerifySession: vi.fn(),
  mockCreateMultipartUpload: vi.fn(),
  mockPresignUploadParts: vi.fn(),
  mockEnv: {
    VIDEO_ENABLED: true,
    AWS_S3_BUCKET: "test-bucket",
  },
}));

vi.mock("@/infrastructure/auth", () => ({
  verifySession: mockVerifySession,
}));

vi.mock("@/infrastructure/storage", () => ({
  createMultipartUpload: mockCreateMultipartUpload,
  presignUploadParts: mockPresignUploadParts,
}));

vi.mock("@/infrastructure/config/env", () => ({
  env: mockEnv,
}));

vi.mock("@/lib/constants", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/constants")>();
  return {
    ...actual,
    MAX_VIDEO_FILE_SIZE: 10,
    MULTIPART_PART_SIZE: 1,
    MULTIPART_MAX_PARTS: 1,
  };
});

import { POST } from "../route";

const validBody = {
  filename: "clip.mp4",
  contentType: "video/mp4",
  fileSize: 1,
};

function createRequest(body: unknown) {
  return new NextRequest(
    "http://localhost:3000/api/admin/upload/video/create",
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

describe("POST /api/admin/upload/video/create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.VIDEO_ENABLED = true;
    mockEnv.AWS_S3_BUCKET = "test-bucket";
    mockVerifySession.mockResolvedValue({ userId: "admin" });
    mockCreateMultipartUpload.mockResolvedValue("upload-id");
    mockPresignUploadParts.mockResolvedValue([
      { partNumber: 1, url: "https://signed.example.com/part-1" },
    ]);
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "550e8400-e29b-41d4-a716-446655440000",
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 400 when video uploads are disabled", async () => {
    mockEnv.VIDEO_ENABLED = false;

    const response = await POST(createRequest(validBody));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual({ error: "Video upload is not enabled" });
    expect(mockCreateMultipartUpload).not.toHaveBeenCalled();
    expect(mockPresignUploadParts).not.toHaveBeenCalled();
  });

  it("returns 400 for unsupported video content types", async () => {
    const response = await POST(
      createRequest({
        ...validBody,
        contentType: "application/octet-stream",
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Validation failed");
    expect(mockCreateMultipartUpload).not.toHaveBeenCalled();
  });

  it("returns 400 for oversized videos", async () => {
    const response = await POST(createRequest({ ...validBody, fileSize: 11 }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Validation failed");
    expect(mockCreateMultipartUpload).not.toHaveBeenCalled();
  });

  it("returns 400 when the file would require too many multipart parts", async () => {
    const response = await POST(createRequest({ ...validBody, fileSize: 2 }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual({ error: "File requires too many upload parts" });
    expect(mockCreateMultipartUpload).not.toHaveBeenCalled();
    expect(mockPresignUploadParts).not.toHaveBeenCalled();
  });

  it("creates a multipart upload and returns presigned parts", async () => {
    const response = await POST(createRequest(validBody));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      photoId: "550e8400-e29b-41d4-a716-446655440000",
      key: "originals/550e8400-e29b-41d4-a716-446655440000/original.mp4",
      uploadId: "upload-id",
      partSize: 1,
      parts: [{ partNumber: 1, url: "https://signed.example.com/part-1" }],
    });
    expect(mockCreateMultipartUpload).toHaveBeenCalledWith({
      bucket: "test-bucket",
      key: "originals/550e8400-e29b-41d4-a716-446655440000/original.mp4",
      contentType: "video/mp4",
    });
    expect(mockPresignUploadParts).toHaveBeenCalledWith({
      bucket: "test-bucket",
      key: "originals/550e8400-e29b-41d4-a716-446655440000/original.mp4",
      uploadId: "upload-id",
      partCount: 1,
      expiresIn: 6 * 60 * 60,
    });
  });
});
