import {
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { s3Client } from "./s3Client";
import { env } from "@/infrastructure/config/env";
import { logger } from "@/infrastructure/logging/logger";
import type { StorageAdapter } from "./types";

const GET_TIMEOUT_MS = 30_000;

function isS3Error(error: unknown, ...names: string[]): boolean {
  return (
    error instanceof Error &&
    names.includes((error as Error & { name: string }).name)
  );
}

export class S3StorageAdapter implements StorageAdapter {
  private readonly bucket: string;

  constructor() {
    this.bucket = env.AWS_S3_BUCKET!;
  }

  async saveFile(
    key: string,
    data: Buffer,
    contentType: string,
  ): Promise<void> {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: contentType,
      }),
    );
    logger.debug("S3 file saved", { key, contentType, size: data.length });
  }

  async getFile(key: string): Promise<Buffer> {
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), GET_TIMEOUT_MS);

    try {
      const response = await s3Client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
        { abortSignal: abortController.signal },
      );

      if (!response.Body) {
        throw new Error(`Empty response body for key: ${key}`);
      }

      const bytes = await response.Body.transformToByteArray();
      return Buffer.from(bytes);
    } catch (error) {
      if (isS3Error(error, "NoSuchKey")) {
        throw new Error(`File not found: ${key}`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async getFileStream(key: string): Promise<ReadableStream> {
    try {
      const response = await s3Client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );

      if (!response.Body) {
        throw new Error(`Empty response body for key: ${key}`);
      }

      return response.Body.transformToWebStream() as ReadableStream;
    } catch (error) {
      if (isS3Error(error, "NoSuchKey")) {
        throw new Error(`File not found: ${key}`);
      }
      throw error;
    }
  }

  async deleteFiles(prefix: string): Promise<void> {
    let continuationToken: string | undefined;

    do {
      const listResponse = await s3Client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ...(continuationToken
            ? { ContinuationToken: continuationToken }
            : {}),
        }),
      );

      const objects = listResponse.Contents;
      if (objects && objects.length > 0) {
        await s3Client.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: {
              Objects: objects.map((obj) => ({ Key: obj.Key })),
              Quiet: true,
            },
          }),
        );
        logger.debug("S3 files deleted", { prefix, count: objects.length });
      }

      continuationToken = listResponse.IsTruncated
        ? listResponse.NextContinuationToken
        : undefined;
    } while (continuationToken);
  }

  async fileExists(key: string): Promise<boolean> {
    try {
      await s3Client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      return true;
    } catch (error) {
      if (isS3Error(error, "NotFound", "NoSuchKey")) {
        return false;
      }
      throw error;
    }
  }

  async listFiles(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let continuationToken: string | undefined;

    do {
      const response = await s3Client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ...(continuationToken
            ? { ContinuationToken: continuationToken }
            : {}),
        }),
      );

      if (response.Contents) {
        for (const obj of response.Contents) {
          if (obj.Key) {
            keys.push(obj.Key);
          }
        }
      }

      continuationToken = response.IsTruncated
        ? response.NextContinuationToken
        : undefined;
    } while (continuationToken);

    return keys;
  }
}
