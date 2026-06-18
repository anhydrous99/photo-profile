import {
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Client } from "./s3Client";

/**
 * Helpers for browser-driven S3 multipart uploads of large files (video).
 *
 * Flow:
 *   1. createMultipartUpload()   -> uploadId
 *   2. presignUploadParts()      -> one presigned PUT URL per part
 *   3. browser PUTs each part, collecting the returned ETag header
 *   4. completeMultipartUpload()  with { PartNumber, ETag }[]
 *
 * abortMultipartUpload() is called to clean up on cancellation/failure.
 */

export interface PresignedPart {
  partNumber: number;
  url: string;
}

export interface CompletedPart {
  PartNumber: number;
  ETag: string;
}

export async function createMultipartUpload(params: {
  bucket: string;
  key: string;
  contentType: string;
}): Promise<string> {
  const { bucket, key, contentType } = params;
  const result = await s3Client.send(
    new CreateMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
    }),
  );
  if (!result.UploadId) {
    throw new Error("S3 did not return an UploadId for multipart upload");
  }
  return result.UploadId;
}

export async function presignUploadParts(params: {
  bucket: string;
  key: string;
  uploadId: string;
  partCount: number;
  expiresIn: number;
}): Promise<PresignedPart[]> {
  const { bucket, key, uploadId, partCount, expiresIn } = params;

  const parts = await Promise.all(
    Array.from({ length: partCount }, (_, index) => {
      const partNumber = index + 1;
      const command = new UploadPartCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
      });
      return getSignedUrl(s3Client, command, { expiresIn }).then((url) => ({
        partNumber,
        url,
      }));
    }),
  );

  return parts;
}

export async function completeMultipartUpload(params: {
  bucket: string;
  key: string;
  uploadId: string;
  parts: CompletedPart[];
}): Promise<void> {
  const { bucket, key, uploadId, parts } = params;
  // S3 requires parts ordered by ascending part number.
  const orderedParts = [...parts].sort((a, b) => a.PartNumber - b.PartNumber);
  await s3Client.send(
    new CompleteMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: orderedParts },
    }),
  );
}

export async function abortMultipartUpload(params: {
  bucket: string;
  key: string;
  uploadId: string;
}): Promise<void> {
  const { bucket, key, uploadId } = params;
  await s3Client.send(
    new AbortMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
    }),
  );
}
