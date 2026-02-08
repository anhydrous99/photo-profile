/// <reference types="vitest/globals" />

import { describe, it, expect, beforeEach } from "vitest";

// ---- Mocks (must be before imports) ----

const { mockSend } = vi.hoisted(() => ({
  mockSend: vi.fn(),
}));

vi.mock("@aws-sdk/client-s3", () => {
  class MockS3Client {
    send = mockSend;
  }
  class MockPutObjectCommand {
    constructor(public input: unknown) {}
  }
  class MockGetObjectCommand {
    constructor(public input: unknown) {}
  }
  class MockHeadObjectCommand {
    constructor(public input: unknown) {}
  }
  class MockListObjectsV2Command {
    constructor(public input: unknown) {}
  }
  class MockDeleteObjectsCommand {
    constructor(public input: unknown) {}
  }

  return {
    S3Client: MockS3Client,
    PutObjectCommand: MockPutObjectCommand,
    GetObjectCommand: MockGetObjectCommand,
    HeadObjectCommand: MockHeadObjectCommand,
    ListObjectsV2Command: MockListObjectsV2Command,
    DeleteObjectsCommand: MockDeleteObjectsCommand,
  };
});

vi.mock("@/infrastructure/config/env", () => ({
  env: {
    AWS_REGION: "us-east-1",
    AWS_S3_BUCKET: "test-bucket",
    STORAGE_BACKEND: "s3",
  },
}));

vi.mock("@/infrastructure/logging/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ---- Imports (after mocks) ----

import { S3StorageAdapter } from "../s3StorageAdapter";
import {
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import type { StorageAdapter } from "../types";

function sentCommand(callIndex: number) {
  return mockSend.mock.calls[callIndex][0];
}

// ---- Helpers ----

function createAdapter(): S3StorageAdapter {
  return new S3StorageAdapter();
}

function makeReadableStream(data: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });
}

// ---- Test Suite ----

describe("S3StorageAdapter", () => {
  let adapter: S3StorageAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = createAdapter();
  });

  it("implements StorageAdapter interface", () => {
    const storageAdapter: StorageAdapter = adapter;
    expect(storageAdapter).toBeDefined();
    expect(typeof storageAdapter.saveFile).toBe("function");
    expect(typeof storageAdapter.getFile).toBe("function");
    expect(typeof storageAdapter.getFileStream).toBe("function");
    expect(typeof storageAdapter.deleteFiles).toBe("function");
    expect(typeof storageAdapter.fileExists).toBe("function");
    expect(typeof storageAdapter.listFiles).toBe("function");
  });

  // ---- saveFile ----

  describe("saveFile", () => {
    it("sends PutObjectCommand with correct params", async () => {
      mockSend.mockResolvedValueOnce({});

      const data = Buffer.from("test image data");
      await adapter.saveFile(
        "originals/abc-123/original.jpg",
        data,
        "image/jpeg",
      );

      expect(mockSend).toHaveBeenCalledOnce();
      const cmd = sentCommand(0);
      expect(cmd).toBeInstanceOf(PutObjectCommand);
      expect(cmd.input).toEqual({
        Bucket: "test-bucket",
        Key: "originals/abc-123/original.jpg",
        Body: data,
        ContentType: "image/jpeg",
      });
    });

    it("propagates S3 errors", async () => {
      mockSend.mockRejectedValueOnce(new Error("Access Denied"));

      await expect(
        adapter.saveFile("key", Buffer.from("data"), "image/jpeg"),
      ).rejects.toThrow("Access Denied");
    });
  });

  // ---- getFile ----

  describe("getFile", () => {
    it("returns Buffer from S3 response body", async () => {
      const bodyContent = new Uint8Array([1, 2, 3, 4, 5]);
      mockSend.mockResolvedValueOnce({
        Body: {
          transformToByteArray: vi.fn().mockResolvedValue(bodyContent),
        },
      });

      const result = await adapter.getFile("originals/abc-123/original.jpg");

      const cmd = sentCommand(0);
      expect(cmd).toBeInstanceOf(GetObjectCommand);
      expect(cmd.input).toEqual({
        Bucket: "test-bucket",
        Key: "originals/abc-123/original.jpg",
      });
      expect(result).toBeInstanceOf(Buffer);
      expect(result).toEqual(Buffer.from(bodyContent));
    });

    it("throws when file not found (NoSuchKey)", async () => {
      const error = new Error("NoSuchKey");
      error.name = "NoSuchKey";
      mockSend.mockRejectedValueOnce(error);

      await expect(adapter.getFile("nonexistent/key")).rejects.toThrow(
        "File not found: nonexistent/key",
      );
    });

    it("throws when response body is empty", async () => {
      mockSend.mockResolvedValueOnce({ Body: undefined });

      await expect(
        adapter.getFile("originals/abc-123/original.jpg"),
      ).rejects.toThrow("Empty response body");
    });

    it("uses AbortController with 30s timeout", async () => {
      const bodyContent = new Uint8Array([1, 2, 3]);
      mockSend.mockResolvedValueOnce({
        Body: {
          transformToByteArray: vi.fn().mockResolvedValue(bodyContent),
        },
      });

      await adapter.getFile("key");

      const sendCall = mockSend.mock.calls[0];
      const options = sendCall[1];
      expect(options).toBeDefined();
      expect(options.abortSignal).toBeDefined();
    });

    it("propagates non-NoSuchKey errors", async () => {
      const error = new Error("Internal Server Error");
      error.name = "InternalError";
      mockSend.mockRejectedValueOnce(error);

      await expect(adapter.getFile("some/key")).rejects.toThrow(
        "Internal Server Error",
      );
    });
  });

  // ---- getFileStream ----

  describe("getFileStream", () => {
    it("returns ReadableStream from S3 response", async () => {
      const bodyContent = new Uint8Array([10, 20, 30]);
      const stream = makeReadableStream(bodyContent);

      mockSend.mockResolvedValueOnce({
        Body: {
          transformToWebStream: vi.fn().mockReturnValue(stream),
        },
      });

      const result = await adapter.getFileStream(
        "originals/abc-123/original.jpg",
      );

      const cmd = sentCommand(0);
      expect(cmd).toBeInstanceOf(GetObjectCommand);
      expect(cmd.input).toEqual({
        Bucket: "test-bucket",
        Key: "originals/abc-123/original.jpg",
      });
      expect(result).toBeInstanceOf(ReadableStream);
    });

    it("throws when file not found (NoSuchKey)", async () => {
      const error = new Error("NoSuchKey");
      error.name = "NoSuchKey";
      mockSend.mockRejectedValueOnce(error);

      await expect(adapter.getFileStream("nonexistent/key")).rejects.toThrow(
        "File not found: nonexistent/key",
      );
    });

    it("throws when response body is empty", async () => {
      mockSend.mockResolvedValueOnce({ Body: undefined });

      await expect(
        adapter.getFileStream("originals/abc-123/original.jpg"),
      ).rejects.toThrow("Empty response body");
    });
  });

  // ---- deleteFiles ----

  describe("deleteFiles", () => {
    it("lists and deletes all objects with prefix", async () => {
      // ListObjectsV2 response
      mockSend.mockResolvedValueOnce({
        Contents: [
          { Key: "processed/abc-123/300w.webp" },
          { Key: "processed/abc-123/600w.webp" },
          { Key: "processed/abc-123/1200w.webp" },
        ],
        IsTruncated: false,
      });
      // DeleteObjects response
      mockSend.mockResolvedValueOnce({});

      await adapter.deleteFiles("processed/abc-123/");

      expect(mockSend).toHaveBeenCalledTimes(2);
      const listCmd = sentCommand(0);
      expect(listCmd).toBeInstanceOf(ListObjectsV2Command);
      expect(listCmd.input).toEqual({
        Bucket: "test-bucket",
        Prefix: "processed/abc-123/",
      });
      const deleteCmd = sentCommand(1);
      expect(deleteCmd).toBeInstanceOf(DeleteObjectsCommand);
      expect(deleteCmd.input).toEqual({
        Bucket: "test-bucket",
        Delete: {
          Objects: [
            { Key: "processed/abc-123/300w.webp" },
            { Key: "processed/abc-123/600w.webp" },
            { Key: "processed/abc-123/1200w.webp" },
          ],
          Quiet: true,
        },
      });
    });

    it("handles empty prefix (no objects to delete)", async () => {
      mockSend.mockResolvedValueOnce({
        Contents: undefined,
        IsTruncated: false,
      });

      await adapter.deleteFiles("nonexistent/prefix/");

      expect(mockSend).toHaveBeenCalledOnce();
      expect(sentCommand(0)).toBeInstanceOf(ListObjectsV2Command);
    });

    it("handles paginated results (IsTruncated)", async () => {
      // list page 1 → delete batch 1 → list page 2 → delete batch 2
      mockSend
        .mockResolvedValueOnce({
          Contents: [{ Key: "prefix/file1.jpg" }],
          IsTruncated: true,
          NextContinuationToken: "token-1",
        })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({
          Contents: [{ Key: "prefix/file2.jpg" }],
          IsTruncated: false,
        })
        .mockResolvedValueOnce({});

      await adapter.deleteFiles("prefix/");

      expect(mockSend).toHaveBeenCalledTimes(4);
      expect(sentCommand(0)).toBeInstanceOf(ListObjectsV2Command);
      expect(sentCommand(1)).toBeInstanceOf(DeleteObjectsCommand);
      expect(sentCommand(2)).toBeInstanceOf(ListObjectsV2Command);
      expect(sentCommand(3)).toBeInstanceOf(DeleteObjectsCommand);
    });
  });

  // ---- fileExists ----

  describe("fileExists", () => {
    it("returns true when file exists", async () => {
      mockSend.mockResolvedValueOnce({});

      const result = await adapter.fileExists("originals/abc-123/original.jpg");

      const cmd = sentCommand(0);
      expect(cmd).toBeInstanceOf(HeadObjectCommand);
      expect(cmd.input).toEqual({
        Bucket: "test-bucket",
        Key: "originals/abc-123/original.jpg",
      });
      expect(result).toBe(true);
    });

    it("returns false when file does not exist (NotFound)", async () => {
      const error = new Error("NotFound");
      error.name = "NotFound";
      mockSend.mockRejectedValueOnce(error);

      const result = await adapter.fileExists("nonexistent/key");

      expect(result).toBe(false);
    });

    it("returns false for NoSuchKey error", async () => {
      const error = new Error("NoSuchKey");
      error.name = "NoSuchKey";
      mockSend.mockRejectedValueOnce(error);

      const result = await adapter.fileExists("nonexistent/key");

      expect(result).toBe(false);
    });

    it("propagates unexpected errors", async () => {
      mockSend.mockRejectedValueOnce(new Error("Network failure"));

      await expect(adapter.fileExists("some/key")).rejects.toThrow(
        "Network failure",
      );
    });
  });

  // ---- listFiles ----

  describe("listFiles", () => {
    it("returns array of S3 keys matching prefix", async () => {
      mockSend.mockResolvedValueOnce({
        Contents: [
          { Key: "processed/abc-123/300w.webp" },
          { Key: "processed/abc-123/600w.webp" },
        ],
        IsTruncated: false,
      });

      const result = await adapter.listFiles("processed/abc-123/");

      const cmd = sentCommand(0);
      expect(cmd).toBeInstanceOf(ListObjectsV2Command);
      expect(cmd.input).toEqual({
        Bucket: "test-bucket",
        Prefix: "processed/abc-123/",
      });
      expect(result).toEqual([
        "processed/abc-123/300w.webp",
        "processed/abc-123/600w.webp",
      ]);
    });

    it("returns empty array when no objects match", async () => {
      mockSend.mockResolvedValueOnce({
        Contents: undefined,
        IsTruncated: false,
      });

      const result = await adapter.listFiles("nonexistent/");

      expect(result).toEqual([]);
    });

    it("handles paginated results", async () => {
      mockSend.mockResolvedValueOnce({
        Contents: [{ Key: "prefix/file1.jpg" }],
        IsTruncated: true,
        NextContinuationToken: "token-1",
      });
      mockSend.mockResolvedValueOnce({
        Contents: [{ Key: "prefix/file2.jpg" }],
        IsTruncated: false,
      });

      const result = await adapter.listFiles("prefix/");

      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(sentCommand(0)).toBeInstanceOf(ListObjectsV2Command);
      expect(sentCommand(1)).toBeInstanceOf(ListObjectsV2Command);
      expect(result).toEqual(["prefix/file1.jpg", "prefix/file2.jpg"]);
    });

    it("filters out entries without Key", async () => {
      mockSend.mockResolvedValueOnce({
        Contents: [
          { Key: "prefix/file1.jpg" },
          { Key: undefined },
          { Key: "prefix/file2.jpg" },
        ],
        IsTruncated: false,
      });

      const result = await adapter.listFiles("prefix/");

      expect(result).toEqual(["prefix/file1.jpg", "prefix/file2.jpg"]);
    });
  });
});
