import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Context, SQSEvent, SQSRecord } from "aws-lambda";
import type { Photo } from "@/domain/entities";

// --- Hoisted mocks ---

const mockProcessImageJob = vi.hoisted(() => vi.fn());

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

vi.mock("@/infrastructure/database/dynamodb/repositories", () => ({
  DynamoDBPhotoRepository: vi.fn(function () {
    return mockPhotoRepository;
  }),
}));

vi.mock("@/infrastructure/logging/logger", () => ({
  logger: mockLogger,
}));

// --- Helpers ---

function createSQSRecord(
  body: { photoId: string; originalKey: string },
  messageId = "msg-001",
): SQSRecord {
  return {
    messageId,
    receiptHandle: "receipt-handle",
    body: JSON.stringify(body),
    attributes: {
      ApproximateReceiveCount: "1",
      SentTimestamp: "1234567890",
      SenderId: "sender-id",
      ApproximateFirstReceiveTimestamp: "1234567890",
    },
    messageAttributes: {},
    md5OfBody: "md5",
    eventSource: "aws:sqs",
    eventSourceARN: "arn:aws:sqs:us-east-1:123456789:image-processing",
    awsRegion: "us-east-1",
  };
}

function createSQSEvent(records: SQSRecord[]): SQSEvent {
  return { Records: records };
}

function createMockPhoto(photoId: string): Photo {
  return {
    id: photoId,
    title: null,
    description: null,
    originalFilename: "test.jpg",
    blurDataUrl: null,
    exifData: null,
    width: null,
    height: null,
    status: "processing",
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
  };
}

function createLambdaContext(): Context {
  return {
    callbackWaitsForEmptyEventLoop: false,
    functionName: "image-processor",
    functionVersion: "$LATEST",
    invokedFunctionArn:
      "arn:aws:lambda:us-east-1:123456789:function:image-processor",
    memoryLimitInMB: "2048",
    awsRequestId: "request-123",
    logGroupName: "/aws/lambda/image-processor",
    logStreamName: "2026/02/14/[$LATEST]abc123",
    getRemainingTimeInMillis: () => 1000,
    done: () => undefined,
    fail: () => undefined,
    succeed: () => undefined,
  };
}

// --- Tests ---

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Lambda SQS handler", () => {
  it("should parse SQS event and extract photoId and originalKey from message body", async () => {
    const { handler } = await import("../lambdaHandler");

    const record = createSQSRecord({
      photoId: "photo-abc",
      originalKey: "originals/photo-abc/original.jpg",
    });
    const event = createSQSEvent([record]);

    mockProcessImageJob.mockResolvedValue({
      photoId: "photo-abc",
      derivatives: ["300w.webp"],
      blurDataUrl: "data:image/webp;base64,blur",
      exifData: { cameraMake: "Canon", cameraModel: "EOS R5" },
      width: 4000,
      height: 3000,
    });
    mockPhotoRepository.findById.mockResolvedValue(
      createMockPhoto("photo-abc"),
    );
    mockPhotoRepository.save.mockResolvedValue(undefined);

    await handler(event, createLambdaContext());

    expect(mockProcessImageJob).toHaveBeenCalledWith({
      photoId: "photo-abc",
      originalKey: "originals/photo-abc/original.jpg",
    });
  });

  it("should call processImageJob with correct data", async () => {
    const { handler } = await import("../lambdaHandler");

    const record = createSQSRecord({
      photoId: "photo-xyz",
      originalKey: "originals/photo-xyz/image.png",
    });
    const event = createSQSEvent([record]);

    mockProcessImageJob.mockResolvedValue({
      photoId: "photo-xyz",
      derivatives: ["600w.webp", "600w.avif"],
      blurDataUrl: "data:image/webp;base64,xyz",
      exifData: null,
      width: 1920,
      height: 1080,
    });
    mockPhotoRepository.findById.mockResolvedValue(
      createMockPhoto("photo-xyz"),
    );
    mockPhotoRepository.save.mockResolvedValue(undefined);

    await handler(event, createLambdaContext());

    expect(mockProcessImageJob).toHaveBeenCalledTimes(1);
    expect(mockProcessImageJob).toHaveBeenCalledWith({
      photoId: "photo-xyz",
      originalKey: "originals/photo-xyz/image.png",
    });
  });

  it("should update DynamoDB photo to status='ready' with result data on success", async () => {
    const { handler } = await import("../lambdaHandler");

    const photo = createMockPhoto("photo-123");
    const record = createSQSRecord({
      photoId: "photo-123",
      originalKey: "originals/photo-123/original.jpg",
    });
    const event = createSQSEvent([record]);

    mockProcessImageJob.mockResolvedValue({
      photoId: "photo-123",
      derivatives: ["300w.webp"],
      blurDataUrl: "data:image/webp;base64,abc",
      exifData: { cameraMake: "Nikon", cameraModel: "Z9" },
      width: 8000,
      height: 5000,
    });
    mockPhotoRepository.findById.mockResolvedValue(photo);
    mockPhotoRepository.save.mockResolvedValue(undefined);

    await handler(event, createLambdaContext());

    expect(mockPhotoRepository.findById).toHaveBeenCalledWith("photo-123");
    expect(mockPhotoRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "photo-123",
        status: "ready",
        blurDataUrl: "data:image/webp;base64,abc",
        exifData: { cameraMake: "Nikon", cameraModel: "Z9" },
        width: 8000,
        height: 5000,
      }),
    );
    const savedPhoto = mockPhotoRepository.save.mock.calls[0][0] as Photo;
    expect(savedPhoto.updatedAt.getTime()).toBeGreaterThan(
      new Date("2025-01-01").getTime(),
    );
  });

  it("should update DynamoDB photo to status='error' when processImageJob throws", async () => {
    const { handler } = await import("../lambdaHandler");

    const photo = createMockPhoto("photo-fail");
    const record = createSQSRecord(
      {
        photoId: "photo-fail",
        originalKey: "originals/photo-fail/original.jpg",
      },
      "msg-fail",
    );
    const event = createSQSEvent([record]);

    mockProcessImageJob.mockRejectedValue(new Error("Sharp crash"));
    mockPhotoRepository.findById.mockResolvedValue(photo);
    mockPhotoRepository.save.mockResolvedValue(undefined);

    const result = await handler(event, createLambdaContext());

    expect(result.batchItemFailures).toEqual([{ itemIdentifier: "msg-fail" }]);

    expect(mockPhotoRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "photo-fail",
        status: "error",
      }),
    );

    expect(mockLogger.error).toHaveBeenCalledWith(
      "Lambda image processing failed",
      expect.objectContaining({ messageId: "msg-fail" }),
    );
  });

  it("should process multiple SQS records in a batch", async () => {
    const { handler } = await import("../lambdaHandler");

    const record1 = createSQSRecord(
      { photoId: "photo-1", originalKey: "originals/photo-1/a.jpg" },
      "msg-1",
    );
    const record2 = createSQSRecord(
      { photoId: "photo-2", originalKey: "originals/photo-2/b.jpg" },
      "msg-2",
    );
    const record3 = createSQSRecord(
      { photoId: "photo-3", originalKey: "originals/photo-3/c.jpg" },
      "msg-3",
    );
    const event = createSQSEvent([record1, record2, record3]);

    mockProcessImageJob.mockResolvedValue({
      photoId: "any",
      derivatives: [],
      blurDataUrl: "data:image/webp;base64,x",
      exifData: null,
      width: 100,
      height: 100,
    });

    mockPhotoRepository.findById.mockImplementation((id: string) =>
      Promise.resolve(createMockPhoto(id)),
    );
    mockPhotoRepository.save.mockResolvedValue(undefined);

    const result = await handler(event, createLambdaContext());

    expect(mockProcessImageJob).toHaveBeenCalledTimes(3);
    expect(mockPhotoRepository.save).toHaveBeenCalledTimes(3);
    expect(result.batchItemFailures).toEqual([]);
  });

  it("should handle partial batch failure — only failed records in batchItemFailures", async () => {
    const { handler } = await import("../lambdaHandler");

    const record1 = createSQSRecord(
      { photoId: "photo-ok", originalKey: "originals/photo-ok/a.jpg" },
      "msg-ok",
    );
    const record2 = createSQSRecord(
      { photoId: "photo-bad", originalKey: "originals/photo-bad/b.jpg" },
      "msg-bad",
    );
    const event = createSQSEvent([record1, record2]);

    mockProcessImageJob
      .mockResolvedValueOnce({
        photoId: "photo-ok",
        derivatives: [],
        blurDataUrl: "data:image/webp;base64,ok",
        exifData: null,
        width: 100,
        height: 100,
      })
      .mockRejectedValueOnce(new Error("Processing failed"));

    mockPhotoRepository.findById.mockImplementation((id: string) =>
      Promise.resolve(createMockPhoto(id)),
    );
    mockPhotoRepository.save.mockResolvedValue(undefined);

    const result = await handler(event, createLambdaContext());

    expect(result.batchItemFailures).toEqual([{ itemIdentifier: "msg-bad" }]);

    expect(mockPhotoRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: "photo-ok", status: "ready" }),
    );
    expect(mockPhotoRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: "photo-bad", status: "error" }),
    );
  });

  it("should return empty batchItemFailures when all records succeed", async () => {
    const { handler } = await import("../lambdaHandler");

    const record = createSQSRecord({
      photoId: "photo-ok",
      originalKey: "originals/photo-ok/a.jpg",
    });
    const event = createSQSEvent([record]);

    mockProcessImageJob.mockResolvedValue({
      photoId: "photo-ok",
      derivatives: [],
      blurDataUrl: "data:image/webp;base64,ok",
      exifData: null,
      width: 100,
      height: 100,
    });
    mockPhotoRepository.findById.mockResolvedValue(createMockPhoto("photo-ok"));
    mockPhotoRepository.save.mockResolvedValue(undefined);

    const result = await handler(event, createLambdaContext());

    expect(result.batchItemFailures).toEqual([]);
  });

  it("should not throw if error status DB update fails (best effort)", async () => {
    const { handler } = await import("../lambdaHandler");

    const record = createSQSRecord(
      { photoId: "photo-dbfail", originalKey: "originals/photo-dbfail/a.jpg" },
      "msg-dbfail",
    );
    const event = createSQSEvent([record]);

    mockProcessImageJob.mockRejectedValue(new Error("Processing failed"));
    mockPhotoRepository.findById.mockRejectedValue(
      new Error("DynamoDB unavailable"),
    );

    const result = await handler(event, createLambdaContext());

    expect(result.batchItemFailures).toEqual([
      { itemIdentifier: "msg-dbfail" },
    ]);
  });

  it("should skip DB update when photo is not found", async () => {
    const { handler } = await import("../lambdaHandler");

    const record = createSQSRecord({
      photoId: "photo-gone",
      originalKey: "originals/photo-gone/a.jpg",
    });
    const event = createSQSEvent([record]);

    mockProcessImageJob.mockResolvedValue({
      photoId: "photo-gone",
      derivatives: [],
      blurDataUrl: "data:image/webp;base64,x",
      exifData: null,
      width: 100,
      height: 100,
    });
    mockPhotoRepository.findById.mockResolvedValue(null);

    const result = await handler(event, createLambdaContext());

    expect(mockPhotoRepository.save).not.toHaveBeenCalled();
    expect(result.batchItemFailures).toEqual([]);
  });
});
