import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readFile, readdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { FilesystemStorageAdapter } from "../filesystemStorageAdapter";
import type { StorageAdapter } from "../types";

let testDir: string;

vi.mock("@/infrastructure/config/env", () => ({
  env: {
    get STORAGE_PATH() {
      return testDir;
    },
  },
}));

describe("FilesystemStorageAdapter", () => {
  let adapter: FilesystemStorageAdapter;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "fs-adapter-test-"));
    adapter = new FilesystemStorageAdapter();
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("should implement StorageAdapter interface", () => {
    const _: StorageAdapter = adapter;
    expect(_).toBeDefined();
    expect(typeof _.saveFile).toBe("function");
    expect(typeof _.getFile).toBe("function");
    expect(typeof _.getFileStream).toBe("function");
    expect(typeof _.deleteFiles).toBe("function");
    expect(typeof _.fileExists).toBe("function");
    expect(typeof _.listFiles).toBe("function");
  });

  describe("saveFile", () => {
    it("should save a file at the given key path", async () => {
      const key = "originals/550e8400-e29b-41d4-a716-446655440000/original.jpg";
      const data = Buffer.from("fake image data");

      await adapter.saveFile(key, data, "image/jpeg");

      const savedData = await readFile(join(testDir, key));
      expect(savedData).toEqual(data);
    });

    it("should create parent directories recursively", async () => {
      const key =
        "originals/550e8400-e29b-41d4-a716-446655440000/deep/nested/file.jpg";
      const data = Buffer.from("nested data");

      await adapter.saveFile(key, data, "image/jpeg");

      const savedData = await readFile(join(testDir, key));
      expect(savedData).toEqual(data);
    });

    it("should overwrite existing file", async () => {
      const key = "originals/550e8400-e29b-41d4-a716-446655440000/original.jpg";
      const data1 = Buffer.from("first version");
      const data2 = Buffer.from("second version");

      await adapter.saveFile(key, data1, "image/jpeg");
      await adapter.saveFile(key, data2, "image/jpeg");

      const savedData = await readFile(join(testDir, key));
      expect(savedData).toEqual(data2);
    });
  });

  describe("getFile", () => {
    it("should read and return file contents as Buffer", async () => {
      const key = "originals/550e8400-e29b-41d4-a716-446655440000/original.jpg";
      const data = Buffer.from("test data");
      const filePath = join(testDir, key);
      await mkdir(
        join(testDir, "originals/550e8400-e29b-41d4-a716-446655440000"),
        {
          recursive: true,
        },
      );
      await writeFile(filePath, data);

      const result = await adapter.getFile(key);
      expect(result).toEqual(data);
    });

    it("should throw if file does not exist", async () => {
      const key = "originals/nonexistent/original.jpg";
      await expect(adapter.getFile(key)).rejects.toThrow();
    });
  });

  describe("getFileStream", () => {
    it("should return a ReadableStream for an existing file", async () => {
      const key = "originals/550e8400-e29b-41d4-a716-446655440000/original.jpg";
      const data = Buffer.from("stream test data");
      const filePath = join(testDir, key);
      await mkdir(
        join(testDir, "originals/550e8400-e29b-41d4-a716-446655440000"),
        {
          recursive: true,
        },
      );
      await writeFile(filePath, data);

      const stream = await adapter.getFileStream(key);
      expect(stream).toBeInstanceOf(ReadableStream);

      const reader = stream.getReader();
      const chunks: Uint8Array[] = [];
      let done = false;
      while (!done) {
        const result = await reader.read();
        if (result.done) {
          done = true;
        } else {
          chunks.push(result.value);
        }
      }
      const collected = Buffer.concat(chunks);
      expect(collected).toEqual(data);
    });

    it("should throw if file does not exist", async () => {
      const key = "originals/nonexistent/original.jpg";
      await expect(adapter.getFileStream(key)).rejects.toThrow();
    });
  });

  describe("deleteFiles", () => {
    it("should recursively delete all files under a prefix", async () => {
      const photoId = "550e8400-e29b-41d4-a716-446655440000";
      const prefix = `processed/${photoId}`;
      const dir = join(testDir, prefix);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, "300w.webp"), "small");
      await writeFile(join(dir, "600w.webp"), "medium");
      await writeFile(join(dir, "1200w.webp"), "large");

      await adapter.deleteFiles(prefix);

      await expect(readdir(dir)).rejects.toThrow();
    });

    it("should not throw if prefix directory does not exist", async () => {
      const prefix = "nonexistent/path";
      await expect(adapter.deleteFiles(prefix)).resolves.toBeUndefined();
    });
  });

  describe("fileExists", () => {
    it("should return true for existing file", async () => {
      const key = "originals/550e8400-e29b-41d4-a716-446655440000/original.jpg";
      const filePath = join(testDir, key);
      await mkdir(
        join(testDir, "originals/550e8400-e29b-41d4-a716-446655440000"),
        {
          recursive: true,
        },
      );
      await writeFile(filePath, "exists");

      const result = await adapter.fileExists(key);
      expect(result).toBe(true);
    });

    it("should return false for nonexistent file", async () => {
      const result = await adapter.fileExists(
        "originals/550e8400-e29b-41d4-a716-446655440001/original.jpg",
      );
      expect(result).toBe(false);
    });
  });

  describe("listFiles", () => {
    it("should list all files under a prefix directory", async () => {
      const photoId = "550e8400-e29b-41d4-a716-446655440000";
      const prefix = `processed/${photoId}`;
      const dir = join(testDir, prefix);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, "300w.webp"), "small");
      await writeFile(join(dir, "600w.webp"), "medium");
      await writeFile(join(dir, "1200w.avif"), "large");

      const files = await adapter.listFiles(prefix);
      expect(files).toHaveLength(3);
      expect(files.sort()).toEqual(
        [
          `${prefix}/1200w.avif`,
          `${prefix}/300w.webp`,
          `${prefix}/600w.webp`,
        ].sort(),
      );
    });

    it("should return empty array if directory does not exist", async () => {
      const result = await adapter.listFiles("nonexistent/path");
      expect(result).toEqual([]);
    });

    it("should return keys relative to storage root (not absolute paths)", async () => {
      const prefix = "originals/550e8400-e29b-41d4-a716-446655440000";
      const dir = join(testDir, prefix);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, "original.jpg"), "data");

      const files = await adapter.listFiles(prefix);
      expect(files).toHaveLength(1);
      expect(files[0]).not.toContain(testDir);
      expect(files[0]).toBe(`${prefix}/original.jpg`);
    });
  });

  describe("UUID validation (path traversal prevention)", () => {
    it("should reject invalid UUID in originals/ path for saveFile", async () => {
      const key = "originals/../../../etc/passwd/original.jpg";
      await expect(
        adapter.saveFile(key, Buffer.from("hack"), "text/plain"),
      ).rejects.toThrow("Invalid photoId format");
    });

    it("should reject invalid UUID in processed/ path for saveFile", async () => {
      const key = "processed/../../../etc/passwd/300w.webp";
      await expect(
        adapter.saveFile(key, Buffer.from("hack"), "text/plain"),
      ).rejects.toThrow("Invalid photoId format");
    });

    it("should reject invalid UUID in originals/ path for getFile", async () => {
      const key = "originals/not-a-uuid/original.jpg";
      await expect(adapter.getFile(key)).rejects.toThrow(
        "Invalid photoId format",
      );
    });

    it("should reject invalid UUID in processed/ path for deleteFiles", async () => {
      const prefix = "processed/not-a-uuid";
      await expect(adapter.deleteFiles(prefix)).rejects.toThrow(
        "Invalid photoId format",
      );
    });

    it("should reject invalid UUID in originals/ path for listFiles", async () => {
      const prefix = "originals/../../etc";
      await expect(adapter.listFiles(prefix)).rejects.toThrow(
        "Invalid photoId format",
      );
    });

    it("should accept valid UUID in photo paths", async () => {
      const key = "originals/550e8400-e29b-41d4-a716-446655440000/original.jpg";
      const data = Buffer.from("valid");
      await adapter.saveFile(key, data, "image/jpeg");
      const result = await adapter.getFile(key);
      expect(result).toEqual(data);
    });

    it("should not validate UUIDs for non-photo paths", async () => {
      const key = "temp/some-file.txt";
      const data = Buffer.from("temp data");
      await adapter.saveFile(key, data, "text/plain");
      const result = await adapter.getFile(key);
      expect(result).toEqual(data);
    });
  });
});
