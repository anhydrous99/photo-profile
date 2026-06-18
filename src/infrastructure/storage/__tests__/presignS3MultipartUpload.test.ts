import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  CreateMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from "@aws-sdk/client-s3";

const mockSend = vi.hoisted(() => vi.fn());
const mockGetSignedUrl = vi.hoisted(() => vi.fn());

vi.mock("../s3Client", () => ({ s3Client: { send: mockSend } }));
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: mockGetSignedUrl,
}));

import {
  createMultipartUpload,
  presignUploadParts,
  completeMultipartUpload,
  abortMultipartUpload,
} from "../presignS3MultipartUpload";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createMultipartUpload", () => {
  it("returns the UploadId from S3", async () => {
    mockSend.mockResolvedValue({ UploadId: "uid-123" });
    const uploadId = await createMultipartUpload({
      bucket: "b",
      key: "originals/v/original.mp4",
      contentType: "video/mp4",
    });
    expect(uploadId).toBe("uid-123");
    const command = mockSend.mock.calls[0][0];
    expect(command).toBeInstanceOf(CreateMultipartUploadCommand);
    expect(command.input).toMatchObject({
      Bucket: "b",
      Key: "originals/v/original.mp4",
      ContentType: "video/mp4",
    });
  });

  it("throws when S3 returns no UploadId", async () => {
    mockSend.mockResolvedValue({});
    await expect(
      createMultipartUpload({
        bucket: "b",
        key: "k",
        contentType: "video/mp4",
      }),
    ).rejects.toThrow(/UploadId/);
  });
});

describe("presignUploadParts", () => {
  it("presigns one URL per part with ascending part numbers", async () => {
    mockGetSignedUrl.mockImplementation(
      (_client, command: { input: { PartNumber: number } }) =>
        Promise.resolve(`https://signed/${command.input.PartNumber}`),
    );

    const parts = await presignUploadParts({
      bucket: "b",
      key: "k",
      uploadId: "uid",
      partCount: 3,
      expiresIn: 900,
    });

    expect(parts).toEqual([
      { partNumber: 1, url: "https://signed/1" },
      { partNumber: 2, url: "https://signed/2" },
      { partNumber: 3, url: "https://signed/3" },
    ]);
    expect(mockGetSignedUrl).toHaveBeenCalledTimes(3);
  });
});

describe("completeMultipartUpload", () => {
  it("sorts parts by ascending part number before completing", async () => {
    mockSend.mockResolvedValue({});
    await completeMultipartUpload({
      bucket: "b",
      key: "k",
      uploadId: "uid",
      parts: [
        { PartNumber: 3, ETag: "c" },
        { PartNumber: 1, ETag: "a" },
        { PartNumber: 2, ETag: "b" },
      ],
    });

    const command = mockSend.mock.calls[0][0];
    expect(command).toBeInstanceOf(CompleteMultipartUploadCommand);
    expect(command.input.MultipartUpload.Parts).toEqual([
      { PartNumber: 1, ETag: "a" },
      { PartNumber: 2, ETag: "b" },
      { PartNumber: 3, ETag: "c" },
    ]);
  });
});

describe("abortMultipartUpload", () => {
  it("sends an AbortMultipartUploadCommand", async () => {
    mockSend.mockResolvedValue({});
    await abortMultipartUpload({ bucket: "b", key: "k", uploadId: "uid" });
    const command = mockSend.mock.calls[0][0];
    expect(command).toBeInstanceOf(AbortMultipartUploadCommand);
    expect(command.input).toMatchObject({
      Bucket: "b",
      Key: "k",
      UploadId: "uid",
    });
  });
});
