import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("imageLoader", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("without NEXT_PUBLIC_CLOUDFRONT_DOMAIN (local dev)", () => {
    it("returns relative URL with nearest derivative width", async () => {
      delete process.env.NEXT_PUBLIC_CLOUDFRONT_DOMAIN;
      const { default: imageLoader } = await import("../imageLoader");

      const result = imageLoader({
        src: "/api/images/abc-123",
        width: 400,
      });

      expect(result).toBe("/api/images/abc-123/600w.webp");
    });

    it("selects smallest available width that covers requested width", async () => {
      delete process.env.NEXT_PUBLIC_CLOUDFRONT_DOMAIN;
      const { default: imageLoader } = await import("../imageLoader");

      expect(imageLoader({ src: "/api/images/photo-1", width: 100 })).toBe(
        "/api/images/photo-1/300w.webp",
      );
      expect(imageLoader({ src: "/api/images/photo-1", width: 300 })).toBe(
        "/api/images/photo-1/300w.webp",
      );
      expect(imageLoader({ src: "/api/images/photo-1", width: 301 })).toBe(
        "/api/images/photo-1/600w.webp",
      );
      expect(imageLoader({ src: "/api/images/photo-1", width: 1200 })).toBe(
        "/api/images/photo-1/1200w.webp",
      );
      expect(imageLoader({ src: "/api/images/photo-1", width: 2400 })).toBe(
        "/api/images/photo-1/2400w.webp",
      );
    });

    it("falls back to largest width when requested width exceeds all options", async () => {
      delete process.env.NEXT_PUBLIC_CLOUDFRONT_DOMAIN;
      const { default: imageLoader } = await import("../imageLoader");

      const result = imageLoader({
        src: "/api/images/photo-1",
        width: 5000,
      });

      expect(result).toBe("/api/images/photo-1/2400w.webp");
    });
  });

  describe("with NEXT_PUBLIC_CLOUDFRONT_DOMAIN (production/S3)", () => {
    it("returns absolute CloudFront URL with processed path", async () => {
      process.env.NEXT_PUBLIC_CLOUDFRONT_DOMAIN = "d1234.cloudfront.net";
      const { default: imageLoader } = await import("../imageLoader");

      const result = imageLoader({
        src: "/api/images/abc-123",
        width: 400,
      });

      expect(result).toBe(
        "https://d1234.cloudfront.net/processed/abc-123/600w.webp",
      );
    });

    it("extracts photoId from /api/images/{photoId} path", async () => {
      process.env.NEXT_PUBLIC_CLOUDFRONT_DOMAIN = "cdn.example.com";
      const { default: imageLoader } = await import("../imageLoader");

      const result = imageLoader({
        src: "/api/images/550e8400-e29b-41d4-a716-446655440000",
        width: 1200,
      });

      expect(result).toBe(
        "https://cdn.example.com/processed/550e8400-e29b-41d4-a716-446655440000/1200w.webp",
      );
    });

    it("selects correct derivative width with CloudFront", async () => {
      process.env.NEXT_PUBLIC_CLOUDFRONT_DOMAIN = "cdn.example.com";
      const { default: imageLoader } = await import("../imageLoader");

      expect(imageLoader({ src: "/api/images/p1", width: 100 })).toBe(
        "https://cdn.example.com/processed/p1/300w.webp",
      );
      expect(imageLoader({ src: "/api/images/p1", width: 2400 })).toBe(
        "https://cdn.example.com/processed/p1/2400w.webp",
      );
      expect(imageLoader({ src: "/api/images/p1", width: 5000 })).toBe(
        "https://cdn.example.com/processed/p1/2400w.webp",
      );
    });
  });

  describe("getClientImageUrl", () => {
    it("returns relative URL without CloudFront domain", async () => {
      delete process.env.NEXT_PUBLIC_CLOUDFRONT_DOMAIN;
      const { getClientImageUrl } = await import("../imageLoader");

      expect(getClientImageUrl("photo-1", "300w.webp")).toBe(
        "/api/images/photo-1/300w.webp",
      );
    });

    it("returns absolute CloudFront URL with domain set", async () => {
      process.env.NEXT_PUBLIC_CLOUDFRONT_DOMAIN = "cdn.example.com";
      const { getClientImageUrl } = await import("../imageLoader");

      expect(getClientImageUrl("photo-1", "300w.webp")).toBe(
        "https://cdn.example.com/processed/photo-1/300w.webp",
      );
    });

    it("returns absolute CloudFront URL for 600w derivative", async () => {
      process.env.NEXT_PUBLIC_CLOUDFRONT_DOMAIN = "d111.cloudfront.net";
      const { getClientImageUrl } = await import("../imageLoader");

      expect(getClientImageUrl("abc-123", "600w.webp")).toBe(
        "https://d111.cloudfront.net/processed/abc-123/600w.webp",
      );
    });
  });
});
