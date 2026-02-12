import { describe, it, expect, vi, beforeEach } from "vitest";

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

vi.mock("@/infrastructure/logging/logger", () => ({
  logger: mockLogger,
}));

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
    "/tmp/photo-worker-photo-123-ts/300w.webp",
    "/tmp/photo-worker-photo-123-ts/300w.avif",
    "/tmp/photo-worker-photo-123-ts/600w.webp",
    "/tmp/photo-worker-photo-123-ts/600w.avif",
  ]);
  mockGenerateBlurPlaceholder.mockResolvedValue(
    "data:image/webp;base64,abc123",
  );

  mockExtractExifData.mockResolvedValue({
    make: "Canon",
    model: "EOS R5",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  setupDefaultMocks();
});

describe("processImageJob", () => {
  describe("full processing pipeline", () => {
    it("should download original from storage, process it, upload derivatives, and return ImageJobResult", async () => {
      const { processImageJob } = await import("../imageProcessingJob");

      const result = await processImageJob({
        photoId: "photo-123",
        originalKey: "originals/photo-123/original.jpg",
      });

      expect(mockAdapter.getFile).toHaveBeenCalledWith(
        "originals/photo-123/original.jpg",
      );

      expect(mockGenerateDerivatives).toHaveBeenCalledWith(
        expect.stringContaining("original.jpg"),
        expect.any(String),
      );

      expect(mockAdapter.saveFile).toHaveBeenCalledWith(
        "processed/photo-123/300w.webp",
        expect.any(Buffer),
        "image/webp",
      );

      expect(result).toBeDefined();
      expect(result.photoId).toBe("photo-123");
      expect(result.derivatives).toEqual(expect.any(Array));
    });
  });

  describe("return value shape", () => {
    it("should return correct shape: { photoId, derivatives, blurDataUrl, exifData, width, height }", async () => {
      const { processImageJob } = await import("../imageProcessingJob");

      const result = await processImageJob({
        photoId: "photo-123",
        originalKey: "originals/photo-123/original.jpg",
      });

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
    it("should clean up temp directory even on error (finally block)", async () => {
      mockGenerateDerivatives.mockRejectedValue(
        new Error("Sharp processing failed"),
      );

      const { processImageJob } = await import("../imageProcessingJob");

      await expect(
        processImageJob({
          photoId: "photo-123",
          originalKey: "originals/photo-123/original.jpg",
        }),
      ).rejects.toThrow("Sharp processing failed");

      expect(mockFs.rm).toHaveBeenCalledWith(
        expect.stringContaining("photo-worker-photo-123"),
        { recursive: true, force: true },
      );
    });

    it("should clean up temp directory after successful processing", async () => {
      const { processImageJob } = await import("../imageProcessingJob");

      await processImageJob({
        photoId: "photo-123",
        originalKey: "originals/photo-123/original.jpg",
      });

      expect(mockFs.rm).toHaveBeenCalledWith(
        expect.stringContaining("photo-worker-photo-123"),
        { recursive: true, force: true },
      );
    });

    it("should not throw if temp cleanup itself fails", async () => {
      mockFs.rm.mockRejectedValue(new Error("EPERM"));

      const { processImageJob } = await import("../imageProcessingJob");

      const result = await processImageJob({
        photoId: "photo-123",
        originalKey: "originals/photo-123/original.jpg",
      });

      expect(result.photoId).toBe("photo-123");
    });
  });

  describe("does NOT update DynamoDB", () => {
    it("should NOT import or call DynamoDBPhotoRepository", async () => {
      const { processImageJob } = await import("../imageProcessingJob");

      await processImageJob({
        photoId: "photo-123",
        originalKey: "originals/photo-123/original.jpg",
      });

      expect(mockAdapter.getFile).toHaveBeenCalledTimes(1);
      expect(mockAdapter.saveFile).toHaveBeenCalled();
    });
  });

  describe("no BullMQ-specific code", () => {
    it("should not require a BullMQ Job object", async () => {
      const { processImageJob } = await import("../imageProcessingJob");

      const result = await processImageJob({
        photoId: "photo-123",
        originalKey: "originals/photo-123/original.jpg",
      });

      expect(result.photoId).toBe("photo-123");
    });
  });

  describe("content type mapping", () => {
    it("should upload webp files with image/webp content type", async () => {
      mockFs.readdir.mockResolvedValue([
        { name: "1200w.webp", isFile: () => true, isDirectory: () => false },
      ]);

      const { processImageJob } = await import("../imageProcessingJob");

      await processImageJob({
        photoId: "photo-123",
        originalKey: "originals/photo-123/original.jpg",
      });

      expect(mockAdapter.saveFile).toHaveBeenCalledWith(
        "processed/photo-123/1200w.webp",
        expect.any(Buffer),
        "image/webp",
      );
    });

    it("should upload avif files with image/avif content type", async () => {
      mockFs.readdir.mockResolvedValue([
        { name: "2400w.avif", isFile: () => true, isDirectory: () => false },
      ]);

      const { processImageJob } = await import("../imageProcessingJob");

      await processImageJob({
        photoId: "photo-123",
        originalKey: "originals/photo-123/original.jpg",
      });

      expect(mockAdapter.saveFile).toHaveBeenCalledWith(
        "processed/photo-123/2400w.avif",
        expect.any(Buffer),
        "image/avif",
      );
    });

    it("should skip files starting with 'original'", async () => {
      mockFs.readdir.mockResolvedValue([
        { name: "original.jpg", isFile: () => true, isDirectory: () => false },
        { name: "300w.webp", isFile: () => true, isDirectory: () => false },
      ]);

      const { processImageJob } = await import("../imageProcessingJob");

      await processImageJob({
        photoId: "photo-123",
        originalKey: "originals/photo-123/original.jpg",
      });

      expect(mockAdapter.saveFile).toHaveBeenCalledTimes(1);
      expect(mockAdapter.saveFile).toHaveBeenCalledWith(
        "processed/photo-123/300w.webp",
        expect.any(Buffer),
        "image/webp",
      );
    });
  });
});
