import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Job } from "bullmq";
import type { ImageJobData, ImageJobResult } from "../queues";

const mockAdapter = vi.hoisted(() => ({
  getFile: vi.fn(),
  saveFile: vi.fn(),
  getFileStream: vi.fn(),
  deleteFiles: vi.fn(),
  fileExists: vi.fn(),
  listFiles: vi.fn(),
}));

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

const mockSharpCache = vi.hoisted(() => vi.fn());
const mockSharp = vi.hoisted(() => {
  const fn = vi.fn(() => mockSharpInstance);
  Object.assign(fn, { cache: mockSharpCache });
  return fn;
});

const mockGenerateDerivatives = vi.hoisted(() => vi.fn());
const mockGenerateBlurPlaceholder = vi.hoisted(() => vi.fn());
const mockExtractExifData = vi.hoisted(() => vi.fn());

const mockPhoto = vi.hoisted(() => ({
  id: "photo-123",
  status: "processing" as string,
  blurDataUrl: null as string | null,
  exifData: null as Record<string, unknown> | null,
  width: null as number | null,
  height: null as number | null,
  updatedAt: null as Date | null,
}));

const mockRepository = vi.hoisted(() => ({
  findById: vi.fn(),
  save: vi.fn(),
}));

const mockLogger = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/infrastructure/storage", () => ({
  getStorageAdapter: vi.fn(() => mockAdapter),
}));

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
  THUMBNAIL_SIZES: [300, 600, 1200, 2400] as const,
}));

vi.mock("@/infrastructure/services/exifService", () => ({
  extractExifData: mockExtractExifData,
}));

vi.mock("@/infrastructure/database/repositories/SQLitePhotoRepository", () => ({
  SQLitePhotoRepository: vi.fn(function () {
    return mockRepository;
  }),
}));

vi.mock("@/infrastructure/logging/logger", () => ({
  logger: mockLogger,
}));

function createMockJob(
  overrides: Partial<Job<ImageJobData>> = {},
): Job<ImageJobData> {
  return {
    id: "job-1",
    data: {
      photoId: "photo-123",
      originalKey: "originals/photo-123/original.jpg",
    },
    attemptsMade: 0,
    updateProgress: vi.fn(),
    ...overrides,
  } as unknown as Job<ImageJobData>;
}

function setupDefaultMocks() {
  mockAdapter.getFile.mockResolvedValue(Buffer.from("fake-image-data"));
  mockAdapter.saveFile.mockResolvedValue(undefined);

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

  mockSharpInstance.rotate.mockReturnValue(mockSharpInstance);
  mockSharpInstance.metadata.mockResolvedValue({ width: 4000, height: 3000 });

  mockGenerateDerivatives.mockResolvedValue([
    "/tmp/photo-worker-photo-123-0/300w.webp",
    "/tmp/photo-worker-photo-123-0/300w.avif",
    "/tmp/photo-worker-photo-123-0/600w.webp",
    "/tmp/photo-worker-photo-123-0/600w.avif",
  ]);
  mockGenerateBlurPlaceholder.mockResolvedValue(
    "data:image/webp;base64,abc123",
  );

  mockExtractExifData.mockResolvedValue({
    make: "Canon",
    model: "EOS R5",
  });

  mockRepository.findById.mockResolvedValue({ ...mockPhoto });
  mockRepository.save.mockResolvedValue(undefined);
}

// Extract processor fn from mocked BullMQ Worker constructor — the only way to test
// the processor without starting a real worker or Redis connection
let processImage: (job: Job<ImageJobData>) => Promise<ImageJobResult>;

beforeEach(async () => {
  vi.clearAllMocks();
  setupDefaultMocks();

  const _mod = await import("../workers/imageProcessor");
  void _mod;
  const { Worker: MockWorker } = await import("bullmq");
  const workerCalls = vi.mocked(MockWorker).mock.calls;
  if (workerCalls.length > 0) {
    processImage = workerCalls[
      workerCalls.length - 1
    ][1] as typeof processImage;
  }
});

describe("imageProcessor worker", () => {
  describe("temp directory creation", () => {
    it("should create unique temp dir with photoId and attemptsMade", async () => {
      const job = createMockJob({ attemptsMade: 0 });
      await processImage(job);

      expect(mockFs.mkdir).toHaveBeenCalledWith(
        "/tmp/photo-worker-photo-123-0",
        { recursive: true },
      );
    });

    it("should use different temp dir for retry attempts", async () => {
      const job = createMockJob({ attemptsMade: 2 });
      await processImage(job);

      expect(mockFs.mkdir).toHaveBeenCalledWith(
        "/tmp/photo-worker-photo-123-2",
        { recursive: true },
      );
    });
  });

  describe("download from storage adapter", () => {
    it("should download original via adapter.getFile(originalKey)", async () => {
      const job = createMockJob();
      await processImage(job);

      expect(mockAdapter.getFile).toHaveBeenCalledWith(
        "originals/photo-123/original.jpg",
      );
    });

    it("should write downloaded buffer to temp path", async () => {
      const originalBuffer = Buffer.from("real-image-bytes");
      mockAdapter.getFile.mockResolvedValue(originalBuffer);

      const job = createMockJob();
      await processImage(job);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        "/tmp/photo-worker-photo-123-0/original.jpg",
        originalBuffer,
      );
    });

    it("should preserve original file extension from key", async () => {
      const job = createMockJob({
        data: {
          photoId: "photo-123",
          originalKey: "originals/photo-123/original.png",
        },
      });
      await processImage(job);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        "/tmp/photo-worker-photo-123-0/original.png",
        expect.any(Buffer),
      );
    });
  });

  describe("Sharp processing with temp paths", () => {
    it("should call generateDerivatives with temp original and temp output dir", async () => {
      const job = createMockJob();
      await processImage(job);

      expect(mockGenerateDerivatives).toHaveBeenCalledWith(
        "/tmp/photo-worker-photo-123-0/original.jpg",
        "/tmp/photo-worker-photo-123-0",
      );
    });

    it("should call sharp().rotate().metadata() with temp original path", async () => {
      const job = createMockJob();
      await processImage(job);

      expect(mockSharp).toHaveBeenCalledWith(
        "/tmp/photo-worker-photo-123-0/original.jpg",
      );
      expect(mockSharpInstance.rotate).toHaveBeenCalled();
      expect(mockSharpInstance.metadata).toHaveBeenCalled();
    });

    it("should extract EXIF from temp original path", async () => {
      const job = createMockJob();
      await processImage(job);

      expect(mockExtractExifData).toHaveBeenCalledWith(
        "/tmp/photo-worker-photo-123-0/original.jpg",
      );
    });

    it("should generate blur placeholder from temp original path", async () => {
      const job = createMockJob();
      await processImage(job);

      expect(mockGenerateBlurPlaceholder).toHaveBeenCalledWith(
        "/tmp/photo-worker-photo-123-0/original.jpg",
      );
    });
  });

  describe("upload derivatives to storage", () => {
    it("should read each derivative file and upload via adapter.saveFile", async () => {
      mockFs.readdir.mockResolvedValue([
        { name: "300w.webp", isFile: () => true, isDirectory: () => false },
        { name: "300w.avif", isFile: () => true, isDirectory: () => false },
      ]);

      const job = createMockJob();
      await processImage(job);

      expect(mockFs.readFile).toHaveBeenCalledWith(
        "/tmp/photo-worker-photo-123-0/300w.webp",
      );
      expect(mockFs.readFile).toHaveBeenCalledWith(
        "/tmp/photo-worker-photo-123-0/300w.avif",
      );

      expect(mockAdapter.saveFile).toHaveBeenCalledWith(
        "processed/photo-123/300w.webp",
        expect.any(Buffer),
        "image/webp",
      );
      expect(mockAdapter.saveFile).toHaveBeenCalledWith(
        "processed/photo-123/300w.avif",
        expect.any(Buffer),
        "image/avif",
      );
    });

    it("should set correct content-type for webp files", async () => {
      mockFs.readdir.mockResolvedValue([
        { name: "1200w.webp", isFile: () => true, isDirectory: () => false },
      ]);

      const job = createMockJob();
      await processImage(job);

      expect(mockAdapter.saveFile).toHaveBeenCalledWith(
        "processed/photo-123/1200w.webp",
        expect.any(Buffer),
        "image/webp",
      );
    });

    it("should set correct content-type for avif files", async () => {
      mockFs.readdir.mockResolvedValue([
        { name: "2400w.avif", isFile: () => true, isDirectory: () => false },
      ]);

      const job = createMockJob();
      await processImage(job);

      expect(mockAdapter.saveFile).toHaveBeenCalledWith(
        "processed/photo-123/2400w.avif",
        expect.any(Buffer),
        "image/avif",
      );
    });

    it("should skip non-file entries when uploading derivatives", async () => {
      mockFs.readdir.mockResolvedValue([
        { name: "300w.webp", isFile: () => true, isDirectory: () => false },
        { name: "subdir", isFile: () => false, isDirectory: () => true },
      ]);

      const job = createMockJob();
      await processImage(job);

      expect(mockAdapter.saveFile).toHaveBeenCalledTimes(1);
    });

    it("should skip the original file when uploading derivatives", async () => {
      mockFs.readdir.mockResolvedValue([
        { name: "original.jpg", isFile: () => true, isDirectory: () => false },
        { name: "300w.webp", isFile: () => true, isDirectory: () => false },
      ]);

      const job = createMockJob();
      await processImage(job);

      expect(mockAdapter.saveFile).toHaveBeenCalledTimes(1);
      expect(mockAdapter.saveFile).toHaveBeenCalledWith(
        "processed/photo-123/300w.webp",
        expect.any(Buffer),
        "image/webp",
      );
    });
  });

  describe("progress reporting (preserved)", () => {
    it("should report progress at 10%, 80%, 90%, 100%", async () => {
      const job = createMockJob();
      await processImage(job);

      const calls = vi.mocked(job.updateProgress).mock.calls.map((c) => c[0]);
      expect(calls).toEqual([10, 80, 90, 100]);
    });
  });

  describe("DB update logic (preserved)", () => {
    it("should update photo to ready status with all metadata", async () => {
      const job = createMockJob();
      await processImage(job);

      expect(mockRepository.findById).toHaveBeenCalledWith("photo-123");
      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "ready",
          blurDataUrl: "data:image/webp;base64,abc123",
          exifData: { make: "Canon", model: "EOS R5" },
          width: 4000,
          height: 3000,
        }),
      );
    });

    it("should log error if photo not found in DB", async () => {
      mockRepository.findById.mockResolvedValue(null);

      const job = createMockJob();
      await processImage(job);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("Photo not found"),
        expect.objectContaining({ photoId: "photo-123" }),
      );
      expect(mockRepository.save).not.toHaveBeenCalled();
    });
  });

  describe("return value", () => {
    it("should return correct result structure", async () => {
      const job = createMockJob();
      const result = await processImage(job);

      expect(result).toEqual({
        photoId: "photo-123",
        derivatives: expect.any(Array),
        blurDataUrl: "data:image/webp;base64,abc123",
        exifData: { make: "Canon", model: "EOS R5" },
        width: 4000,
        height: 3000,
      });
    });
  });

  describe("temp directory cleanup", () => {
    it("should clean up temp directory after successful processing", async () => {
      const job = createMockJob();
      await processImage(job);

      expect(mockFs.rm).toHaveBeenCalledWith("/tmp/photo-worker-photo-123-0", {
        recursive: true,
        force: true,
      });
    });

    it("should clean up temp directory even when processing fails", async () => {
      mockGenerateDerivatives.mockRejectedValue(new Error("Sharp crash"));

      const job = createMockJob();
      await expect(processImage(job)).rejects.toThrow("Sharp crash");

      expect(mockFs.rm).toHaveBeenCalledWith("/tmp/photo-worker-photo-123-0", {
        recursive: true,
        force: true,
      });
    });

    it("should clean up temp directory even when upload fails", async () => {
      mockAdapter.saveFile.mockRejectedValue(new Error("S3 upload failed"));

      const job = createMockJob();
      await expect(processImage(job)).rejects.toThrow("S3 upload failed");

      expect(mockFs.rm).toHaveBeenCalledWith("/tmp/photo-worker-photo-123-0", {
        recursive: true,
        force: true,
      });
    });

    it("should clean up temp directory even when download fails", async () => {
      mockAdapter.getFile.mockRejectedValue(new Error("S3 download failed"));

      const job = createMockJob();
      await expect(processImage(job)).rejects.toThrow("S3 download failed");

      expect(mockFs.rm).toHaveBeenCalledWith("/tmp/photo-worker-photo-123-0", {
        recursive: true,
        force: true,
      });
    });

    it("should not throw if temp cleanup itself fails", async () => {
      mockFs.rm.mockRejectedValue(new Error("EPERM"));

      const job = createMockJob();
      const result = await processImage(job);
      expect(result.photoId).toBe("photo-123");
    });
  });

  describe("derivative S3 keys", () => {
    it("should construct S3 keys as processed/{photoId}/{filename}", async () => {
      mockFs.readdir.mockResolvedValue([
        { name: "1200w.webp", isFile: () => true, isDirectory: () => false },
      ]);

      const job = createMockJob({
        data: {
          photoId: "abc-def-456",
          originalKey: "originals/abc-def-456/original.jpg",
        },
      });
      await processImage(job);

      expect(mockAdapter.saveFile).toHaveBeenCalledWith(
        "processed/abc-def-456/1200w.webp",
        expect.any(Buffer),
        "image/webp",
      );
    });
  });
});
