/// <reference types="vitest/globals" />
/**
 * Tests for GET /api/images/[photoId]/[filename]
 *
 * The image serving route uses StorageAdapter to abstract
 * filesystem vs S3 storage. Tests mock the adapter to verify:
 * - UUID and filename validation
 * - Content serving with correct headers
 * - Content-based ETag generation and 304 Not Modified
 * - Fallback to largest derivative when requested size missing
 * - Error handling (not found, internal errors)
 */

import { describe, it, expect, beforeEach } from "vitest";

// ---- Mock setup (must be before route imports) ----

const mockAdapter = {
  getFile: vi.fn(),
  getFileStream: vi.fn(),
  saveFile: vi.fn(),
  deleteFiles: vi.fn(),
  fileExists: vi.fn(),
  listFiles: vi.fn(),
};

vi.mock("@/infrastructure/storage", () => ({
  getStorageAdapter: vi.fn(() => mockAdapter),
}));

vi.mock("@/infrastructure/logging/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

// ---- Imports (after mocks) ----

import { GET } from "@/app/api/images/[photoId]/[filename]/route";
import { createHash } from "crypto";

// ---- Helpers ----

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

function makeRequest(
  photoId: string,
  filename: string,
  headers?: Record<string, string>,
): Request {
  const url = `http://localhost/api/images/${photoId}/${filename}`;
  return new Request(url, { headers: headers ?? {} });
}

function makeParams(
  photoId: string,
  filename: string,
): { params: Promise<{ photoId: string; filename: string }> } {
  return { params: Promise.resolve({ photoId, filename }) };
}

function generateExpectedETag(buffer: Buffer): string {
  const hash = createHash("md5").update(buffer).digest("hex").slice(0, 16);
  return `"${hash}"`;
}

// ---- Test Suite ----

describe("GET /api/images/[photoId]/[filename]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---- Validation ----

  describe("validation", () => {
    it("returns 400 for invalid UUID", async () => {
      const res = await GET(
        makeRequest("not-a-uuid", "300w.webp"),
        makeParams("not-a-uuid", "300w.webp"),
      );

      expect(res.status).toBe(400);
      expect(await res.text()).toBe("Invalid photo ID format");
      expect(mockAdapter.getFile).not.toHaveBeenCalled();
    });

    it("returns 400 for directory traversal in photoId", async () => {
      const res = await GET(
        makeRequest("../etc/passwd", "300w.webp"),
        makeParams("../etc/passwd", "300w.webp"),
      );

      expect(res.status).toBe(400);
    });

    it("returns 400 for filename with directory traversal", async () => {
      const res = await GET(
        makeRequest(VALID_UUID, "../../../etc/passwd"),
        makeParams(VALID_UUID, "../../../etc/passwd"),
      );

      expect(res.status).toBe(400);
      expect(await res.text()).toBe("Invalid filename or unsupported format");
    });

    it("returns 400 for filename with path separator", async () => {
      const res = await GET(
        makeRequest(VALID_UUID, "subdir/300w.webp"),
        makeParams(VALID_UUID, "subdir/300w.webp"),
      );

      expect(res.status).toBe(400);
      expect(await res.text()).toBe("Invalid filename or unsupported format");
    });

    it("returns 400 for unsupported file extension", async () => {
      const res = await GET(
        makeRequest(VALID_UUID, "300w.png"),
        makeParams(VALID_UUID, "300w.png"),
      );

      expect(res.status).toBe(400);
      expect(await res.text()).toBe("Invalid filename or unsupported format");
    });

    it("returns 400 for filename without extension", async () => {
      const res = await GET(
        makeRequest(VALID_UUID, "300w"),
        makeParams(VALID_UUID, "300w"),
      );

      expect(res.status).toBe(400);
      expect(await res.text()).toBe("Invalid filename or unsupported format");
    });

    it("accepts .webp files", async () => {
      const buf = Buffer.from("webp-image-data");
      mockAdapter.getFile.mockResolvedValue(buf);

      const res = await GET(
        makeRequest(VALID_UUID, "300w.webp"),
        makeParams(VALID_UUID, "300w.webp"),
      );

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("image/webp");
    });

    it("accepts .avif files", async () => {
      const buf = Buffer.from("avif-image-data");
      mockAdapter.getFile.mockResolvedValue(buf);

      const res = await GET(
        makeRequest(VALID_UUID, "1200w.avif"),
        makeParams(VALID_UUID, "1200w.avif"),
      );

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("image/avif");
    });
  });

  // ---- Successful serving ----

  describe("successful image serving", () => {
    it("returns 200 with correct headers for existing image", async () => {
      const buf = Buffer.from("fake-image-bytes");
      mockAdapter.getFile.mockResolvedValue(buf);

      const res = await GET(
        makeRequest(VALID_UUID, "600w.webp"),
        makeParams(VALID_UUID, "600w.webp"),
      );

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("image/webp");
      expect(res.headers.get("Content-Length")).toBe(buf.length.toString());
      expect(res.headers.get("Cache-Control")).toBe(
        "public, max-age=31536000, immutable",
      );
      expect(res.headers.get("ETag")).toBeTruthy();
    });

    it("calls adapter.getFile with correct key", async () => {
      const buf = Buffer.from("image-data");
      mockAdapter.getFile.mockResolvedValue(buf);

      await GET(
        makeRequest(VALID_UUID, "300w.webp"),
        makeParams(VALID_UUID, "300w.webp"),
      );

      expect(mockAdapter.getFile).toHaveBeenCalledWith(
        `processed/${VALID_UUID}/300w.webp`,
      );
    });

    it("returns correct body content", async () => {
      const imageData = Buffer.from("raw-image-content-here");
      mockAdapter.getFile.mockResolvedValue(imageData);

      const res = await GET(
        makeRequest(VALID_UUID, "600w.avif"),
        makeParams(VALID_UUID, "600w.avif"),
      );

      const body = await res.arrayBuffer();
      expect(Buffer.from(body)).toEqual(imageData);
    });
  });

  // ---- ETag and caching ----

  describe("ETag and caching", () => {
    it("generates ETag from content hash", async () => {
      const buf = Buffer.from("deterministic-content");
      mockAdapter.getFile.mockResolvedValue(buf);

      const res = await GET(
        makeRequest(VALID_UUID, "300w.webp"),
        makeParams(VALID_UUID, "300w.webp"),
      );

      const expectedETag = generateExpectedETag(buf);
      expect(res.headers.get("ETag")).toBe(expectedETag);
    });

    it("generates different ETags for different content", async () => {
      const buf1 = Buffer.from("content-version-1");
      const buf2 = Buffer.from("content-version-2");

      mockAdapter.getFile.mockResolvedValue(buf1);
      const res1 = await GET(
        makeRequest(VALID_UUID, "300w.webp"),
        makeParams(VALID_UUID, "300w.webp"),
      );

      mockAdapter.getFile.mockResolvedValue(buf2);
      const res2 = await GET(
        makeRequest(VALID_UUID, "300w.webp"),
        makeParams(VALID_UUID, "300w.webp"),
      );

      expect(res1.headers.get("ETag")).not.toBe(res2.headers.get("ETag"));
    });

    it("returns 304 Not Modified when If-None-Match matches", async () => {
      const buf = Buffer.from("cached-image-data");
      const etag = generateExpectedETag(buf);
      mockAdapter.getFile.mockResolvedValue(buf);

      const res = await GET(
        makeRequest(VALID_UUID, "300w.webp", { "if-none-match": etag }),
        makeParams(VALID_UUID, "300w.webp"),
      );

      expect(res.status).toBe(304);
      expect(res.headers.get("ETag")).toBe(etag);
    });

    it("returns 200 when If-None-Match does not match", async () => {
      const buf = Buffer.from("new-image-data");
      mockAdapter.getFile.mockResolvedValue(buf);

      const res = await GET(
        makeRequest(VALID_UUID, "300w.webp", {
          "if-none-match": '"stale-etag-value"',
        }),
        makeParams(VALID_UUID, "300w.webp"),
      );

      expect(res.status).toBe(200);
    });

    it("includes Cache-Control: public, max-age=31536000, immutable", async () => {
      const buf = Buffer.from("image-data");
      mockAdapter.getFile.mockResolvedValue(buf);

      const res = await GET(
        makeRequest(VALID_UUID, "300w.webp"),
        makeParams(VALID_UUID, "300w.webp"),
      );

      expect(res.headers.get("Cache-Control")).toBe(
        "public, max-age=31536000, immutable",
      );
    });
  });

  // ---- Fallback to largest derivative ----

  describe("fallback to largest derivative", () => {
    it("falls back to largest derivative when requested size not found", async () => {
      const fallbackBuf = Buffer.from("fallback-image");

      // First call fails (requested file not found)
      mockAdapter.getFile.mockRejectedValueOnce(
        new Error(
          "File not found: processed/550e8400-e29b-41d4-a716-446655440000/1200w.webp",
        ),
      );
      // listFiles returns available derivatives
      mockAdapter.listFiles.mockResolvedValue([
        `processed/${VALID_UUID}/300w.webp`,
        `processed/${VALID_UUID}/600w.webp`,
      ]);
      // Second call succeeds with fallback
      mockAdapter.getFile.mockResolvedValueOnce(fallbackBuf);

      const res = await GET(
        makeRequest(VALID_UUID, "1200w.webp"),
        makeParams(VALID_UUID, "1200w.webp"),
      );

      expect(res.status).toBe(200);
      // Should have requested the largest available (600w)
      expect(mockAdapter.getFile).toHaveBeenCalledTimes(2);
      expect(mockAdapter.getFile).toHaveBeenLastCalledWith(
        `processed/${VALID_UUID}/600w.webp`,
      );
    });

    it("only falls back to same format (.webp not .avif)", async () => {
      const fallbackBuf = Buffer.from("fallback-image");

      mockAdapter.getFile.mockRejectedValueOnce(new Error("File not found"));
      // Mix of formats available
      mockAdapter.listFiles.mockResolvedValue([
        `processed/${VALID_UUID}/300w.avif`,
        `processed/${VALID_UUID}/600w.avif`,
        `processed/${VALID_UUID}/300w.webp`,
      ]);
      mockAdapter.getFile.mockResolvedValueOnce(fallbackBuf);

      const res = await GET(
        makeRequest(VALID_UUID, "1200w.webp"),
        makeParams(VALID_UUID, "1200w.webp"),
      );

      expect(res.status).toBe(200);
      // Should only consider .webp files, largest is 300w.webp
      expect(mockAdapter.getFile).toHaveBeenLastCalledWith(
        `processed/${VALID_UUID}/300w.webp`,
      );
    });

    it("returns 404 when no derivatives exist at all", async () => {
      mockAdapter.getFile.mockRejectedValueOnce(new Error("File not found"));
      mockAdapter.listFiles.mockResolvedValue([]);

      const res = await GET(
        makeRequest(VALID_UUID, "300w.webp"),
        makeParams(VALID_UUID, "300w.webp"),
      );

      expect(res.status).toBe(404);
      expect(await res.text()).toBe("Image not found");
    });

    it("returns 404 when fallback file also fails", async () => {
      mockAdapter.getFile
        .mockRejectedValueOnce(new Error("File not found"))
        .mockRejectedValueOnce(new Error("File not found"));

      mockAdapter.listFiles.mockResolvedValue([
        `processed/${VALID_UUID}/300w.webp`,
      ]);

      const res = await GET(
        makeRequest(VALID_UUID, "600w.webp"),
        makeParams(VALID_UUID, "600w.webp"),
      );

      expect(res.status).toBe(404);
      expect(await res.text()).toBe("Image not found");
    });

    it("returns 404 when listFiles fails", async () => {
      mockAdapter.getFile.mockRejectedValueOnce(new Error("File not found"));
      mockAdapter.listFiles.mockRejectedValue(new Error("S3 error"));

      const res = await GET(
        makeRequest(VALID_UUID, "300w.webp"),
        makeParams(VALID_UUID, "300w.webp"),
      );

      expect(res.status).toBe(404);
    });

    it("selects the largest width derivative of matching extension", async () => {
      const fallbackBuf = Buffer.from("2400w-image");

      mockAdapter.getFile.mockRejectedValueOnce(new Error("File not found"));
      mockAdapter.listFiles.mockResolvedValue([
        `processed/${VALID_UUID}/300w.avif`,
        `processed/${VALID_UUID}/600w.avif`,
        `processed/${VALID_UUID}/1200w.avif`,
        `processed/${VALID_UUID}/2400w.avif`,
      ]);
      mockAdapter.getFile.mockResolvedValueOnce(fallbackBuf);

      const res = await GET(
        makeRequest(VALID_UUID, "9999w.avif"),
        makeParams(VALID_UUID, "9999w.avif"),
      );

      expect(res.status).toBe(200);
      expect(mockAdapter.getFile).toHaveBeenLastCalledWith(
        `processed/${VALID_UUID}/2400w.avif`,
      );
    });
  });

  // ---- Error handling ----

  describe("error handling", () => {
    it("returns 500 for non-file-not-found errors", async () => {
      mockAdapter.getFile.mockRejectedValue(new Error("Connection timeout"));
      // Ensure this is NOT a "File not found" error, so no fallback attempted
      // The route should catch this as a generic error

      const res = await GET(
        makeRequest(VALID_UUID, "300w.webp"),
        makeParams(VALID_UUID, "300w.webp"),
      );

      expect(res.status).toBe(500);
      expect(await res.text()).toBe("Internal server error");
    });

    it("returns 404 when adapter.getFile throws file-not-found", async () => {
      mockAdapter.getFile.mockRejectedValue(
        new Error("File not found: processed/test/300w.webp"),
      );
      mockAdapter.listFiles.mockResolvedValue([]);

      const res = await GET(
        makeRequest(VALID_UUID, "300w.webp"),
        makeParams(VALID_UUID, "300w.webp"),
      );

      expect(res.status).toBe(404);
    });
  });
});
