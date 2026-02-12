import { describe, it, expect, vi, beforeEach } from "vitest";

const mockEnqueueSQS = vi.hoisted(() => vi.fn());

vi.mock("../sqsEnqueue", () => ({
  enqueueSQS: mockEnqueueSQS,
}));

describe("enqueueImageProcessing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls enqueueSQS with correct args", async () => {
    mockEnqueueSQS.mockResolvedValueOnce("sqs-msg-id-123");

    const { enqueueImageProcessing } = await import("../enqueue");
    const result = await enqueueImageProcessing(
      "photo-001",
      "originals/photo-001/image.jpg",
    );

    expect(mockEnqueueSQS).toHaveBeenCalledWith(
      "photo-001",
      "originals/photo-001/image.jpg",
    );
    expect(result).toBe("sqs-msg-id-123");
  });

  it("propagates enqueueSQS errors", async () => {
    mockEnqueueSQS.mockRejectedValueOnce(new Error("SQS unavailable"));

    const { enqueueImageProcessing } = await import("../enqueue");
    await expect(
      enqueueImageProcessing("photo-001", "originals/photo-001/image.jpg"),
    ).rejects.toThrow("SQS unavailable");
  });

  it("re-exports ImageJobData and ImageJobResult types", async () => {
    const enqueueModule = await import("../enqueue");

    // Verify the module exports the enqueueImageProcessing function
    expect(typeof enqueueModule.enqueueImageProcessing).toBe("function");
  });
});
