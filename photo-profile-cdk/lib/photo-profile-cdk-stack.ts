import * as cdk from "aws-cdk-lib/core";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as iam from "aws-cdk-lib/aws-iam";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";

export interface PhotoProfileStackProps extends cdk.StackProps {
  /**
   * S3 bucket name for photo storage.
   */
  readonly s3BucketName: string;

  /**
   * DynamoDB table prefix (e.g. "prod_" or "dev_").
   * @default ""
   */
  readonly dynamodbTablePrefix?: string;
}

export class PhotoProfileCdkStack extends cdk.Stack {
  public readonly queue: sqs.Queue;
  public readonly deadLetterQueue: sqs.Queue;
  public readonly imageProcessor: lambda.Function;

  constructor(scope: Construct, id: string, props: PhotoProfileStackProps) {
    super(scope, id, props);

    const tablePrefix = props.dynamodbTablePrefix ?? "";

    this.deadLetterQueue = new sqs.Queue(this, "ImageProcessingDLQ", {
      queueName: `${id}-image-processing-dlq`,
      retentionPeriod: cdk.Duration.days(14),
    });

    this.queue = new sqs.Queue(this, "ImageProcessingQueue", {
      queueName: `${id}-image-processing`,
      visibilityTimeout: cdk.Duration.seconds(180),
      deadLetterQueue: {
        queue: this.deadLetterQueue,
        maxReceiveCount: 3,
      },
    });

    this.imageProcessor = new lambda.Function(this, "ImageProcessor", {
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      handler: "src/infrastructure/jobs/lambdaHandler.handler",
      code: lambda.Code.fromAsset("../lambda-package"),
      timeout: cdk.Duration.seconds(120),
      memorySize: 2048,
      ephemeralStorageSize: cdk.Size.mebibytes(1024),
      reservedConcurrentExecutions: 5,
      environment: {
        AWS_S3_BUCKET: props.s3BucketName,
        DYNAMODB_TABLE_PREFIX: tablePrefix,
        STORAGE_BACKEND: "s3",
        STORAGE_PATH: "",
        AUTH_SECRET: "dummy-not-used-by-lambda",
        ADMIN_PASSWORD_HASH: "dummy-not-used-by-lambda",
      },
      description:
        "Processes uploaded photos: generates derivatives, extracts EXIF data",
    });

    this.imageProcessor.addEventSource(
      new SqsEventSource(this.queue, {
        batchSize: 1,
      }),
    );

    this.imageProcessor.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:GetObject", "s3:PutObject"],
        resources: [`arn:aws:s3:::${props.s3BucketName}/*`],
      }),
    );

    this.imageProcessor.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
        ],
        resources: [
          `arn:aws:dynamodb:${this.region}:${this.account}:table/${tablePrefix}photos`,
        ],
      }),
    );

    new cdk.CfnOutput(this, "QueueUrl", {
      value: this.queue.queueUrl,
      description: "SQS Queue URL for image processing",
    });

    new cdk.CfnOutput(this, "QueueArn", {
      value: this.queue.queueArn,
      description: "SQS Queue ARN for image processing",
    });

    new cdk.CfnOutput(this, "LambdaFunctionArn", {
      value: this.imageProcessor.functionArn,
      description: "Lambda function ARN for image processing",
    });

    new cdk.CfnOutput(this, "DLQUrl", {
      value: this.deadLetterQueue.queueUrl,
      description: "Dead letter queue URL",
    });
  }
}
