import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const {
  mockVerifySession,
  mockPhotoRepositorySave,
  mockPhotoRepositoryFindById,
  mockEnqueueImageProcessing,
  mockS3ClientSend,
} = vi.hoisted(() => ({
  mockVerifySession: vi.fn(),
  mockPhotoRepositorySave: vi.fn(),
  mockPhotoRepositoryFindById: vi.fn(),
  mockEnqueueImageProcessing: vi.fn(),
  mockS3ClientSend: vi.fn(),
}));

vi.mock("@/infrastructure/auth", () => ({
  verifySession: mockVerifySession,
}));

vi.mock("@/infrastructure/database/dynamodb/repositories", () => ({
  DynamoDBPhotoRepository: class {
    save = mockPhotoRepositorySave;
    findById = mockPhotoRepositoryFindById;
  },
}));

vi.mock("@/infrastructure/jobs", () => ({
  enqueueImageProcessing: mockEnqueueImageProcessing,
}));

vi.mock("@/infrastructure/storage/s3Client", () => ({
  s3Client: {
    send: mockS3ClientSend,
  },
}));

vi.mock("@/infrastructure/config/env", () => ({
  env: {
    AWS_S3_BUCKET: "test-bucket",
  },
}));

import { POST } from "../route";

describe("POST /api/admin/upload/confirm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 if session is invalid", async () => {
    mockVerifySession.mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost:3000/api/admin/upload/confirm",
      {
        method: "POST",
        body: JSON.stringify({
          photoId: "550e8400-e29b-41d4-a716-446655440000",
          key: "originals/550e8400-e29b-41d4-a716-446655440000/photo.jpg",
          originalFilename: "photo.jpg",
        }),
      },
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data).toEqual({ error: "Unauthorized" });
    expect(mockVerifySession).toHaveBeenCalledOnce();
  });

  it("returns 400 if photoId is not a valid UUID", async () => {
    mockVerifySession.mockResolvedValue({ userId: "admin" });

    const request = new NextRequest(
      "http://localhost:3000/api/admin/upload/confirm",
      {
        method: "POST",
        body: JSON.stringify({
          photoId: "invalid-uuid",
          key: "originals/invalid-uuid/photo.jpg",
          originalFilename: "photo.jpg",
        }),
      },
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBeDefined();
  });

  it("returns 400 if key is missing", async () => {
    mockVerifySession.mockResolvedValue({ userId: "admin" });

    const request = new NextRequest(
      "http://localhost:3000/api/admin/upload/confirm",
      {
        method: "POST",
        body: JSON.stringify({
          photoId: "550e8400-e29b-41d4-a716-446655440000",
          originalFilename: "photo.jpg",
        }),
      },
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBeDefined();
  });

  it("returns 400 if originalFilename is missing", async () => {
    mockVerifySession.mockResolvedValue({ userId: "admin" });

    const request = new NextRequest(
      "http://localhost:3000/api/admin/upload/confirm",
      {
        method: "POST",
        body: JSON.stringify({
          photoId: "550e8400-e29b-41d4-a716-446655440000",
          key: "originals/550e8400-e29b-41d4-a716-446655440000/photo.jpg",
        }),
      },
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBeDefined();
  });

  it("returns 400 if file not found in S3 (NoSuchKey)", async () => {
    mockVerifySession.mockResolvedValue({ userId: "admin" });
    mockPhotoRepositoryFindById.mockResolvedValue(null);

    const noSuchKeyError = new Error("NoSuchKey");
    noSuchKeyError.name = "NoSuchKey";
    mockS3ClientSend.mockRejectedValue(noSuchKeyError);

    const request = new NextRequest(
      "http://localhost:3000/api/admin/upload/confirm",
      {
        method: "POST",
        body: JSON.stringify({
          photoId: "550e8400-e29b-41d4-a716-446655440000",
          key: "originals/550e8400-e29b-41d4-a716-446655440000/photo.jpg",
          originalFilename: "photo.jpg",
        }),
      },
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("File not found in S3");
  });

  it("returns 400 if uploaded file is empty (ContentLength === 0)", async () => {
    mockVerifySession.mockResolvedValue({ userId: "admin" });
    mockPhotoRepositoryFindById.mockResolvedValue(null);

    mockS3ClientSend.mockResolvedValue({
      ContentLength: 0,
      ContentType: "image/jpeg",
    });

    const request = new NextRequest(
      "http://localhost:3000/api/admin/upload/confirm",
      {
        method: "POST",
        body: JSON.stringify({
          photoId: "550e8400-e29b-41d4-a716-446655440000",
          key: "originals/550e8400-e29b-41d4-a716-446655440000/photo.jpg",
          originalFilename: "photo.jpg",
        }),
      },
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Uploaded file is empty");
  });

  it("returns 400 if ContentType is not allowed", async () => {
    mockVerifySession.mockResolvedValue({ userId: "admin" });
    mockPhotoRepositoryFindById.mockResolvedValue(null);

    mockS3ClientSend.mockResolvedValue({
      ContentLength: 1024,
      ContentType: "application/pdf",
    });

    const request = new NextRequest(
      "http://localhost:3000/api/admin/upload/confirm",
      {
        method: "POST",
        body: JSON.stringify({
          photoId: "550e8400-e29b-41d4-a716-446655440000",
          key: "originals/550e8400-e29b-41d4-a716-446655440000/photo.jpg",
          originalFilename: "photo.jpg",
        }),
      },
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("Invalid file type");
  });

  it("returns 201 and creates photo record for valid request", async () => {
    mockVerifySession.mockResolvedValue({ userId: "admin" });
    mockPhotoRepositoryFindById.mockResolvedValue(null);

    mockS3ClientSend.mockResolvedValue({
      ContentLength: 1024,
      ContentType: "image/jpeg",
    });

    mockPhotoRepositorySave.mockResolvedValue(undefined);
    mockEnqueueImageProcessing.mockResolvedValue("job-id");

    const photoId = "550e8400-e29b-41d4-a716-446655440000";
    const key = "originals/550e8400-e29b-41d4-a716-446655440000/photo.jpg";

    const request = new NextRequest(
      "http://localhost:3000/api/admin/upload/confirm",
      {
        method: "POST",
        body: JSON.stringify({
          photoId,
          key,
          originalFilename: "photo.jpg",
        }),
      },
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data).toEqual({
      photoId,
      status: "processing",
    });

    expect(mockPhotoRepositorySave).toHaveBeenCalledOnce();
    const savedPhoto = mockPhotoRepositorySave.mock.calls[0][0];
    expect(savedPhoto).toMatchObject({
      id: photoId,
      title: null,
      description: null,
      originalFilename: "photo.jpg",
      blurDataUrl: null,
      exifData: null,
      width: null,
      height: null,
      status: "processing",
    });
    expect(savedPhoto.createdAt).toBeInstanceOf(Date);
    expect(savedPhoto.updatedAt).toBeInstanceOf(Date);

    expect(mockEnqueueImageProcessing).toHaveBeenCalledWith(photoId, key);
  });

  it("returns 200 if photo already exists (idempotency)", async () => {
    mockVerifySession.mockResolvedValue({ userId: "admin" });

    const existingPhoto = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      title: null,
      description: null,
      originalFilename: "photo.jpg",
      blurDataUrl: null,
      exifData: null,
      width: null,
      height: null,
      status: "processing",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockPhotoRepositoryFindById.mockResolvedValue(existingPhoto);

    const request = new NextRequest(
      "http://localhost:3000/api/admin/upload/confirm",
      {
        method: "POST",
        body: JSON.stringify({
          photoId: "550e8400-e29b-41d4-a716-446655440000",
          key: "originals/550e8400-e29b-41d4-a716-446655440000/photo.jpg",
          originalFilename: "photo.jpg",
        }),
      },
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      photoId: existingPhoto.id,
      status: "processing",
    });

    // Should NOT save or enqueue again
    expect(mockPhotoRepositorySave).not.toHaveBeenCalled();
    expect(mockEnqueueImageProcessing).not.toHaveBeenCalled();
    expect(mockS3ClientSend).not.toHaveBeenCalled();
  });

  it("saves photo even if SQS enqueue fails", async () => {
    mockVerifySession.mockResolvedValue({ userId: "admin" });
    mockPhotoRepositoryFindById.mockResolvedValue(null);

    mockS3ClientSend.mockResolvedValue({
      ContentLength: 1024,
      ContentType: "image/jpeg",
    });

    mockPhotoRepositorySave.mockResolvedValue(undefined);
    mockEnqueueImageProcessing.mockRejectedValue(new Error("SQS unavailable"));

    const photoId = "550e8400-e29b-41d4-a716-446655440000";
    const key = "originals/550e8400-e29b-41d4-a716-446655440000/photo.jpg";

    const request = new NextRequest(
      "http://localhost:3000/api/admin/upload/confirm",
      {
        method: "POST",
        body: JSON.stringify({
          photoId,
          key,
          originalFilename: "photo.jpg",
        }),
      },
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data).toEqual({
      photoId,
      status: "processing",
    });

    expect(mockPhotoRepositorySave).toHaveBeenCalledOnce();
  });

  it("returns 500 on server error", async () => {
    mockVerifySession.mockResolvedValue({ userId: "admin" });
    mockPhotoRepositoryFindById.mockRejectedValue(new Error("Database error"));

    const request = new NextRequest(
      "http://localhost:3000/api/admin/upload/confirm",
      {
        method: "POST",
        body: JSON.stringify({
          photoId: "550e8400-e29b-41d4-a716-446655440000",
          key: "originals/550e8400-e29b-41d4-a716-446655440000/photo.jpg",
          originalFilename: "photo.jpg",
        }),
      },
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({ error: "Internal server error" });
  });
});
