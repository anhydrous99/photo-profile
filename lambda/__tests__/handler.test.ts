import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SQSEvent, SQSRecord } from "aws-lambda";

// --- Hoisted mocks ---

const mockS3Send = vi.hoisted(() => vi.fn());
const mockDynamoSend = vi.hoisted(() => vi.fn());

const mockFs = vi.hoisted(() => ({
  mkdir: vi.fn(),
  writeFile: vi.fn(),
  readFile: vi.fn(),
  readdir: vi.fn(),
  rm: vi.fn(),
}));

const mockSharpInstance = vi.hoisted(() => ({
  rotate: vi.fn(),
  metadata: vi.fn(),
}));

const sharpCacheCalls = vi.hoisted(() => [] as unknown[][]);
const mockSharpCache = vi.hoisted(() =>
  vi.fn((...args: unknown[]) => {
    sharpCacheCalls.push(args);
  }),
);
const mockSharp = vi.hoisted(() => {
  const fn = vi.fn(() => mockSharpInstance);
  Object.assign(fn, { cache: mockSharpCache });
  return fn;
});

const mockGenerateDerivatives = vi.hoisted(() => vi.fn());
const mockGenerateBlurPlaceholder = vi.hoisted(() => vi.fn());
const mockExtractExifData = vi.hoisted(() => vi.fn());

// --- Module mocks ---

vi.mock("fs/promises", () => ({
  default: mockFs,
  mkdir: mockFs.mkdir,
  writeFile: mockFs.writeFile,
  readFile: mockFs.readFile,
  readdir: mockFs.readdir,
  rm: mockFs.rm,
}));

vi.mock("sharp", () => ({
  default: mockSharp,
}));

vi.mock("@/infrastructure/services/imageService", () => ({
  generateDerivatives: mockGenerateDerivatives,
  generateBlurPlaceholder: mockGenerateBlurPlaceholder,
}));

vi.mock("@/infrastructure/services/exifService", () => ({
  extractExifData: mockExtractExifData,
}));

import { handler, _resetClientsForTesting } from "../handler.ts";

// --- Helpers ---

function createSQSRecord(
  body: { photoId: string; originalKey: string },
  messageId = "msg-1",
): SQSRecord {
  return {
    messageId,
    receiptHandle: "receipt-1",
    body: JSON.stringify(body),
    attributes: {
      ApproximateReceiveCount: "1",
      SentTimestamp: "1234567890",
      SenderId: "sender-1",
      ApproximateFirstReceiveTimestamp: "1234567890",
    },
    messageAttributes: {},
    md5OfBody: "abc",
    eventSource: "aws:sqs",
    eventSourceARN: "arn:aws:sqs:us-east-1:123456789012:image-processing",
    awsRegion: "us-east-1",
  };
}

function createSQSEvent(records: SQSRecord[]): SQSEvent {
  return { Records: records };
}

function isGetCmd(cmd: unknown): boolean {
  return (
    (cmd as { input?: { Key?: unknown } })?.input?.Key !== undefined &&
    !(cmd as { input?: { UpdateExpression?: unknown } })?.input
      ?.UpdateExpression
  );
}

function isUpdateCmd(cmd: unknown): boolean {
  return !!(cmd as { input?: { UpdateExpression?: unknown } })?.input
    ?.UpdateExpression;
}

function isS3Put(cmd: unknown): boolean {
  return (cmd as { input?: { Body?: unknown } })?.input?.Body !== undefined;
}

function isS3Get(cmd: unknown): boolean {
  return (
    (cmd as { input?: { Bucket?: unknown } })?.input?.Bucket !== undefined &&
    !isS3Put(cmd)
  );
}

function setupDefaultMocks() {
  const mockBody = {
    transformToByteArray: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
  };
  mockS3Send.mockImplementation((cmd: unknown) => {
    if (isS3Get(cmd)) {
      return Promise.resolve({ Body: mockBody });
    }
    return Promise.resolve({});
  });

  mockDynamoSend.mockImplementation((cmd: unknown) => {
    if (isGetCmd(cmd)) {
      return Promise.resolve({
        Item: {
          id: "photo-123",
          status: "processing",
          blurDataUrl: null,
          exifData: null,
          width: null,
          height: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      });
    }
    return Promise.resolve({});
  });

  // fs mocks
  mockFs.mkdir.mockResolvedValue(undefined);
  mockFs.writeFile.mockResolvedValue(undefined);
  mockFs.rm.mockResolvedValue(undefined);
  mockFs.readFile.mockResolvedValue(Buffer.from("derivative-data"));
  mockFs.readdir.mockResolvedValue([
    { name: "300w.webp", isFile: () => true, isDirectory: () => false },
    { name: "300w.avif", isFile: () => true, isDirectory: () => false },
    { name: "600w.webp", isFile: () => true, isDirectory: () => false },
    { name: "600w.avif", isFile: () => true, isDirectory: () => false },
  ]);

  // Sharp mocks
  mockSharpInstance.rotate.mockReturnValue(mockSharpInstance);
  mockSharpInstance.metadata.mockResolvedValue({ width: 4000, height: 3000 });

  // Image service mocks
  mockGenerateDerivatives.mockResolvedValue([
    "/tmp/lambda-photo-123/300w.webp",
    "/tmp/lambda-photo-123/300w.avif",
    "/tmp/lambda-photo-123/600w.webp",
    "/tmp/lambda-photo-123/600w.avif",
  ]);
  mockGenerateBlurPlaceholder.mockResolvedValue(
    "data:image/webp;base64,abc123",
  );
  mockExtractExifData.mockResolvedValue({
    cameraMake: "Canon",
    cameraModel: "EOS R5",
    lens: null,
    focalLength: null,
    aperture: null,
    shutterSpeed: null,
    iso: null,
    dateTaken: null,
    whiteBalance: null,
    meteringMode: null,
    flash: null,
  });
}

// --- Tests ---

describe("Lambda SQS Handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();

    process.env.AWS_REGION = "us-east-1";
    process.env.S3_BUCKET = "test-bucket";
    process.env.DYNAMODB_TABLE_PREFIX = "test_";

    _resetClientsForTesting(
      { send: mockS3Send } as never,
      { send: mockDynamoSend } as never,
    );
  });

  describe("happy path", () => {
    it("should process a single SQS record and return empty batchItemFailures", async () => {
      const event = createSQSEvent([
        createSQSRecord({
          photoId: "photo-123",
          originalKey: "originals/photo-123/original.jpg",
        }),
      ]);

      const result = await handler(event);

      expect(result).toEqual({ batchItemFailures: [] });
    });

    it("should follow the exact processing sequence: mkdir -> download -> derivatives -> dimensions -> EXIF -> blur -> upload -> DB update -> cleanup", async () => {
      const event = createSQSEvent([
        createSQSRecord({
          photoId: "photo-123",
          originalKey: "originals/photo-123/original.jpg",
        }),
      ]);

      const callOrder: string[] = [];
      mockFs.mkdir.mockImplementation(() => {
        callOrder.push("mkdir");
        return Promise.resolve(undefined);
      });
      mockS3Send.mockImplementation((cmd: unknown) => {
        if (isS3Get(cmd)) {
          callOrder.push("download");
          const body = {
            transformToByteArray: vi
              .fn()
              .mockResolvedValue(new Uint8Array([1, 2, 3])),
          };
          return Promise.resolve({ Body: body });
        }
        callOrder.push("upload");
        return Promise.resolve({});
      });
      mockGenerateDerivatives.mockImplementation(() => {
        callOrder.push("derivatives");
        return Promise.resolve(["/tmp/lambda-photo-123/300w.webp"]);
      });
      mockSharpInstance.metadata.mockImplementation(() => {
        callOrder.push("dimensions");
        return Promise.resolve({ width: 4000, height: 3000 });
      });
      mockExtractExifData.mockImplementation(() => {
        callOrder.push("exif");
        return Promise.resolve({ cameraMake: "Canon", cameraModel: "EOS R5" });
      });
      mockGenerateBlurPlaceholder.mockImplementation(() => {
        callOrder.push("blur");
        return Promise.resolve("data:image/webp;base64,abc123");
      });
      mockFs.readdir.mockResolvedValue([
        { name: "300w.webp", isFile: () => true, isDirectory: () => false },
      ]);
      mockDynamoSend.mockImplementation((cmd: unknown) => {
        if (isGetCmd(cmd)) {
          return Promise.resolve({
            Item: {
              id: "photo-123",
              status: "processing",
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          });
        }
        callOrder.push("dbUpdate");
        return Promise.resolve({});
      });
      mockFs.rm.mockImplementation(() => {
        callOrder.push("cleanup");
        return Promise.resolve(undefined);
      });

      await handler(event);

      expect(callOrder).toEqual([
        "mkdir",
        "download",
        "derivatives",
        "dimensions",
        "exif",
        "blur",
        "upload",
        "dbUpdate",
        "cleanup",
      ]);
    });

    it("should update DynamoDB with status=ready, blurDataUrl, exifData, width, height, updatedAt", async () => {
      const event = createSQSEvent([
        createSQSRecord({
          photoId: "photo-123",
          originalKey: "originals/photo-123/original.jpg",
        }),
      ]);

      await handler(event);

      // Find the UpdateCommand call
      const updateCalls = mockDynamoSend.mock.calls.filter((call: unknown[]) =>
        isUpdateCmd(call[0]),
      );
      expect(updateCalls.length).toBeGreaterThanOrEqual(1);

      const updateCmd = updateCalls[0][0] as { input: Record<string, unknown> };
      expect(updateCmd.input.Key).toEqual({ id: "photo-123" });
      expect(updateCmd.input.ExpressionAttributeValues).toMatchObject({
        ":status": "ready",
        ":blurDataUrl": "data:image/webp;base64,abc123",
        ":width": 4000,
        ":height": 3000,
      });
      // exifData and updatedAt should also be present
      expect(updateCmd.input.ExpressionAttributeValues).toHaveProperty(
        ":exifData",
      );
      expect(updateCmd.input.ExpressionAttributeValues).toHaveProperty(
        ":updatedAt",
      );
    });

    it("should upload derivatives to S3 with correct content types", async () => {
      mockFs.readdir.mockResolvedValue([
        { name: "300w.webp", isFile: () => true, isDirectory: () => false },
        { name: "300w.avif", isFile: () => true, isDirectory: () => false },
      ]);

      const event = createSQSEvent([
        createSQSRecord({
          photoId: "photo-123",
          originalKey: "originals/photo-123/original.jpg",
        }),
      ]);

      await handler(event);

      const putCalls = mockS3Send.mock.calls.filter((call: unknown[]) =>
        isS3Put(call[0]),
      );

      const webpCall = putCalls.find(
        (call: unknown[]) =>
          (call[0] as { input: { Key: string } }).input.Key ===
          "processed/photo-123/300w.webp",
      );
      expect(webpCall).toBeTruthy();
      expect(
        (webpCall![0] as { input: { ContentType: string } }).input.ContentType,
      ).toBe("image/webp");

      const avifCall = putCalls.find(
        (call: unknown[]) =>
          (call[0] as { input: { Key: string } }).input.Key ===
          "processed/photo-123/300w.avif",
      );
      expect(avifCall).toBeTruthy();
      expect(
        (avifCall![0] as { input: { ContentType: string } }).input.ContentType,
      ).toBe("image/avif");
    });

    it("should skip original file and non-file entries when uploading", async () => {
      mockFs.readdir.mockResolvedValue([
        { name: "original.jpg", isFile: () => true, isDirectory: () => false },
        { name: "subdir", isFile: () => false, isDirectory: () => true },
        { name: "300w.webp", isFile: () => true, isDirectory: () => false },
      ]);

      const event = createSQSEvent([
        createSQSRecord({
          photoId: "photo-123",
          originalKey: "originals/photo-123/original.jpg",
        }),
      ]);

      await handler(event);

      const putCalls = mockS3Send.mock.calls.filter((call: unknown[]) =>
        isS3Put(call[0]),
      );
      expect(putCalls.length).toBe(1);
    });
  });

  describe("idempotency guard", () => {
    it("should skip processing if photo status is already 'ready'", async () => {
      mockDynamoSend.mockImplementation((cmd: unknown) => {
        if (isGetCmd(cmd)) {
          return Promise.resolve({
            Item: {
              id: "photo-123",
              status: "ready",
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          });
        }
        return Promise.resolve({});
      });

      const event = createSQSEvent([
        createSQSRecord({
          photoId: "photo-123",
          originalKey: "originals/photo-123/original.jpg",
        }),
      ]);

      const result = await handler(event);

      expect(result).toEqual({ batchItemFailures: [] });
      // Should NOT have called any processing functions
      expect(mockGenerateDerivatives).not.toHaveBeenCalled();
      expect(mockGenerateBlurPlaceholder).not.toHaveBeenCalled();
      expect(mockExtractExifData).not.toHaveBeenCalled();
    });
  });

  describe("photo not found", () => {
    it("should return empty batchItemFailures when photo not found in DynamoDB", async () => {
      mockDynamoSend.mockImplementation((cmd: unknown) => {
        if (isGetCmd(cmd)) {
          return Promise.resolve({ Item: undefined });
        }
        return Promise.resolve({});
      });

      const event = createSQSEvent([
        createSQSRecord({
          photoId: "photo-nonexistent",
          originalKey: "originals/photo-nonexistent/original.jpg",
        }),
      ]);

      const result = await handler(event);

      // Photo not found = skip, not a failure (message consumed, not retried)
      expect(result).toEqual({ batchItemFailures: [] });
      expect(mockGenerateDerivatives).not.toHaveBeenCalled();
    });
  });

  describe("processing failure", () => {
    it("should return batchItemFailures with messageId on processing error", async () => {
      mockGenerateDerivatives.mockRejectedValue(
        new Error("Sharp processing crashed"),
      );

      const event = createSQSEvent([
        createSQSRecord(
          {
            photoId: "photo-123",
            originalKey: "originals/photo-123/original.jpg",
          },
          "msg-fail-1",
        ),
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toEqual([
        { itemIdentifier: "msg-fail-1" },
      ]);
    });

    it("should mark photo as status='error' in DynamoDB on processing failure", async () => {
      mockGenerateDerivatives.mockRejectedValue(
        new Error("Sharp processing crashed"),
      );

      const event = createSQSEvent([
        createSQSRecord({
          photoId: "photo-123",
          originalKey: "originals/photo-123/original.jpg",
        }),
      ]);

      await handler(event);

      // Find the UpdateCommand that sets status to error
      const updateCalls = mockDynamoSend.mock.calls.filter((call: unknown[]) =>
        isUpdateCmd(call[0]),
      );
      const errorUpdate = updateCalls.find((call: unknown[]) => {
        const cmd = call[0] as {
          input: { ExpressionAttributeValues?: Record<string, unknown> };
        };
        return cmd.input.ExpressionAttributeValues?.[":status"] === "error";
      });
      expect(errorUpdate).toBeTruthy();
    });

    it("should clean up temp directory even on processing failure", async () => {
      mockGenerateDerivatives.mockRejectedValue(
        new Error("Sharp processing crashed"),
      );

      const event = createSQSEvent([
        createSQSRecord({
          photoId: "photo-123",
          originalKey: "originals/photo-123/original.jpg",
        }),
      ]);

      await handler(event);

      expect(mockFs.rm).toHaveBeenCalledWith(
        expect.stringContaining("photo-123"),
        { recursive: true, force: true },
      );
    });
  });

  describe("S3 failure", () => {
    it("should return batchItemFailures when S3 download fails", async () => {
      mockS3Send.mockImplementation((cmd: unknown) => {
        if (isS3Get(cmd)) {
          return Promise.reject(new Error("S3 download failed"));
        }
        return Promise.resolve({});
      });

      const event = createSQSEvent([
        createSQSRecord(
          {
            photoId: "photo-123",
            originalKey: "originals/photo-123/original.jpg",
          },
          "msg-s3-fail",
        ),
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toEqual([
        { itemIdentifier: "msg-s3-fail" },
      ]);
    });
  });

  describe("batch response format", () => {
    it("should process multiple records and report individual failures", async () => {
      // First record succeeds, second fails
      let callCount = 0;
      mockDynamoSend.mockImplementation((cmd: unknown) => {
        if (isGetCmd(cmd)) {
          callCount++;
          return Promise.resolve({
            Item: {
              id: callCount <= 1 ? "photo-ok" : "photo-fail",
              status: "processing",
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          });
        }
        return Promise.resolve({});
      });

      // Make derivatives fail only for the second call
      let derivCallCount = 0;
      mockGenerateDerivatives.mockImplementation(() => {
        derivCallCount++;
        if (derivCallCount === 1) {
          return Promise.resolve(["/tmp/ok/300w.webp"]);
        }
        return Promise.reject(new Error("Second record failed"));
      });

      const event = createSQSEvent([
        createSQSRecord(
          {
            photoId: "photo-ok",
            originalKey: "originals/photo-ok/original.jpg",
          },
          "msg-ok",
        ),
        createSQSRecord(
          {
            photoId: "photo-fail",
            originalKey: "originals/photo-fail/original.jpg",
          },
          "msg-fail",
        ),
      ]);

      const result = await handler(event);

      // Only the failed record should be in batchItemFailures
      expect(result.batchItemFailures).toEqual([
        { itemIdentifier: "msg-fail" },
      ]);
    });
  });

  describe("Sharp configuration", () => {
    it("should call sharp.cache(false) at module level", async () => {
      expect(sharpCacheCalls).toContainEqual([false]);
    });

    it("should use sharp().rotate().metadata() for dimensions (EXIF orientation correction)", async () => {
      const event = createSQSEvent([
        createSQSRecord({
          photoId: "photo-123",
          originalKey: "originals/photo-123/original.jpg",
        }),
      ]);

      await handler(event);

      expect(mockSharp).toHaveBeenCalledWith(
        expect.stringContaining("original.jpg"),
      );
      expect(mockSharpInstance.rotate).toHaveBeenCalled();
      expect(mockSharpInstance.metadata).toHaveBeenCalled();
    });
  });

  describe("retryDbUpdate on error path", () => {
    it("should retry DB update up to 3 times on transient failure when marking error status", async () => {
      vi.useFakeTimers();

      mockGenerateDerivatives.mockRejectedValue(new Error("Processing failed"));

      let updateCallCount = 0;
      mockDynamoSend.mockImplementation((cmd: unknown) => {
        if (isGetCmd(cmd)) {
          return Promise.resolve({
            Item: {
              id: "photo-123",
              status: "processing",
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          });
        }
        if (isUpdateCmd(cmd)) {
          updateCallCount++;
          if (updateCallCount <= 2) {
            return Promise.reject(new Error("DynamoDB transient error"));
          }
          return Promise.resolve({});
        }
        return Promise.resolve({});
      });

      const event = createSQSEvent([
        createSQSRecord({
          photoId: "photo-123",
          originalKey: "originals/photo-123/original.jpg",
        }),
      ]);

      const resultPromise = handler(event);

      await vi.advanceTimersByTimeAsync(5000);

      await resultPromise;

      expect(updateCallCount).toBe(3);

      vi.useRealTimers();
    });
  });
});
