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
          NODE_ENV: "production",
          LOG_LEVEL: "info",
          AUTH_SECRET: "dummy-not-used-by-lambda-at-all!",
          ADMIN_PASSWORD_HASH: "dummy-not-used-by-lambda",
        }),
      },
    });
  });

  test("creates CloudWatch log group with one month retention for Lambda", () => {
    template.hasResourceProperties("AWS::Logs::LogGroup", {
      RetentionInDays: 30,
    });
  });

  test("Lambda has S3 permissions", () => {
    template.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: [
              "s3:GetObject",
              "s3:PutObject",
              "s3:DeleteObject",
              "s3:HeadObject",
            ],
            Effect: "Allow",
            Resource: "arn:aws:s3:::test-photo-bucket/*",
          }),
          Match.objectLike({
            Action: "s3:ListBucket",
            Effect: "Allow",
            Resource: "arn:aws:s3:::test-photo-bucket",
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
              "dynamodb:DeleteItem",
              "dynamodb:Query",
              "dynamodb:Scan",
              "dynamodb:BatchGetItem",
              "dynamodb:BatchWriteItem",
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

  test("creates Photos table with correct schema", () => {
    template.hasResourceProperties("AWS::DynamoDB::Table", {
      TableName: "test_Photos",
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
      BillingMode: "PAY_PER_REQUEST",
    });
  });

  test("Photos table has GSIs", () => {
    template.hasResourceProperties("AWS::DynamoDB::Table", {
      TableName: "test_Photos",
      GlobalSecondaryIndexes: Match.arrayWith([
        Match.objectLike({ IndexName: "status-createdAt-index" }),
        Match.objectLike({ IndexName: "createdAt-index" }),
      ]),
    });
  });

  test("creates Albums table with correct schema", () => {
    template.hasResourceProperties("AWS::DynamoDB::Table", {
      TableName: "test_Albums",
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
      BillingMode: "PAY_PER_REQUEST",
    });
  });

  test("Albums table has GSIs", () => {
    template.hasResourceProperties("AWS::DynamoDB::Table", {
      TableName: "test_Albums",
      GlobalSecondaryIndexes: Match.arrayWith([
        Match.objectLike({ IndexName: "isPublished-sortOrder-index" }),
        Match.objectLike({ IndexName: "sortOrder-index" }),
      ]),
    });
  });

  test("creates AlbumPhotos table with correct schema", () => {
    template.hasResourceProperties("AWS::DynamoDB::Table", {
      TableName: "test_AlbumPhotos",
      KeySchema: [
        { AttributeName: "albumId", KeyType: "HASH" },
        { AttributeName: "photoId", KeyType: "RANGE" },
      ],
      BillingMode: "PAY_PER_REQUEST",
    });
  });

  test("AlbumPhotos table has GSI", () => {
    template.hasResourceProperties("AWS::DynamoDB::Table", {
      TableName: "test_AlbumPhotos",
      GlobalSecondaryIndexes: Match.arrayWith([
        Match.objectLike({ IndexName: "photoId-albumId-index" }),
      ]),
    });
  });

  test("DynamoDB tables have RETAIN removal policy", () => {
    const resources = template.findResources("AWS::DynamoDB::Table");
    const tableLogicalIds = Object.keys(resources);
    expect(tableLogicalIds.length).toBe(3);
    for (const logicalId of tableLogicalIds) {
      expect(resources[logicalId].DeletionPolicy).toBe("Retain");
    }
  });

  test("creates Vercel IAM user", () => {
    template.hasResourceProperties("AWS::IAM::User", {
      UserName: "TestStack-vercel-app",
    });
  });

  test("creates Vercel access key", () => {
    template.resourceCountIs("AWS::IAM::AccessKey", 1);
  });

  test("Vercel user has S3 permissions", () => {
    template.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: [
              "s3:GetObject",
              "s3:PutObject",
              "s3:DeleteObject",
              "s3:HeadObject",
            ],
            Effect: "Allow",
            Resource: "arn:aws:s3:::test-photo-bucket/*",
          }),
        ]),
      },
    });
  });

  test("Vercel user has DynamoDB data-plane permissions", () => {
    template.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: [
              "dynamodb:GetItem",
              "dynamodb:PutItem",
              "dynamodb:UpdateItem",
              "dynamodb:DeleteItem",
              "dynamodb:Query",
              "dynamodb:Scan",
              "dynamodb:BatchGetItem",
              "dynamodb:BatchWriteItem",
            ],
            Effect: "Allow",
          }),
        ]),
      },
    });
  });

  test("Vercel user has DynamoDB ListTables permission", () => {
    template.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: "dynamodb:ListTables",
            Effect: "Allow",
            Resource: "*",
          }),
        ]),
      },
    });
  });

  test("Vercel user has SQS SendMessage permission", () => {
    template.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: "sqs:SendMessage",
            Effect: "Allow",
          }),
        ]),
      },
    });
  });

  test("outputs Vercel access key credentials", () => {
    template.hasOutput("VercelAccessKeyId", {});
    template.hasOutput("VercelSecretAccessKey", {});
  });

  test("creates S3 bucket policy for CloudFront access", () => {
    template.resourceCountIs("AWS::S3::BucketPolicy", 1);
  });

  test("bucket policy allows CloudFront s3:GetObject on bucket/*", () => {
    template.hasResourceProperties("AWS::S3::BucketPolicy", {
      Bucket: "test-photo-bucket",
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Sid: "AllowCloudFrontGetObject",
            Effect: "Allow",
            Principal: {
              Service: "cloudfront.amazonaws.com",
            },
            Action: "s3:GetObject",
            Resource: "arn:aws:s3:::test-photo-bucket/*",
            Condition: Match.objectLike({
              StringEquals: Match.objectLike({
                "AWS:SourceArn": Match.anyValue(),
              }),
            }),
          }),
        ]),
      },
    });
  });

  test("bucket policy allows CloudFront s3:ListBucket on bucket", () => {
    template.hasResourceProperties("AWS::S3::BucketPolicy", {
      Bucket: "test-photo-bucket",
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Sid: "AllowCloudFrontListBucket",
            Effect: "Allow",
            Principal: {
              Service: "cloudfront.amazonaws.com",
            },
            Action: "s3:ListBucket",
            Resource: "arn:aws:s3:::test-photo-bucket",
            Condition: Match.objectLike({
              StringEquals: Match.objectLike({
                "AWS:SourceArn": Match.anyValue(),
              }),
            }),
          }),
        ]),
      },
    });
  });

  test("creates CloudFront distribution", () => {
    template.resourceCountIs("AWS::CloudFront::Distribution", 1);
  });

  test("CloudFront distribution uses HTTPS redirect", () => {
    template.hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: Match.objectLike({
        DefaultCacheBehavior: Match.objectLike({
          ViewerProtocolPolicy: "redirect-to-https",
        }),
      }),
    });
  });

  test("outputs CloudFront domain", () => {
    template.hasOutput("CloudFrontDomain", {});
    template.hasOutput("CloudFrontDistributionId", {});
  });
});
