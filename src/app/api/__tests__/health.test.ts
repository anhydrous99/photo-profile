import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "../health/route";

vi.mock("@/infrastructure/database/client", () => ({
  db: {
    run: vi.fn(),
  },
}));

vi.mock("@/infrastructure/storage", () => ({
  getStorageAdapter: vi.fn(),
}));

vi.mock("@/infrastructure/config/env", () => ({
  env: {
    STORAGE_BACKEND: "filesystem",
  },
}));

import { db } from "@/infrastructure/database/client";
import { getStorageAdapter } from "@/infrastructure/storage";

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Filesystem mode", () => {
    it("should return healthy when database and filesystem storage are accessible", async () => {
      const mockAdapter = {
        listFiles: vi.fn().mockResolvedValue([]),
      };
      vi.mocked(getStorageAdapter).mockReturnValue(mockAdapter as any);
      vi.mocked(db.run).mockReturnValue({ changes: 0 } as any);

      // Act
      const response = await GET();
      const data = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(data.status).toBe("healthy");
      expect(data.checks.database.status).toBe("ok");
      expect(data.checks.storage.status).toBe("ok");
      expect(mockAdapter.listFiles).toHaveBeenCalledWith("health-check/");
    });

    it("should return unhealthy when database check fails", async () => {
      const mockAdapter = {
        listFiles: vi.fn().mockResolvedValue([]),
      };
      vi.mocked(getStorageAdapter).mockReturnValue(mockAdapter as any);
      const dbError = new Error("Database connection failed");
      vi.mocked(db.run).mockImplementation(() => {
        throw dbError;
      });

      // Act
      const response = await GET();
      const data = await response.json();

      // Assert
      expect(response.status).toBe(503);
      expect(data.status).toBe("unhealthy");
      expect(data.checks.database.status).toBe("error");
      expect(data.checks.database.error).toBe("Database connection failed");
      expect(data.checks.storage.status).toBe("ok");
    });

    it("should return unhealthy when filesystem storage check fails", async () => {
      const storageError = new Error("Permission denied");
      const mockAdapter = {
        listFiles: vi.fn().mockRejectedValue(storageError),
      };
      vi.mocked(getStorageAdapter).mockReturnValue(mockAdapter as any);
      vi.mocked(db.run).mockReturnValue({ changes: 0 } as any);

      // Act
      const response = await GET();
      const data = await response.json();

      // Assert
      expect(response.status).toBe(503);
      expect(data.status).toBe("unhealthy");
      expect(data.checks.database.status).toBe("ok");
      expect(data.checks.storage.status).toBe("error");
      expect(data.checks.storage.error).toBe("Permission denied");
    });

    it("should return unhealthy when both database and storage fail", async () => {
      const dbError = new Error("DB error");
      const storageError = new Error("Storage error");
      const mockAdapter = {
        listFiles: vi.fn().mockRejectedValue(storageError),
      };
      vi.mocked(getStorageAdapter).mockReturnValue(mockAdapter as any);
      vi.mocked(db.run).mockImplementation(() => {
        throw dbError;
      });

      // Act
      const response = await GET();
      const data = await response.json();

      // Assert
      expect(response.status).toBe(503);
      expect(data.status).toBe("unhealthy");
      expect(data.checks.database.status).toBe("error");
      expect(data.checks.storage.status).toBe("error");
    });
  });

  describe("S3 mode", () => {
    beforeEach(() => {
      // Override env for S3 tests
      vi.resetModules();
    });

    it("should return healthy when database and S3 storage are accessible", async () => {
      const mockAdapter = {
        listFiles: vi.fn().mockResolvedValue([]),
      };
      vi.mocked(getStorageAdapter).mockReturnValue(mockAdapter as any);
      vi.mocked(db.run).mockReturnValue({ changes: 0 } as any);

      // Act
      const response = await GET();
      const data = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(data.status).toBe("healthy");
      expect(data.checks.database.status).toBe("ok");
      expect(data.checks.storage.status).toBe("ok");
      // Verify S3 adapter is checked via listFiles (same interface)
      expect(mockAdapter.listFiles).toHaveBeenCalledWith("health-check/");
    });

    it("should return unhealthy when S3 storage check fails", async () => {
      const s3Error = new Error("NoSuchBucket");
      const mockAdapter = {
        listFiles: vi.fn().mockRejectedValue(s3Error),
      };
      vi.mocked(getStorageAdapter).mockReturnValue(mockAdapter as any);
      vi.mocked(db.run).mockReturnValue({ changes: 0 } as any);

      // Act
      const response = await GET();
      const data = await response.json();

      // Assert
      expect(response.status).toBe(503);
      expect(data.status).toBe("unhealthy");
      expect(data.checks.database.status).toBe("ok");
      expect(data.checks.storage.status).toBe("error");
      expect(data.checks.storage.error).toBe("NoSuchBucket");
    });
  });

  describe("Response format", () => {
    it("should always include status and checks in response", async () => {
      const mockAdapter = {
        listFiles: vi.fn().mockResolvedValue([]),
      };
      vi.mocked(getStorageAdapter).mockReturnValue(mockAdapter as any);
      vi.mocked(db.run).mockReturnValue({ changes: 0 } as any);

      // Act
      const response = await GET();
      const data = await response.json();

      // Assert
      expect(data).toHaveProperty("status");
      expect(data).toHaveProperty("checks");
      expect(data.checks).toHaveProperty("database");
      expect(data.checks).toHaveProperty("storage");
      expect(["healthy", "unhealthy"]).toContain(data.status);
    });

    it("should return 200 when healthy", async () => {
      const mockAdapter = {
        listFiles: vi.fn().mockResolvedValue([]),
      };
      vi.mocked(getStorageAdapter).mockReturnValue(mockAdapter as any);
      vi.mocked(db.run).mockReturnValue({ changes: 0 } as any);

      // Act
      const response = await GET();

      // Assert
      expect(response.status).toBe(200);
    });

    it("should return 503 when unhealthy", async () => {
      const mockAdapter = {
        listFiles: vi.fn().mockRejectedValue(new Error("Storage error")),
      };
      vi.mocked(getStorageAdapter).mockReturnValue(mockAdapter as any);
      vi.mocked(db.run).mockReturnValue({ changes: 0 } as any);

      // Act
      const response = await GET();

      // Assert
      expect(response.status).toBe(503);
    });
  });

  describe("Error handling", () => {
    it("should handle unknown database error gracefully", async () => {
      const mockAdapter = {
        listFiles: vi.fn().mockResolvedValue([]),
      };
      vi.mocked(getStorageAdapter).mockReturnValue(mockAdapter as any);
      vi.mocked(db.run).mockImplementation(() => {
        throw "not an error object";
      });

      // Act
      const response = await GET();
      const data = await response.json();

      // Assert
      expect(data.checks.database.status).toBe("error");
      expect(data.checks.database.error).toBe("Unknown database error");
    });

    it("should handle unknown storage error gracefully", async () => {
      const mockAdapter = {
        listFiles: vi.fn().mockRejectedValue("not an error object"),
      };
      vi.mocked(getStorageAdapter).mockReturnValue(mockAdapter as any);
      vi.mocked(db.run).mockReturnValue({ changes: 0 } as any);

      // Act
      const response = await GET();
      const data = await response.json();

      // Assert
      expect(data.checks.storage.status).toBe("error");
      expect(data.checks.storage.error).toBe("Unknown storage error");
    });
  });
});
