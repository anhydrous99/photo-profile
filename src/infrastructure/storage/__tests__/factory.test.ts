/// <reference types="vitest/globals" />

import { describe, it, expect, beforeEach } from "vitest";

// vi.mock factories are hoisted — mockEnv must use vi.hoisted() for shared ref
const mockEnv = vi.hoisted(() => ({
  STORAGE_BACKEND: "filesystem" as "filesystem" | "s3",
  STORAGE_PATH: "/tmp/test-storage",
  AWS_REGION: "us-east-1",
  AWS_S3_BUCKET: "test-bucket",
  AWS_CLOUDFRONT_DOMAIN: "d12345.cloudfront.net",
}));

vi.mock("@/infrastructure/config/env", () => ({
  env: mockEnv,
}));

// Mock adapters with marker field to verify correct adapter is returned
vi.mock("@/infrastructure/storage/filesystemStorageAdapter", () => ({
  FilesystemStorageAdapter: class MockFilesystemStorageAdapter {
    _type = "filesystem";
  },
}));

vi.mock("@/infrastructure/storage/s3StorageAdapter", () => ({
  S3StorageAdapter: class MockS3StorageAdapter {
    _type = "s3";
  },
}));

import {
  getStorageAdapter,
  resetStorageAdapter,
  getImageUrl,
} from "../factory";

describe("getStorageAdapter()", () => {
  beforeEach(() => {
    resetStorageAdapter();
    mockEnv.STORAGE_BACKEND = "filesystem";
  });

  it("returns FilesystemStorageAdapter when STORAGE_BACKEND=filesystem", () => {
    mockEnv.STORAGE_BACKEND = "filesystem";
    const adapter = getStorageAdapter();
    expect(adapter).toHaveProperty("_type", "filesystem");
  });

  it("returns S3StorageAdapter when STORAGE_BACKEND=s3", () => {
    mockEnv.STORAGE_BACKEND = "s3";
    const adapter = getStorageAdapter();
    expect(adapter).toHaveProperty("_type", "s3");
  });

  it("returns the same instance on repeated calls (singleton)", () => {
    const first = getStorageAdapter();
    const second = getStorageAdapter();
    expect(first).toBe(second);
  });

  it("creates new instance after resetStorageAdapter()", () => {
    const first = getStorageAdapter();
    resetStorageAdapter();
    const second = getStorageAdapter();
    expect(first).not.toBe(second);
  });
});

describe("getImageUrl()", () => {
  beforeEach(() => {
    resetStorageAdapter();
  });

  it("returns local API path when STORAGE_BACKEND=filesystem", () => {
    mockEnv.STORAGE_BACKEND = "filesystem";
    const url = getImageUrl("photo-123", "1200w.webp");
    expect(url).toBe("/api/images/photo-123/1200w.webp");
  });

  it("returns CloudFront URL when STORAGE_BACKEND=s3", () => {
    mockEnv.STORAGE_BACKEND = "s3";
    mockEnv.AWS_CLOUDFRONT_DOMAIN = "d12345.cloudfront.net";
    const url = getImageUrl("photo-456", "600w.avif");
    expect(url).toBe(
      "https://d12345.cloudfront.net/processed/photo-456/600w.avif",
    );
  });

  it("handles different CloudFront domains", () => {
    mockEnv.STORAGE_BACKEND = "s3";
    mockEnv.AWS_CLOUDFRONT_DOMAIN = "cdn.example.com";
    const url = getImageUrl("abc-def", "300w.webp");
    expect(url).toBe("https://cdn.example.com/processed/abc-def/300w.webp");
  });
});
