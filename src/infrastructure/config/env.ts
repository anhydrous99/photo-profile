import { z } from "zod";
import { logger } from "@/infrastructure/logging/logger";

const envSchema = z
  .object({
    DATABASE_PATH: z.string().min(1, "DATABASE_PATH is required"),
    STORAGE_PATH: z.string().min(1, "STORAGE_PATH is required"),
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
