/// <reference types="vitest/globals" />

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockUploadFile, mockUploadFileViaPresign, mockUploadVideoMultipart } =
  vi.hoisted(() => ({
    mockUploadFile: vi.fn(),
    mockUploadFileViaPresign: vi.fn(),
    mockUploadVideoMultipart: vi.fn(),
  }));

vi.mock("@/presentation/lib", () => ({
  uploadFile: mockUploadFile,
  uploadFileViaPresign: mockUploadFileViaPresign,
  uploadVideoMultipart: mockUploadVideoMultipart,
}));

import { getUploadAdapter } from "../uploadAdapter";

describe("getUploadAdapter", () => {
  const testFile = new File(["test"], "test.jpg", { type: "image/jpeg" });
  const mockProgressCallback = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("when NEXT_PUBLIC_STORAGE_BACKEND is 's3'", () => {
    const originalEnv = process.env.NEXT_PUBLIC_STORAGE_BACKEND;

    beforeEach(() => {
      process.env.NEXT_PUBLIC_STORAGE_BACKEND = "s3";
    });

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.NEXT_PUBLIC_STORAGE_BACKEND;
      } else {
        process.env.NEXT_PUBLIC_STORAGE_BACKEND = originalEnv;
      }
    });

    it("returns uploadFileViaPresign adapter", async () => {
      mockUploadFileViaPresign.mockResolvedValue({
        photoId: "test-id",
        status: "processing",
      });

      const adapter = getUploadAdapter();
      const controller = adapter(testFile, mockProgressCallback);

      await controller.promise;

      expect(mockUploadFileViaPresign).toHaveBeenCalledWith({
        file: testFile,
        onProgress: mockProgressCallback,
        signal: expect.any(AbortSignal),
      });
      expect(mockUploadFile).not.toHaveBeenCalled();
    });

    it("returns controller with abort capability", () => {
      mockUploadFileViaPresign.mockResolvedValue({
        photoId: "test-id",
        status: "processing",
      });

      const adapter = getUploadAdapter();
      const controller = adapter(testFile, mockProgressCallback);

      expect(controller).toHaveProperty("abort");
      expect(controller).toHaveProperty("promise");
      expect(typeof controller.abort).toBe("function");
    });

    it("abort function cancels S3 upload", async () => {
      let abortController: AbortController | undefined;

      mockUploadFileViaPresign.mockImplementation(
        ({ signal }: { signal?: AbortSignal }) => {
          abortController = new AbortController();
          if (signal) {
            signal.addEventListener("abort", () => abortController?.abort());
          }
          return new Promise((resolve, reject) => {
            abortController?.signal.addEventListener("abort", () =>
              reject(new Error("Upload cancelled")),
            );
          });
        },
      );

      const adapter = getUploadAdapter();
      const controller = adapter(testFile, mockProgressCallback);

      controller.abort();

      await expect(controller.promise).rejects.toThrow("Upload cancelled");
    });
  });

  describe("when NEXT_PUBLIC_STORAGE_BACKEND is 'filesystem'", () => {
    const originalEnv = process.env.NEXT_PUBLIC_STORAGE_BACKEND;

    beforeEach(() => {
      process.env.NEXT_PUBLIC_STORAGE_BACKEND = "filesystem";
    });

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.NEXT_PUBLIC_STORAGE_BACKEND;
      } else {
        process.env.NEXT_PUBLIC_STORAGE_BACKEND = originalEnv;
      }
    });

    it("returns uploadFile adapter", async () => {
      const mockController = {
        abort: vi.fn(),
        promise: Promise.resolve({
          photoId: "test-id",
          status: "processing" as const,
        }),
      };
      mockUploadFile.mockReturnValue(mockController);

      const adapter = getUploadAdapter();
      const controller = adapter(testFile, mockProgressCallback);

      await controller.promise;

      expect(mockUploadFile).toHaveBeenCalledWith(
        testFile,
        mockProgressCallback,
      );
      expect(mockUploadFileViaPresign).not.toHaveBeenCalled();
    });

    it("returns controller from uploadFile", () => {
      const mockController = {
        abort: vi.fn(),
        promise: Promise.resolve({
          photoId: "test-id",
          status: "processing" as const,
        }),
      };
      mockUploadFile.mockReturnValue(mockController);

      const adapter = getUploadAdapter();
      const controller = adapter(testFile, mockProgressCallback);

      expect(controller).toBe(mockController);
    });
  });

  describe("when NEXT_PUBLIC_VIDEO_ENABLED is 'true'", () => {
    const origVideo = process.env.NEXT_PUBLIC_VIDEO_ENABLED;
    const origBackend = process.env.NEXT_PUBLIC_STORAGE_BACKEND;

    beforeEach(() => {
      process.env.NEXT_PUBLIC_VIDEO_ENABLED = "true";
      process.env.NEXT_PUBLIC_STORAGE_BACKEND = "s3";
      // uploadAdapter reads NEXT_PUBLIC_VIDEO_ENABLED at module load.
      vi.resetModules();
    });

    afterEach(() => {
      if (origVideo === undefined) delete process.env.NEXT_PUBLIC_VIDEO_ENABLED;
      else process.env.NEXT_PUBLIC_VIDEO_ENABLED = origVideo;
      if (origBackend === undefined)
        delete process.env.NEXT_PUBLIC_STORAGE_BACKEND;
      else process.env.NEXT_PUBLIC_STORAGE_BACKEND = origBackend;
    });

    it("routes mp4 files (by MIME) to the multipart uploader", async () => {
      mockUploadVideoMultipart.mockResolvedValue({
        photoId: "v",
        status: "processing",
      });
      const { getUploadAdapter } = await import("../uploadAdapter");
      const adapter = getUploadAdapter();
      const file = new File(["x"], "clip.mp4", { type: "video/mp4" });

      await adapter(file, mockProgressCallback).promise;

      expect(mockUploadVideoMultipart).toHaveBeenCalledOnce();
      expect(mockUploadFileViaPresign).not.toHaveBeenCalled();
    });

    it("routes .mov files with empty MIME (by extension) to the multipart uploader", async () => {
      mockUploadVideoMultipart.mockResolvedValue({
        photoId: "v",
        status: "processing",
      });
      const { getUploadAdapter } = await import("../uploadAdapter");
      const adapter = getUploadAdapter();
      const file = new File(["x"], "clip.mov", { type: "" });

      await adapter(file, mockProgressCallback).promise;

      expect(mockUploadVideoMultipart).toHaveBeenCalledOnce();
    });

    it("still routes image files to the image path", async () => {
      mockUploadFileViaPresign.mockResolvedValue({
        photoId: "i",
        status: "processing",
      });
      const { getUploadAdapter } = await import("../uploadAdapter");
      const adapter = getUploadAdapter();
      const file = new File(["x"], "pic.jpg", { type: "image/jpeg" });

      await adapter(file, mockProgressCallback).promise;

      expect(mockUploadFileViaPresign).toHaveBeenCalledOnce();
      expect(mockUploadVideoMultipart).not.toHaveBeenCalled();
    });
  });

  describe("when NEXT_PUBLIC_STORAGE_BACKEND is undefined", () => {
    const originalEnv = process.env.NEXT_PUBLIC_STORAGE_BACKEND;

    beforeEach(() => {
      delete process.env.NEXT_PUBLIC_STORAGE_BACKEND;
    });

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.NEXT_PUBLIC_STORAGE_BACKEND;
      } else {
        process.env.NEXT_PUBLIC_STORAGE_BACKEND = originalEnv;
      }
    });

    it("defaults to uploadFile (filesystem mode)", async () => {
      const mockController = {
        abort: vi.fn(),
        promise: Promise.resolve({
          photoId: "test-id",
          status: "processing" as const,
        }),
      };
      mockUploadFile.mockReturnValue(mockController);

      const adapter = getUploadAdapter();
      const controller = adapter(testFile, mockProgressCallback);

      await controller.promise;

      expect(mockUploadFile).toHaveBeenCalledWith(
        testFile,
        mockProgressCallback,
      );
      expect(mockUploadFileViaPresign).not.toHaveBeenCalled();
    });
  });
});
