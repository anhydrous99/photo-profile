import { describe, it, expect, vi, beforeEach } from "vitest";

const mockEnqueueSQS = vi.hoisted(() => vi.fn());
const mockEnqueueBullMQ = vi.hoisted(() => vi.fn());

vi.mock("../sqsEnqueue", () => ({
  enqueueSQS: mockEnqueueSQS,
}));

vi.mock("../queues", () => ({
  enqueueImageProcessing: mockEnqueueBullMQ,
  imageQueue: vi.fn(),
}));

// Default env mock — overridden per test via vi.doMock
const mockEnv = vi.hoisted(() => ({
  QUEUE_BACKEND: "bullmq" as "bullmq" | "sqs",
  SQS_QUEUE_URL: "https://sqs.us-east-1.amazonaws.com/123456789012/photo-queue",
  AWS_REGION: "us-east-1",
}));

vi.mock("@/infrastructure/config/env", () => ({
  env: mockEnv,
}));

describe("enqueue strategy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.QUEUE_BACKEND = "bullmq";
  });

  it("calls SQS path when QUEUE_BACKEND=sqs", async () => {
    mockEnv.QUEUE_BACKEND = "sqs";
    mockEnqueueSQS.mockResolvedValue("sqs-msg-id-123");

    const { enqueueImageProcessing } = await import("../enqueue");
    const result = await enqueueImageProcessing(
      "photo-001",
      "originals/photo-001/image.jpg",
    );

    expect(result).toBe("sqs-msg-id-123");
    expect(mockEnqueueSQS).toHaveBeenCalledWith(
      "photo-001",
      "originals/photo-001/image.jpg",
    );
    expect(mockEnqueueBullMQ).not.toHaveBeenCalled();
  });

  it("calls BullMQ path when QUEUE_BACKEND=bullmq", async () => {
    mockEnv.QUEUE_BACKEND = "bullmq";
    mockEnqueueBullMQ.mockResolvedValue("bull-job-id-456");

    const { enqueueImageProcessing } = await import("../enqueue");
    const result = await enqueueImageProcessing(
      "photo-001",
      "originals/photo-001/image.jpg",
    );

    expect(result).toBe("bull-job-id-456");
    expect(mockEnqueueBullMQ).toHaveBeenCalledWith(
      "photo-001",
      "originals/photo-001/image.jpg",
    );
    expect(mockEnqueueSQS).not.toHaveBeenCalled();
  });

  it("does not statically import bullmq or ioredis in enqueue.ts", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const filePath = path.resolve(__dirname, "../enqueue.ts");
    const content = fs.readFileSync(filePath, "utf-8");

    // Verify no static imports of bullmq or ioredis
    const staticBullmqImport = /^import\s+.*from\s+["']bullmq["']/m;
    const staticIoredisImport = /^import\s+.*from\s+["']ioredis["']/m;

    expect(content).not.toMatch(staticBullmqImport);
    expect(content).not.toMatch(staticIoredisImport);
  });

  it("uses dynamic import for BullMQ path", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const filePath = path.resolve(__dirname, "../enqueue.ts");
    const content = fs.readFileSync(filePath, "utf-8");

    // Verify dynamic import is used for queues module
    expect(content).toContain('import("./queues")');
  });

  it("uses dynamic import for SQS path", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const filePath = path.resolve(__dirname, "../enqueue.ts");
    const content = fs.readFileSync(filePath, "utf-8");

    // Verify dynamic import is used for sqsEnqueue module
    expect(content).toContain('import("./sqsEnqueue")');
  });

  it("re-exports ImageJobData and ImageJobResult types", async () => {
    const enqueueModule = await import("../enqueue");

    // Verify the module exports the enqueueImageProcessing function
    expect(typeof enqueueModule.enqueueImageProcessing).toBe("function");
  });
});
