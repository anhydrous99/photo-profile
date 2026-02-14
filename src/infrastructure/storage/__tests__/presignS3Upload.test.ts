/// <reference types="vitest/globals" />

import { describe, it, expect, beforeEach } from "vitest";

// ---- Mocks (must be before imports) ----

const { mockGetSignedUrl } = vi.hoisted(() => ({
  mockGetSignedUrl: vi.fn(),
}));

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: mockGetSignedUrl,
}));

vi.mock("../s3Client", () => ({
  s3Client: {
    config: {},
  },
}));

// ---- Imports (after mocks) ----

import { presignS3Upload } from "../presignS3Upload";
import { PutObjectCommand } from "@aws-sdk/client-s3";

// ---- Test Suite ----

describe("presignS3Upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls getSignedUrl with PutObjectCommand and correct params", async () => {
    mockGetSignedUrl.mockResolvedValueOnce(
      "https://bucket.s3.amazonaws.com/key?signed=url",
    );

    await presignS3Upload({
      bucket: "my-bucket",
      key: "uploads/photo-123.jpg",
      contentType: "image/jpeg",
    });

    expect(mockGetSignedUrl).toHaveBeenCalledOnce();
    const [client, command, options] = mockGetSignedUrl.mock.calls[0];

    // Verify command is PutObjectCommand with correct input
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toEqual({
      Bucket: "my-bucket",
      Key: "uploads/photo-123.jpg",
      ContentType: "image/jpeg",
    });

    // Verify options include signableHeaders
    expect(options).toEqual({
      expiresIn: 900,
      signableHeaders: new Set(["content-type"]),
    });
  });

  it("uses custom expiresIn when provided", async () => {
    mockGetSignedUrl.mockResolvedValueOnce("https://signed-url");

    await presignS3Upload({
      bucket: "my-bucket",
      key: "uploads/photo-123.jpg",
      contentType: "image/jpeg",
      expiresIn: 3600,
    });

    const [, , options] = mockGetSignedUrl.mock.calls[0];
    expect(options.expiresIn).toBe(3600);
  });

  it("returns the signed URL string", async () => {
    const expectedUrl = "https://bucket.s3.amazonaws.com/key?signed=url";
    mockGetSignedUrl.mockResolvedValueOnce(expectedUrl);

    const result = await presignS3Upload({
      bucket: "my-bucket",
      key: "uploads/photo-123.jpg",
      contentType: "image/jpeg",
    });

    expect(result).toBe(expectedUrl);
  });

  it("includes signableHeaders with content-type for security", async () => {
    mockGetSignedUrl.mockResolvedValueOnce("https://signed-url");

    await presignS3Upload({
      bucket: "my-bucket",
      key: "uploads/photo-123.jpg",
      contentType: "image/png",
    });

    const [, , options] = mockGetSignedUrl.mock.calls[0];
    expect(options.signableHeaders).toEqual(new Set(["content-type"]));
  });

  it("propagates getSignedUrl errors", async () => {
    mockGetSignedUrl.mockRejectedValueOnce(new Error("S3 signing failed"));

    await expect(
      presignS3Upload({
        bucket: "my-bucket",
        key: "uploads/photo-123.jpg",
        contentType: "image/jpeg",
      }),
    ).rejects.toThrow("S3 signing failed");
  });
});
