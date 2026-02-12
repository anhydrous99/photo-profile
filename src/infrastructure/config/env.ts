import { z } from "zod";
import { logger } from "@/infrastructure/logging/logger";

const envSchema = z
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
    UPSTASH_REDIS_REST_URL: z.string().url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
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
    DYNAMODB_ENDPOINT: z.string().optional(),
    DYNAMODB_TABLE_PREFIX: z.string().optional().default(""),
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

    const hasUrl = !!data.UPSTASH_REDIS_REST_URL;
    const hasToken = !!data.UPSTASH_REDIS_REST_TOKEN;

    if (hasUrl && !hasToken) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["UPSTASH_REDIS_REST_TOKEN"],
        message:
          "UPSTASH_REDIS_REST_TOKEN is required when UPSTASH_REDIS_REST_URL is set",
      });
    }

    if (hasToken && !hasUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["UPSTASH_REDIS_REST_URL"],
        message:
          "UPSTASH_REDIS_REST_URL is required when UPSTASH_REDIS_REST_TOKEN is set",
      });
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  logger.error("Invalid environment variables", {
    fields: z.flattenError(parsed.error).fieldErrors,
  });
  throw new Error("Invalid environment variables");
}

export const env = parsed.data;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace NodeJS {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface ProcessEnv extends z.infer<typeof envSchema> {}
  }
}
