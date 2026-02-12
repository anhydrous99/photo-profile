import * as cdk from "aws-cdk-lib/core";
import { Template, Match } from "aws-cdk-lib/assertions";
import { PhotoProfileCdkStack } from "../lib/photo-profile-cdk-stack";

function createTestStack(): Template {
  const app = new cdk.App();
  const stack = new PhotoProfileCdkStack(app, "TestStack", {
    s3BucketName: "test-photo-bucket",
    dynamodbTablePrefix: "test_",
  });
  return Template.fromStack(stack);
}

describe("PhotoProfileCdkStack", () => {
  let template: Template;

  beforeAll(() => {
    template = createTestStack();
  });

  test("creates SQS queue with correct visibility timeout", () => {
    template.hasResourceProperties("AWS::SQS::Queue", {
      QueueName: "TestStack-image-processing",
      VisibilityTimeout: 180,
    });
  });

  test("creates dead letter queue", () => {
    template.hasResourceProperties("AWS::SQS::Queue", {
      QueueName: "TestStack-image-processing-dlq",
    });
  });

  test("SQS queue has DLQ with maxReceiveCount 3", () => {
    template.hasResourceProperties("AWS::SQS::Queue", {
      QueueName: "TestStack-image-processing",
      RedrivePolicy: Match.objectLike({
        maxReceiveCount: 3,
      }),
    });
  });

  test("creates Lambda function with correct configuration", () => {
    template.hasResourceProperties("AWS::Lambda::Function", {
      Runtime: "nodejs22.x",
      Timeout: 120,
      MemorySize: 2048,
      ReservedConcurrentExecutions: 5,
      Handler: "src/infrastructure/jobs/lambdaHandler.handler",
      Architectures: ["arm64"],
    });
  });

  test("Lambda has correct ephemeral storage", () => {
    template.hasResourceProperties("AWS::Lambda::Function", {
      EphemeralStorage: {
        Size: 1024,
      },
    });
  });

  test("Lambda has correct environment variables", () => {
    template.hasResourceProperties("AWS::Lambda::Function", {
      Environment: {
        Variables: Match.objectLike({
          AWS_S3_BUCKET: "test-photo-bucket",
          DYNAMODB_TABLE_PREFIX: "test_",
          STORAGE_BACKEND: "s3",
          STORAGE_PATH: "",
          QUEUE_BACKEND: "sqs",
          AUTH_SECRET: "dummy-not-used-by-lambda",
          ADMIN_PASSWORD_HASH: "dummy-not-used-by-lambda",
        }),
      },
    });
  });

  test("Lambda has S3 permissions", () => {
    template.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: ["s3:GetObject", "s3:PutObject"],
            Effect: "Allow",
            Resource: "arn:aws:s3:::test-photo-bucket/*",
          }),
        ]),
      },
    });
  });

  test("Lambda has DynamoDB permissions", () => {
    template.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: [
              "dynamodb:GetItem",
              "dynamodb:PutItem",
              "dynamodb:UpdateItem",
            ],
            Effect: "Allow",
          }),
        ]),
      },
    });
  });

  test("Lambda has SQS event source mapping with batch size 1", () => {
    template.hasResourceProperties("AWS::Lambda::EventSourceMapping", {
      BatchSize: 1,
    });
  });

  test("Lambda has SQS receive/delete permissions via event source", () => {
    template.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: Match.arrayWith([
              "sqs:ReceiveMessage",
              "sqs:ChangeMessageVisibility",
              "sqs:GetQueueUrl",
              "sqs:DeleteMessage",
              "sqs:GetQueueAttributes",
            ]),
            Effect: "Allow",
          }),
        ]),
      },
    });
  });
});
