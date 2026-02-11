import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { env } from "@/infrastructure/config/env";
import { logger } from "@/infrastructure/logging/logger";

const region = env.AWS_REGION ?? "us-east-1";

const clientConfig: ConstructorParameters<typeof DynamoDBClient>[0] = {
  region,
};

if (env.DYNAMODB_ENDPOINT) {
  clientConfig.endpoint = env.DYNAMODB_ENDPOINT;
  clientConfig.credentials = {
    accessKeyId: "local",
    secretAccessKey: "local",
  };
  logger.info("DynamoDB client configured for local endpoint", {
    component: "dynamodb",
    endpoint: env.DYNAMODB_ENDPOINT,
    region,
  });
} else {
  logger.info("DynamoDB client configured for AWS", {
    component: "dynamodb",
    region,
  });
}

const client = new DynamoDBClient(clientConfig);

export const dynamodbClient = client;

export const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

export const tablePrefix = env.DYNAMODB_TABLE_PREFIX;

export function tableName(name: string): string {
  return `${tablePrefix}${name}`;
}
