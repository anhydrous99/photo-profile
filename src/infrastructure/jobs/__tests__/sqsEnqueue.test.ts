import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSend = vi.hoisted(() => vi.fn());

class MockSQSClient {
  constructor(public config: Record<string, unknown>) {
    mockSQSClientConstructor(config);
  }
  send = mockSend;
}

const mockSQSClientConstructor = vi.hoisted(() => vi.fn());
const mockSendMessageCommand = vi.hoisted(() => vi.fn());

vi.mock("@aws-sdk/client-sqs", () => ({
  SQSClient: MockSQSClient,
  SendMessageCommand: mockSendMessageCommand,
}));

vi.mock("@/infrastructure/config/env", () => ({
  env: {
    AWS_REGION: "us-east-1",
    SQS_QUEUE_URL:
      "https://sqs.us-east-1.amazonaws.com/123456789012/photo-queue",
    QUEUE_BACKEND: "sqs",
  },
}));

describe("sqsEnqueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("calls SQS SendMessage with correct QueueUrl and JSON body", async () => {
    mockSend.mockResolvedValue({ MessageId: "msg-abc-123" });

    const { enqueueSQS } = await import("../sqsEnqueue");
    await enqueueSQS("photo-001", "originals/photo-001/image.jpg");

    expect(mockSendMessageCommand).toHaveBeenCalledWith({
      QueueUrl: "https://sqs.us-east-1.amazonaws.com/123456789012/photo-queue",
      MessageBody: JSON.stringify({
        photoId: "photo-001",
        originalKey: "originals/photo-001/image.jpg",
      }),
    });
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it("returns the SQS MessageId", async () => {
    mockSend.mockResolvedValue({ MessageId: "msg-xyz-789" });

    const { enqueueSQS } = await import("../sqsEnqueue");
    const result = await enqueueSQS(
      "photo-002",
      "originals/photo-002/image.jpg",
    );

    expect(result).toBe("msg-xyz-789");
  });

  it("throws on SQS error", async () => {
    mockSend.mockRejectedValue(new Error("SQS service unavailable"));

    const { enqueueSQS } = await import("../sqsEnqueue");
    await expect(
      enqueueSQS("photo-003", "originals/photo-003/image.jpg"),
    ).rejects.toThrow("SQS service unavailable");
  });

  it("constructs SQSClient with correct region", async () => {
    mockSend.mockResolvedValue({ MessageId: "msg-123" });

    await import("../sqsEnqueue");

    expect(mockSQSClientConstructor).toHaveBeenCalledWith({
      region: "us-east-1",
    });
  });
});
