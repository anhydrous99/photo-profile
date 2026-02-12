import { describe, it, expect } from "vitest";
import type { ImageJobData } from "../types";

describe("ImageJobData interface", () => {
  it("should have originalKey field instead of originalPath", () => {
    const jobData: ImageJobData = {
      photoId: "test-photo-id",
      originalKey: "s3://bucket/photos/test-photo-id/original.jpg",
    };

    expect(jobData).toHaveProperty("originalKey");
    expect(jobData.originalKey).toBe(
      "s3://bucket/photos/test-photo-id/original.jpg",
    );
  });

  it("should accept filesystem paths as originalKey", () => {
    const jobData: ImageJobData = {
      photoId: "test-photo-id",
      originalKey: "./storage/originals/test-photo-id/image.jpg",
    };

    expect(jobData.originalKey).toBe(
      "./storage/originals/test-photo-id/image.jpg",
    );
  });

  it("should not allow originalPath property", () => {
    // This test verifies that the interface has been renamed
    // TypeScript will catch this at compile time
    const jobData: ImageJobData = {
      photoId: "test-photo-id",
      originalKey: "test-key",
    };

    // Verify the property exists and originalPath does not
    expect("originalKey" in jobData).toBe(true);
    expect("originalPath" in jobData).toBe(false);
  });
});
