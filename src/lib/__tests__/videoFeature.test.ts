import { describe, expect, it } from "vitest";
import { resolveVideoEnabled } from "../videoFeature";

describe("resolveVideoEnabled", () => {
  it("defaults to enabled when client storage backend is not provided", () => {
    expect(resolveVideoEnabled({})).toBe(true);
  });

  it("defaults to enabled for S3 storage", () => {
    expect(resolveVideoEnabled({ storageBackend: "s3" })).toBe(true);
  });

  it("defaults to disabled for filesystem storage", () => {
    expect(resolveVideoEnabled({ storageBackend: "filesystem" })).toBe(false);
  });

  it("allows explicit opt-out", () => {
    expect(resolveVideoEnabled({ value: "false", storageBackend: "s3" })).toBe(
      false,
    );
    expect(resolveVideoEnabled({ value: "0", storageBackend: "s3" })).toBe(
      false,
    );
  });
});
