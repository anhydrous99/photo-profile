import type { SQSEvent, SQSBatchResponse } from "aws-lambda";
import path from "path";
import fs from "fs/promises";
import sharp from "sharp";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  generateDerivatives,
  generateBlurPlaceholder,
} from "@/infrastructure/services/imageService";
import { extractExifData } from "@/infrastructure/services/exifService";

sharp.cache(false);

let _s3: S3Client | undefined;
let _dynamodb: DynamoDBDocumentClient | undefined;

function getS3(): S3Client {
  if (!_s3) {
    _s3 = new S3Client({ region: process.env.AWS_REGION ?? "us-east-1" });
  }
  return _s3;
}

function getDynamoDB(): DynamoDBDocumentClient {
  if (!_dynamodb) {
    _dynamodb = DynamoDBDocumentClient.from(
      new DynamoDBClient({ region: process.env.AWS_REGION ?? "us-east-1" }),
      { marshallOptions: { removeUndefinedValues: true } },
    );
  }
  return _dynamodb;
}

function getPhotosTable(): string {
  return `${process.env.DYNAMODB_TABLE_PREFIX ?? ""}Photos`;
}

function getBucket(): string {
  return process.env.S3_BUCKET!;
}

export function _resetClientsForTesting(
  s3: S3Client,
  dynamodb: DynamoDBDocumentClient,
): void {
  _s3 = s3;
  _dynamodb = dynamodb;
}

const CONTENT_TYPES: Record<string, string> = {
  ".webp": "image/webp",
  ".avif": "image/avif",
};

async function retryDbUpdate(
  fn: () => Promise<void>,
  attempts = 3,
): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    try {
      await fn();
      return;
    } catch (err) {
      console.error(
        `DB update retry ${i + 1}/${attempts}`,
        err instanceof Error ? err.message : err,
      );
      if (i < attempts - 1)
        await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

async function processRecord(
  photoId: string,
  originalKey: string,
): Promise<void> {
  const tempDir = `/tmp/lambda-${photoId}`;
  const originalFilename = path.basename(originalKey);
  const tempOriginalPath = path.join(tempDir, originalFilename);

  try {
    const result = await getDynamoDB().send(
      new GetCommand({
        TableName: getPhotosTable(),
        Key: { id: photoId },
      }),
    );

    if (!result.Item) {
      console.error(`Photo not found: ${photoId}`);
      return;
    }

    if (result.Item.status === "ready") {
      return;
    }

    await fs.mkdir(tempDir, { recursive: true });

    const s3Response = await getS3().send(
      new GetObjectCommand({ Bucket: getBucket(), Key: originalKey }),
    );
    const bytes = await s3Response.Body!.transformToByteArray();
    await fs.writeFile(tempOriginalPath, Buffer.from(bytes));

    await generateDerivatives(tempOriginalPath, tempDir);

    const rotatedMeta = await sharp(tempOriginalPath).rotate().metadata();
    const width = rotatedMeta.width!;
    const height = rotatedMeta.height!;

    const exifData = await extractExifData(tempOriginalPath);

    const blurDataUrl = await generateBlurPlaceholder(tempOriginalPath);

    const entries = await fs.readdir(tempDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (entry.name.startsWith("original")) continue;

      const ext = path.extname(entry.name);
      const contentType = CONTENT_TYPES[ext];
      if (!contentType) continue;

      const fileBuffer = await fs.readFile(path.join(tempDir, entry.name));
      await getS3().send(
        new PutObjectCommand({
          Bucket: getBucket(),
          Key: `processed/${photoId}/${entry.name}`,
          Body: fileBuffer,
          ContentType: contentType,
        }),
      );
    }

    await getDynamoDB().send(
      new UpdateCommand({
        TableName: getPhotosTable(),
        Key: { id: photoId },
        UpdateExpression:
          "SET #status = :status, blurDataUrl = :blurDataUrl, exifData = :exifData, width = :width, height = :height, updatedAt = :updatedAt",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":status": "ready",
          ":blurDataUrl": blurDataUrl,
          ":exifData": exifData,
          ":width": width,
          ":height": height,
          ":updatedAt": Date.now(),
        },
      }),
    );
  } finally {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      console.warn(`Failed to clean up temp dir: ${tempDir}`);
    }
  }
}

export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
  const batchItemFailures: { itemIdentifier: string }[] = [];

  for (const record of event.Records) {
    try {
      const { photoId, originalKey } = JSON.parse(record.body);
      await processRecord(photoId, originalKey);
    } catch (err) {
      console.error(
        `Failed to process record ${record.messageId}`,
        err instanceof Error ? err.message : err,
      );

      try {
        const { photoId } = JSON.parse(record.body);
        await retryDbUpdate(async () => {
          await getDynamoDB().send(
            new UpdateCommand({
              TableName: getPhotosTable(),
              Key: { id: photoId },
              UpdateExpression: "SET #status = :status, updatedAt = :updatedAt",
              ExpressionAttributeNames: { "#status": "status" },
              ExpressionAttributeValues: {
                ":status": "error",
                ":updatedAt": Date.now(),
              },
            }),
          );
        });
      } catch {
        console.error("Failed to mark photo as error after processing failure");
      }

      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
}
