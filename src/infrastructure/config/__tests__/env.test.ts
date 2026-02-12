import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { z } from "zod";

// We'll test the schema directly without importing the module
// to avoid the fail-fast behavior during test setup

const createEnvSchema = () =>
  z
    .object({
      STORAGE_PATH: z.string().optional().default(""),
      STORAGE_BACKEND: z
        .enum(["s3", "filesystem"])
        .default("filesystem")
        .describe("Storage backend: s3 or filesystem"),
      AWS_REGION: z.string().optional(),
      AWS_S3_BUCKET: z.string().optional(),
      AWS_CLOUDFRONT_DOMAIN: z.string().optional(),
      AWS_ACCESS_KEY_ID: z.string().optional(),
      AWS_SECRET_ACCESS_KEY: z.string().optional(),
      REDIS_URL: z.string().url().optional().default("redis://localhost:6379"),
      QUEUE_BACKEND: z
        .enum(["bullmq", "sqs"])
        .default("bullmq")
        .describe("Queue backend: bullmq or sqs"),
      SQS_QUEUE_URL: z.string().url().optional(),
      NODE_ENV: z
        .enum(["development", "production", "test"])
        .default("development"),
      AUTH_SECRET: z
        .string()
        .min(32, "AUTH_SECRET must be at least 32 characters for security"),
      ADMIN_PASSWORD_HASH: z.string().min(1, "ADMIN_PASSWORD_HASH is required"),
      LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).optional(),
      TRUSTED_PROXIES: z
        .string()
        .optional()
        .transform((val) => {
          if (!val) return [];
          return val
            .split(",")
            .map((ip) => ip.trim())
            .filter((ip) => ip.length > 0);
        })
        .describe("Comma-separated list of trusted proxy IP addresses"),
    })
    .superRefine((data, ctx) => {
      if (data.STORAGE_BACKEND === "s3") {
        if (!data.AWS_REGION) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["AWS_REGION"],
            message: "AWS_REGION is required when STORAGE_BACKEND is s3",
          });
        }
        if (!data.AWS_S3_BUCKET) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["AWS_S3_BUCKET"],
            message: "AWS_S3_BUCKET is required when STORAGE_BACKEND is s3",
          });
        }
        if (!data.AWS_CLOUDFRONT_DOMAIN) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["AWS_CLOUDFRONT_DOMAIN"],
            message:
              "AWS_CLOUDFRONT_DOMAIN is required when STORAGE_BACKEND is s3",
          });
        }
      }

      if (data.STORAGE_BACKEND === "filesystem") {
        if (!data.STORAGE_PATH) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["STORAGE_PATH"],
            message:
              "STORAGE_PATH is required when STORAGE_BACKEND is filesystem",
          });
        }
      }

      if (data.QUEUE_BACKEND === "sqs") {
        if (!data.SQS_QUEUE_URL) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["SQS_QUEUE_URL"],
            message: "SQS_QUEUE_URL is required when QUEUE_BACKEND is sqs",
          });
        }
      }
    });

describe("Environment Configuration", () => {
  const baseValidEnv = {
    STORAGE_PATH: "./storage",
    AUTH_SECRET: "test-secret-key-must-be-at-least-32-chars-long!!",
    ADMIN_PASSWORD_HASH: "$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVW",
    NODE_ENV: "test" as const,
  };

  describe("STORAGE_BACKEND enum", () => {
    it("should default to filesystem", () => {
      const schema = createEnvSchema();
      const result = schema.safeParse(baseValidEnv);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.STORAGE_BACKEND).toBe("filesystem");
      }
    });

    it("should accept s3 value", () => {
      const schema = createEnvSchema();
      const result = schema.safeParse({
        ...baseValidEnv,
        STORAGE_BACKEND: "s3",
        AWS_REGION: "us-east-1",
        AWS_S3_BUCKET: "my-bucket",
        AWS_CLOUDFRONT_DOMAIN: "d1234.cloudfront.net",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.STORAGE_BACKEND).toBe("s3");
      }
    });

    it("should accept filesystem value", () => {
      const schema = createEnvSchema();
      const result = schema.safeParse({
        ...baseValidEnv,
        STORAGE_BACKEND: "filesystem",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.STORAGE_BACKEND).toBe("filesystem");
      }
    });

    it("should reject invalid backend value", () => {
      const schema = createEnvSchema();
      const result = schema.safeParse({
        ...baseValidEnv,
        STORAGE_BACKEND: "invalid",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("Conditional validation: S3 backend", () => {
    it("should require AWS_REGION when STORAGE_BACKEND is s3", () => {
      const schema = createEnvSchema();
      const result = schema.safeParse({
        ...baseValidEnv,
        STORAGE_BACKEND: "s3",
        AWS_S3_BUCKET: "my-bucket",
        AWS_CLOUDFRONT_DOMAIN: "d1234.cloudfront.net",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const errors = z.flattenError(result.error);
        expect(errors.fieldErrors.AWS_REGION).toBeDefined();
      }
    });

    it("should require AWS_S3_BUCKET when STORAGE_BACKEND is s3", () => {
      const schema = createEnvSchema();
      const result = schema.safeParse({
        ...baseValidEnv,
        STORAGE_BACKEND: "s3",
        AWS_REGION: "us-east-1",
        AWS_CLOUDFRONT_DOMAIN: "d1234.cloudfront.net",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const errors = z.flattenError(result.error);
        expect(errors.fieldErrors.AWS_S3_BUCKET).toBeDefined();
      }
    });

    it("should require AWS_CLOUDFRONT_DOMAIN when STORAGE_BACKEND is s3", () => {
      const schema = createEnvSchema();
      const result = schema.safeParse({
        ...baseValidEnv,
        STORAGE_BACKEND: "s3",
        AWS_REGION: "us-east-1",
        AWS_S3_BUCKET: "my-bucket",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const errors = z.flattenError(result.error);
        expect(errors.fieldErrors.AWS_CLOUDFRONT_DOMAIN).toBeDefined();
      }
    });

    it("should pass when all S3 vars are provided", () => {
      const schema = createEnvSchema();
      const result = schema.safeParse({
        ...baseValidEnv,
        STORAGE_BACKEND: "s3",
        AWS_REGION: "us-east-1",
        AWS_S3_BUCKET: "my-bucket",
        AWS_CLOUDFRONT_DOMAIN: "d1234.cloudfront.net",
        AWS_ACCESS_KEY_ID: "AKIAIOSFODNN7EXAMPLE",
        AWS_SECRET_ACCESS_KEY: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("Conditional validation: Filesystem backend", () => {
    it("should require STORAGE_PATH when STORAGE_BACKEND is filesystem", () => {
      const schema = createEnvSchema();
      const result = schema.safeParse({
        STORAGE_BACKEND: "filesystem",
        AUTH_SECRET: "test-secret-key-must-be-at-least-32-chars-long!!",
        ADMIN_PASSWORD_HASH:
          "$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVW",
        NODE_ENV: "test" as const,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const errors = z.flattenError(result.error);
        expect(errors.fieldErrors.STORAGE_PATH).toBeDefined();
      }
    });

    it("should pass when STORAGE_PATH is provided", () => {
      const schema = createEnvSchema();
      const result = schema.safeParse({
        ...baseValidEnv,
        STORAGE_BACKEND: "filesystem",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("AWS optional fields", () => {
    it("should allow AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY to be optional", () => {
      const schema = createEnvSchema();
      const result = schema.safeParse({
        ...baseValidEnv,
        STORAGE_BACKEND: "s3",
        AWS_REGION: "us-east-1",
        AWS_S3_BUCKET: "my-bucket",
        AWS_CLOUDFRONT_DOMAIN: "d1234.cloudfront.net",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("QUEUE_BACKEND enum", () => {
    it("should default to bullmq", () => {
      const schema = createEnvSchema();
      const result = schema.safeParse(baseValidEnv);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.QUEUE_BACKEND).toBe("bullmq");
      }
    });

    it("should accept bullmq value", () => {
      const schema = createEnvSchema();
      const result = schema.safeParse({
        ...baseValidEnv,
        QUEUE_BACKEND: "bullmq",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.QUEUE_BACKEND).toBe("bullmq");
      }
    });

    it("should accept sqs value", () => {
      const schema = createEnvSchema();
      const result = schema.safeParse({
        ...baseValidEnv,
        QUEUE_BACKEND: "sqs",
        SQS_QUEUE_URL: "https://sqs.us-east-1.amazonaws.com/123456789/my-queue",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.QUEUE_BACKEND).toBe("sqs");
      }
    });

    it("should reject invalid queue backend value", () => {
      const schema = createEnvSchema();
      const result = schema.safeParse({
        ...baseValidEnv,
        QUEUE_BACKEND: "invalid",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("Conditional validation: SQS backend", () => {
    it("should require SQS_QUEUE_URL when QUEUE_BACKEND is sqs", () => {
      const schema = createEnvSchema();
      const result = schema.safeParse({
        ...baseValidEnv,
        QUEUE_BACKEND: "sqs",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const errors = z.flattenError(result.error);
        expect(errors.fieldErrors.SQS_QUEUE_URL).toBeDefined();
      }
    });

    it("should pass when SQS_QUEUE_URL is provided with sqs backend", () => {
      const schema = createEnvSchema();
      const result = schema.safeParse({
        ...baseValidEnv,
        QUEUE_BACKEND: "sqs",
        SQS_QUEUE_URL: "https://sqs.us-east-1.amazonaws.com/123456789/my-queue",
      });
      expect(result.success).toBe(true);
    });

    it("should reject invalid SQS_QUEUE_URL format", () => {
      const schema = createEnvSchema();
      const result = schema.safeParse({
        ...baseValidEnv,
        QUEUE_BACKEND: "sqs",
        SQS_QUEUE_URL: "not-a-valid-url",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("STORAGE_PATH optionality", () => {
    it("should allow S3 backend without STORAGE_PATH", () => {
      const schema = createEnvSchema();
      const result = schema.safeParse({
        AUTH_SECRET: "test-secret-key-must-be-at-least-32-chars-long!!",
        ADMIN_PASSWORD_HASH:
          "$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVW",
        NODE_ENV: "test" as const,
        STORAGE_BACKEND: "s3",
        AWS_REGION: "us-east-1",
        AWS_S3_BUCKET: "my-bucket",
        AWS_CLOUDFRONT_DOMAIN: "d1234.cloudfront.net",
        // STORAGE_PATH intentionally omitted
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.STORAGE_PATH).toBe(""); // Should default to empty string
      }
    });

    it("should require STORAGE_PATH for filesystem backend", () => {
      const schema = createEnvSchema();
      const result = schema.safeParse({
        STORAGE_BACKEND: "filesystem",
        AUTH_SECRET: "test-secret-key-must-be-at-least-32-chars-long!!",
        ADMIN_PASSWORD_HASH:
          "$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVW",
        NODE_ENV: "test" as const,
        // STORAGE_PATH intentionally omitted
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const errors = z.flattenError(result.error);
        expect(errors.fieldErrors.STORAGE_PATH).toBeDefined();
      }
    });
  });
});
