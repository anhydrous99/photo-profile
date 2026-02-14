/// <reference types="vitest/globals" />

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockUploadFile, mockUploadFileViaPresign } = vi.hoisted(() => ({
  mockUploadFile: vi.fn(),
  mockUploadFileViaPresign: vi.fn(),
}));

vi.mock("@/presentation/lib", () => ({
  uploadFile: mockUploadFile,
  uploadFileViaPresign: mockUploadFileViaPresign,
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
