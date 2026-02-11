import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { env } from "@/infrastructure/config/env";
import type { ExifData } from "@/domain/entities/Photo";

export interface ImageJobData {
  photoId: string;
  originalKey: string;
}

export interface ImageJobResult {
  photoId: string;
  derivatives: string[];
  blurDataUrl: string;
  exifData: ExifData | null;
  width: number;
  height: number;
}

let sqsClient: SQSClient | undefined;

function getSQSClient(): SQSClient {
  if (!sqsClient) {
    sqsClient = new SQSClient({ region: env.AWS_REGION });
  }
  return sqsClient;
}

export async function enqueueImageProcessing(
  photoId: string,
  originalKey: string,
): Promise<string> {
  const message: ImageJobData = { photoId, originalKey };

  const result = await getSQSClient().send(
    new SendMessageCommand({
      QueueUrl: env.SQS_QUEUE_URL,
      MessageBody: JSON.stringify(message),
    }),
  );

  return result.MessageId!;
}
