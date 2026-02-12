import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { env } from "@/infrastructure/config/env";

const sqsClient = new SQSClient({ region: env.AWS_REGION });

export async function enqueueSQS(
  photoId: string,
  originalKey: string,
): Promise<string> {
  const result = await sqsClient.send(
    new SendMessageCommand({
      QueueUrl: env.SQS_QUEUE_URL,
      MessageBody: JSON.stringify({ photoId, originalKey }),
    }),
  );
  return result.MessageId!;
}
