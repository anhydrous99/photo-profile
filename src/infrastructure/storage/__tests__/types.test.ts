import { describe, it, expect } from "vitest";
import type { StorageAdapter } from "../types";

describe("StorageAdapter interface", () => {
  it("should have all required methods with correct signatures", () => {
    // This is a compile-time type check
    // If StorageAdapter doesn't have the right shape, TypeScript will error
    const _: StorageAdapter = {
      saveFile: async (key: string, data: Buffer, contentType: string) => {
        void key;
        void data;
        void contentType;
      },
      getFile: async (key: string) => {
        void key;
        return Buffer.alloc(0);
      },
      getFileStream: async (key: string) => {
        void key;
        return new ReadableStream();
      },
      deleteFiles: async (prefix: string) => {
        void prefix;
      },
      fileExists: async (key: string) => {
        void key;
        return false;
      },
      listFiles: async (prefix: string) => {
        void prefix;
        return [];
      },
    };

    // Runtime assertion to ensure the object has all methods
    expect(_).toBeDefined();
    expect(typeof _.saveFile).toBe("function");
    expect(typeof _.getFile).toBe("function");
    expect(typeof _.getFileStream).toBe("function");
    expect(typeof _.deleteFiles).toBe("function");
    expect(typeof _.fileExists).toBe("function");
    expect(typeof _.listFiles).toBe("function");
  });

  it("should enforce method return types at compile time", () => {
    // This test verifies that implementations must return Promises
    // TypeScript will error if return types don't match
    const adapter: StorageAdapter = {
      saveFile: async () => undefined,
      getFile: async () => Buffer.alloc(0),
      getFileStream: async () => new ReadableStream(),
      deleteFiles: async () => undefined,
      fileExists: async () => true,
      listFiles: async () => ["file1", "file2"],
    };

    expect(
      adapter.saveFile("key", Buffer.alloc(0), "text/plain"),
    ).toBeInstanceOf(Promise);
    expect(adapter.getFile("key")).toBeInstanceOf(Promise);
    expect(adapter.getFileStream("key")).toBeInstanceOf(Promise);
    expect(adapter.deleteFiles("prefix")).toBeInstanceOf(Promise);
    expect(adapter.fileExists("key")).toBeInstanceOf(Promise);
    expect(adapter.listFiles("prefix")).toBeInstanceOf(Promise);
  });
});
