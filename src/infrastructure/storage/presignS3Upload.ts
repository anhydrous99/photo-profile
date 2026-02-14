import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { s3Client } from "./s3Client";

interface PresignParams {
  bucket: string;
  key: string;
  contentType: string;
  expiresIn?: number;
}

export async function presignS3Upload({
  bucket,
  key,
  contentType,
  expiresIn = 900,
}: PresignParams): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });

  const url = await getSignedUrl(s3Client, command, {
    expiresIn,
    signableHeaders: new Set(["content-type"]),
  });

  return url;
}
