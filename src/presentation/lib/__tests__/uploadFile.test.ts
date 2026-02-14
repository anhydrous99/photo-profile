import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { uploadFileToS3, uploadFileViaPresign } from "../uploadFile";

describe("uploadFileToS3", () => {
  let xhrMock: {
    open: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
    setRequestHeader: ReturnType<typeof vi.fn>;
    abort: ReturnType<typeof vi.fn>;
    upload: {
      addEventListener: ReturnType<typeof vi.fn>;
    };
    addEventListener: ReturnType<typeof vi.fn>;
    status: number;
    responseText: string;
    timeout: number;
  };

  beforeEach(() => {
    xhrMock = {
      open: vi.fn(),
      send: vi.fn(),
      setRequestHeader: vi.fn(),
      abort: vi.fn(),
      upload: {
        addEventListener: vi.fn(),
      },
      addEventListener: vi.fn(),
      status: 200,
      responseText: "",
      timeout: 0,
    };

    global.XMLHttpRequest = class {
      constructor() {
        return xhrMock;
      }
    } as unknown as typeof XMLHttpRequest;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should send PUT request to presigned URL", async () => {
    const file = new File(["test content"], "test.jpg", { type: "image/jpeg" });
    const presignedUrl = "https://s3.amazonaws.com/bucket/key?signature=xyz";

    const uploadPromise = uploadFileToS3({
      presignedUrl,
      file,
      contentType: "image/jpeg",
    });

    // Trigger load event
    const loadHandler = xhrMock.addEventListener.mock.calls.find(
      (call) => call[0] === "load",
    )?.[1];
    loadHandler?.();

    await uploadPromise;

    expect(xhrMock.open).toHaveBeenCalledWith("PUT", presignedUrl, true);
  });

  it("should send raw File object, not FormData", async () => {
    const file = new File(["test content"], "test.jpg", { type: "image/jpeg" });
    const presignedUrl = "https://s3.amazonaws.com/bucket/key?signature=xyz";

    const uploadPromise = uploadFileToS3({
      presignedUrl,
      file,
      contentType: "image/jpeg",
    });

    // Trigger load event
    const loadHandler = xhrMock.addEventListener.mock.calls.find(
      (call) => call[0] === "load",
    )?.[1];
    loadHandler?.();

    await uploadPromise;

    expect(xhrMock.send).toHaveBeenCalledWith(file);
    // Ensure it's NOT FormData
    expect(xhrMock.send).not.toHaveBeenCalledWith(expect.any(FormData));
  });

  it("should set Content-Type header", async () => {
    const file = new File(["test content"], "test.jpg", { type: "image/jpeg" });
    const presignedUrl = "https://s3.amazonaws.com/bucket/key?signature=xyz";

    const uploadPromise = uploadFileToS3({
      presignedUrl,
      file,
      contentType: "image/jpeg",
    });

    // Trigger load event
    const loadHandler = xhrMock.addEventListener.mock.calls.find(
      (call) => call[0] === "load",
    )?.[1];
    loadHandler?.();

    await uploadPromise;

    expect(xhrMock.setRequestHeader).toHaveBeenCalledWith(
      "Content-Type",
      "image/jpeg",
    );
  });

  it("should report upload progress", async () => {
    const file = new File(["test content"], "test.jpg", { type: "image/jpeg" });
    const presignedUrl = "https://s3.amazonaws.com/bucket/key?signature=xyz";
    const onProgress = vi.fn();

    const uploadPromise = uploadFileToS3({
      presignedUrl,
      file,
      contentType: "image/jpeg",
      onProgress,
    });

    // Trigger progress event
    const progressHandler = xhrMock.upload.addEventListener.mock.calls.find(
      (call) => call[0] === "progress",
    )?.[1];
    progressHandler?.({ lengthComputable: true, loaded: 50, total: 100 });

    // Trigger load event
    const loadHandler = xhrMock.addEventListener.mock.calls.find(
      (call) => call[0] === "load",
    )?.[1];
    loadHandler?.();

    await uploadPromise;

    expect(onProgress).toHaveBeenCalledWith(50);
  });

  it("should handle abort signal", async () => {
    const file = new File(["test content"], "test.jpg", { type: "image/jpeg" });
    const presignedUrl = "https://s3.amazonaws.com/bucket/key?signature=xyz";
    const abortController = new AbortController();

    const uploadPromise = uploadFileToS3({
      presignedUrl,
      file,
      contentType: "image/jpeg",
      signal: abortController.signal,
    });

    // Trigger abort
    abortController.abort();

    // Trigger abort event on XHR
    const abortHandler = xhrMock.addEventListener.mock.calls.find(
      (call) => call[0] === "abort",
    )?.[1];
    abortHandler?.();

    await expect(uploadPromise).rejects.toThrow("Upload cancelled");
  });

  it("should set timeout to 600000ms", async () => {
    const file = new File(["test content"], "test.jpg", { type: "image/jpeg" });
    const presignedUrl = "https://s3.amazonaws.com/bucket/key?signature=xyz";

    const uploadPromise = uploadFileToS3({
      presignedUrl,
      file,
      contentType: "image/jpeg",
    });

    // Trigger load event
    const loadHandler = xhrMock.addEventListener.mock.calls.find(
      (call) => call[0] === "load",
    )?.[1];
    loadHandler?.();

    await uploadPromise;

    expect(xhrMock.timeout).toBe(600000);
  });

  it("should reject on network error", async () => {
    const file = new File(["test content"], "test.jpg", { type: "image/jpeg" });
    const presignedUrl = "https://s3.amazonaws.com/bucket/key?signature=xyz";

    const uploadPromise = uploadFileToS3({
      presignedUrl,
      file,
      contentType: "image/jpeg",
    });

    // Trigger error event
    const errorHandler = xhrMock.addEventListener.mock.calls.find(
      (call) => call[0] === "error",
    )?.[1];
    errorHandler?.();

    await expect(uploadPromise).rejects.toThrow("Network error during upload");
  });

  it("should reject on timeout", async () => {
    const file = new File(["test content"], "test.jpg", { type: "image/jpeg" });
    const presignedUrl = "https://s3.amazonaws.com/bucket/key?signature=xyz";

    const uploadPromise = uploadFileToS3({
      presignedUrl,
      file,
      contentType: "image/jpeg",
    });

    // Trigger timeout event
    const timeoutHandler = xhrMock.addEventListener.mock.calls.find(
      (call) => call[0] === "timeout",
    )?.[1];
    timeoutHandler?.();

    await expect(uploadPromise).rejects.toThrow(/timed out/);
  });

  it("should reject on non-2xx status", async () => {
    const file = new File(["test content"], "test.jpg", { type: "image/jpeg" });
    const presignedUrl = "https://s3.amazonaws.com/bucket/key?signature=xyz";

    xhrMock.status = 403;

    const uploadPromise = uploadFileToS3({
      presignedUrl,
      file,
      contentType: "image/jpeg",
    });

    // Trigger load event
    const loadHandler = xhrMock.addEventListener.mock.calls.find(
      (call) => call[0] === "load",
    )?.[1];
    loadHandler?.();

    await expect(uploadPromise).rejects.toThrow("Upload failed: 403");
  });
});

describe("uploadFileViaPresign", () => {
  let xhrMock: {
    open: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
    setRequestHeader: ReturnType<typeof vi.fn>;
    abort: ReturnType<typeof vi.fn>;
    upload: {
      addEventListener: ReturnType<typeof vi.fn>;
    };
    addEventListener: ReturnType<typeof vi.fn>;
    status: number;
    responseText: string;
    timeout: number;
  };

  beforeEach(() => {
    xhrMock = {
      open: vi.fn(),
      send: vi.fn(),
      setRequestHeader: vi.fn(),
      abort: vi.fn(),
      upload: {
        addEventListener: vi.fn(),
      },
      addEventListener: vi.fn(),
      status: 200,
      responseText: "",
      timeout: 0,
    };

    global.XMLHttpRequest = class {
      constructor() {
        return xhrMock;
      }
    } as unknown as typeof XMLHttpRequest;

    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should call presign → S3 → confirm in order", async () => {
    const file = new File(["test content"], "test.jpg", { type: "image/jpeg" });
    const presignedUrl = "https://s3.amazonaws.com/bucket/key?signature=xyz";
    const photoId = "photo-123";
    const key = "uploads/photo-123.jpg";

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ presignedUrl, photoId, key }),
    });

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ photoId, status: "processing" }),
    });

    const uploadPromise = uploadFileViaPresign({ file });

    await new Promise((resolve) => setTimeout(resolve, 0));

    const loadHandler = xhrMock.addEventListener.mock.calls.find(
      (call) => call[0] === "load",
    )?.[1];
    loadHandler?.();

    const result = await uploadPromise;

    // Verify presign call
    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      "/api/admin/upload/presign",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: "test.jpg",
          contentType: "image/jpeg",
          fileSize: file.size,
        }),
      },
    );

    // Verify S3 upload
    expect(xhrMock.open).toHaveBeenCalledWith("PUT", presignedUrl, true);
    expect(xhrMock.send).toHaveBeenCalledWith(file);

    // Verify confirm call
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      "/api/admin/upload/confirm",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photoId,
          key,
          originalFilename: "test.jpg",
        }),
      },
    );

    expect(result).toEqual({ photoId, status: "processing" });
  });

  it("should reject if presign fails", async () => {
    const file = new File(["test content"], "test.jpg", { type: "image/jpeg" });

    // Mock presign failure
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: "Presign failed" }),
    });

    await expect(uploadFileViaPresign({ file })).rejects.toThrow(
      "Presign failed",
    );

    // Verify S3 upload was NOT called
    expect(xhrMock.send).not.toHaveBeenCalled();
  });

  it("should reject if S3 upload fails", async () => {
    const file = new File(["test content"], "test.jpg", { type: "image/jpeg" });
    const presignedUrl = "https://s3.amazonaws.com/bucket/key?signature=xyz";
    const photoId = "photo-123";
    const key = "uploads/photo-123.jpg";

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ presignedUrl, photoId, key }),
    });

    const uploadPromise = uploadFileViaPresign({ file });

    await new Promise((resolve) => setTimeout(resolve, 0));

    const errorHandler = xhrMock.addEventListener.mock.calls.find(
      (call) => call[0] === "error",
    )?.[1];
    errorHandler?.();

    await expect(uploadPromise).rejects.toThrow("Network error during upload");

    // Verify confirm was NOT called
    expect(global.fetch).toHaveBeenCalledTimes(1); // Only presign
  });

  it("should reject if confirm fails", async () => {
    const file = new File(["test content"], "test.jpg", { type: "image/jpeg" });
    const presignedUrl = "https://s3.amazonaws.com/bucket/key?signature=xyz";
    const photoId = "photo-123";
    const key = "uploads/photo-123.jpg";

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ presignedUrl, photoId, key }),
    });

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: "Confirm failed" }),
    });

    const uploadPromise = uploadFileViaPresign({ file });

    await new Promise((resolve) => setTimeout(resolve, 0));

    const loadHandler = xhrMock.addEventListener.mock.calls.find(
      (call) => call[0] === "load",
    )?.[1];
    loadHandler?.();

    await expect(uploadPromise).rejects.toThrow("Confirm failed");
  });

  it("should pass progress callback to S3 upload", async () => {
    const file = new File(["test content"], "test.jpg", { type: "image/jpeg" });
    const presignedUrl = "https://s3.amazonaws.com/bucket/key?signature=xyz";
    const photoId = "photo-123";
    const key = "uploads/photo-123.jpg";
    const onProgress = vi.fn();

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ presignedUrl, photoId, key }),
    });

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ photoId, status: "processing" }),
    });

    const uploadPromise = uploadFileViaPresign({ file, onProgress });

    await new Promise((resolve) => setTimeout(resolve, 0));

    const progressHandler = xhrMock.upload.addEventListener.mock.calls.find(
      (call) => call[0] === "progress",
    )?.[1];
    progressHandler?.({ lengthComputable: true, loaded: 50, total: 100 });

    const loadHandler = xhrMock.addEventListener.mock.calls.find(
      (call) => call[0] === "load",
    )?.[1];
    loadHandler?.();

    await uploadPromise;

    expect(onProgress).toHaveBeenCalledWith(50);
  });

  it("should pass abort signal to S3 upload", async () => {
    const file = new File(["test content"], "test.jpg", { type: "image/jpeg" });
    const presignedUrl = "https://s3.amazonaws.com/bucket/key?signature=xyz";
    const photoId = "photo-123";
    const key = "uploads/photo-123.jpg";
    const abortController = new AbortController();

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ presignedUrl, photoId, key }),
    });

    const uploadPromise = uploadFileViaPresign({
      file,
      signal: abortController.signal,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    abortController.abort();

    const abortHandler = xhrMock.addEventListener.mock.calls.find(
      (call) => call[0] === "abort",
    )?.[1];
    abortHandler?.();

    await expect(uploadPromise).rejects.toThrow("Upload cancelled");
  });
});
