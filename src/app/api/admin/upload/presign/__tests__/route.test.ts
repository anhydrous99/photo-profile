/// <reference types="vitest/globals" />

import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---- Mocks (must be before imports) ----

const { mockVerifySession, mockPresignS3Upload, mockEnv } = vi.hoisted(() => ({
  mockVerifySession: vi.fn(),
  mockPresignS3Upload: vi.fn(),
  mockEnv: {
    AWS_S3_BUCKET: "test-bucket",
  },
}));

vi.mock("@/infrastructure/auth", () => ({
  verifySession: mockVerifySession,
}));

vi.mock("@/infrastructure/storage", () => ({
  presignS3Upload: mockPresignS3Upload,
}));

vi.mock("@/infrastructure/config/env", () => ({
  env: mockEnv,
}));

// Mock crypto.randomUUID for predictable photoId
const mockUUID = "550e8400-e29b-41d4-a716-446655440000";
vi.stubGlobal("crypto", {
  randomUUID: vi.fn(() => mockUUID),
});

// ---- Imports (after mocks) ----

import { POST } from "../route";

// ---- Test Suite ----

describe("POST /api/admin/upload/presign", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 if session is not verified", async () => {
    mockVerifySession.mockResolvedValueOnce(null);

    const request = new NextRequest(
      "http://localhost:3000/api/admin/upload/presign",
      {
        method: "POST",
        body: JSON.stringify({
          filename: "photo.jpg",
          contentType: "image/jpeg",
          fileSize: 1024,
        }),
      },
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data).toEqual({ error: "Unauthorized" });
    expect(mockPresignS3Upload).not.toHaveBeenCalled();
  });

  it("returns 400 if filename is missing", async () => {
    mockVerifySession.mockResolvedValueOnce({ isAdmin: true });

    const request = new NextRequest(
      "http://localhost:3000/api/admin/upload/presign",
      {
        method: "POST",
        body: JSON.stringify({
          contentType: "image/jpeg",
          fileSize: 1024,
        }),
      },
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Validation failed");
    expect(data.details.filename).toBeDefined();
  });

  it("returns 400 if contentType is invalid", async () => {
    mockVerifySession.mockResolvedValueOnce({ isAdmin: true });

    const request = new NextRequest(
      "http://localhost:3000/api/admin/upload/presign",
      {
        method: "POST",
        body: JSON.stringify({
          filename: "photo.jpg",
          contentType: "application/pdf",
          fileSize: 1024,
        }),
      },
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Validation failed");
    expect(data.details.contentType).toBeDefined();
  });

  it("returns 400 if fileSize exceeds 100MB", async () => {
    mockVerifySession.mockResolvedValueOnce({ isAdmin: true });

    const request = new NextRequest(
      "http://localhost:3000/api/admin/upload/presign",
      {
        method: "POST",
        body: JSON.stringify({
          filename: "photo.jpg",
          contentType: "image/jpeg",
          fileSize: 101 * 1024 * 1024, // 101MB
        }),
      },
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Validation failed");
    expect(data.details.fileSize).toBeDefined();
  });

  it("returns 400 if fileSize is zero or negative", async () => {
    mockVerifySession.mockResolvedValueOnce({ isAdmin: true });

    const request = new NextRequest(
      "http://localhost:3000/api/admin/upload/presign",
      {
        method: "POST",
        body: JSON.stringify({
          filename: "photo.jpg",
          contentType: "image/jpeg",
          fileSize: 0,
        }),
      },
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Validation failed");
    expect(data.details.fileSize).toBeDefined();
  });

  it("returns 200 with presigned URL for valid request", async () => {
    mockVerifySession.mockResolvedValueOnce({ isAdmin: true });
    mockPresignS3Upload.mockResolvedValueOnce(
      "https://test-bucket.s3.amazonaws.com/presigned-url",
    );

    const request = new NextRequest(
      "http://localhost:3000/api/admin/upload/presign",
      {
        method: "POST",
        body: JSON.stringify({
          filename: "photo.jpg",
          contentType: "image/jpeg",
          fileSize: 5 * 1024 * 1024, // 5MB
        }),
      },
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      presignedUrl: "https://test-bucket.s3.amazonaws.com/presigned-url",
      photoId: mockUUID,
      key: `originals/${mockUUID}/original.jpg`,
    });
  });

  it("generates correct S3 key with photoId and extension", async () => {
    mockVerifySession.mockResolvedValueOnce({ isAdmin: true });
    mockPresignS3Upload.mockResolvedValueOnce("https://presigned-url");

    const request = new NextRequest(
      "http://localhost:3000/api/admin/upload/presign",
      {
        method: "POST",
        body: JSON.stringify({
          filename: "my-photo.png",
          contentType: "image/png",
          fileSize: 1024,
        }),
      },
    );

    const response = await POST(request);
    const data = await response.json();

    expect(data.key).toBe(`originals/${mockUUID}/original.png`);
  });

  it("passes correct params to presignS3Upload", async () => {
    mockVerifySession.mockResolvedValueOnce({ isAdmin: true });
    mockPresignS3Upload.mockResolvedValueOnce("https://presigned-url");

    const request = new NextRequest(
      "http://localhost:3000/api/admin/upload/presign",
      {
        method: "POST",
        body: JSON.stringify({
          filename: "photo.webp",
          contentType: "image/webp",
          fileSize: 2048,
        }),
      },
    );

    await POST(request);

    expect(mockPresignS3Upload).toHaveBeenCalledWith({
      bucket: "test-bucket",
      key: `originals/${mockUUID}/original.webp`,
      contentType: "image/webp",
      expiresIn: 900,
    });
  });

  it("handles HEIC file extension correctly", async () => {
    mockVerifySession.mockResolvedValueOnce({ isAdmin: true });
    mockPresignS3Upload.mockResolvedValueOnce("https://presigned-url");

    const request = new NextRequest(
      "http://localhost:3000/api/admin/upload/presign",
      {
        method: "POST",
        body: JSON.stringify({
          filename: "IMG_1234.HEIC",
          contentType: "image/heic",
          fileSize: 1024,
        }),
      },
    );

    const response = await POST(request);
    const data = await response.json();

    expect(data.key).toBe(`originals/${mockUUID}/original.heic`);
  });

  it("handles HEIF file extension correctly", async () => {
    mockVerifySession.mockResolvedValueOnce({ isAdmin: true });
    mockPresignS3Upload.mockResolvedValueOnce("https://presigned-url");

    const request = new NextRequest(
      "http://localhost:3000/api/admin/upload/presign",
      {
        method: "POST",
        body: JSON.stringify({
          filename: "photo.heif",
          contentType: "image/heif",
          fileSize: 1024,
        }),
      },
    );

    const response = await POST(request);
    const data = await response.json();

    expect(data.key).toBe(`originals/${mockUUID}/original.heif`);
  });

  it("sanitizes filename extension (lowercase)", async () => {
    mockVerifySession.mockResolvedValueOnce({ isAdmin: true });
    mockPresignS3Upload.mockResolvedValueOnce("https://presigned-url");

    const request = new NextRequest(
      "http://localhost:3000/api/admin/upload/presign",
      {
        method: "POST",
        body: JSON.stringify({
          filename: "PHOTO.JPG",
          contentType: "image/jpeg",
          fileSize: 1024,
        }),
      },
    );

    const response = await POST(request);
    const data = await response.json();

    expect(data.key).toBe(`originals/${mockUUID}/original.jpg`);
  });

  it("returns 500 if presignS3Upload throws error", async () => {
    mockVerifySession.mockResolvedValueOnce({ isAdmin: true });
    mockPresignS3Upload.mockRejectedValueOnce(new Error("S3 signing failed"));

    const request = new NextRequest(
      "http://localhost:3000/api/admin/upload/presign",
      {
        method: "POST",
        body: JSON.stringify({
          filename: "photo.jpg",
          contentType: "image/jpeg",
          fileSize: 1024,
        }),
      },
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({ error: "Internal server error" });
  });
});
