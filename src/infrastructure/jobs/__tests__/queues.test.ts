/// <reference types="vitest/globals" />

import { describe, it, expect, beforeEach } from "vitest";

// ---- Mocks (must be before imports) ----

const { mockSend } = vi.hoisted(() => ({
  mockSend: vi.fn(),
}));

vi.mock("@aws-sdk/client-sqs", () => {
  class MockSQSClient {
    send = mockSend;
  }
  class MockSendMessageCommand {
    constructor(public input: unknown) {}
  }
  return {
    SQSClient: MockSQSClient,
    SendMessageCommand: MockSendMessageCommand,
  };
});

vi.mock("@/infrastructure/config/env", () => ({
  env: {
    AWS_REGION: "us-east-1",
    SQS_QUEUE_URL:
      "https://sqs.us-east-1.amazonaws.com/123456789/image-processing",
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

import { enqueueImageProcessing } from "../queues";
import type { ImageJobData, ImageJobResult } from "../queues";
import { SendMessageCommand } from "@aws-sdk/client-sqs";

describe("queues — SQS integration", () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  it("should export ImageJobData with photoId and originalKey", () => {
    const data: ImageJobData = {
      photoId: "abc-123",
      originalKey: "photos/abc-123/original.jpg",
    };
    expect(data).toEqual({
      photoId: "abc-123",
      originalKey: "photos/abc-123/original.jpg",
    });
  });

  it("should export ImageJobResult interface", () => {
    const result: ImageJobResult = {
      photoId: "abc-123",
      derivatives: ["thumb", "medium"],
      blurDataUrl: "data:image/png;base64,abc",
      exifData: null,
      width: 1920,
      height: 1080,
    };
    expect(result.photoId).toBe("abc-123");
  });

  it("should send SQS message with JSON-stringified body", async () => {
    mockSend.mockResolvedValueOnce({ MessageId: "sqs-msg-001" });

    await enqueueImageProcessing("photo-42", "photos/photo-42/original.jpg");

    expect(mockSend).toHaveBeenCalledOnce();
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd).toBeInstanceOf(SendMessageCommand);
    const body = JSON.parse(cmd.input.MessageBody);
    expect(body).toEqual({
      photoId: "photo-42",
      originalKey: "photos/photo-42/original.jpg",
    });
  });

  it("should return MessageId from SQS response", async () => {
    mockSend.mockResolvedValueOnce({ MessageId: "sqs-msg-002" });

    const result = await enqueueImageProcessing(
      "photo-99",
      "photos/photo-99/original.jpg",
    );

    expect(result).toBe("sqs-msg-002");
  });

  it("should use the configured SQS_QUEUE_URL", async () => {
    mockSend.mockResolvedValueOnce({ MessageId: "sqs-msg-003" });

    await enqueueImageProcessing("photo-7", "photos/photo-7/original.jpg");

    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.QueueUrl).toBe(
      "https://sqs.us-east-1.amazonaws.com/123456789/image-processing",
    );
  });
});
