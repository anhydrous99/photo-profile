import * as cdk from "aws-cdk-lib/core";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as logs from "aws-cdk-lib/aws-logs";
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
  public readonly photosTable: dynamodb.Table;
  public readonly albumsTable: dynamodb.Table;
  public readonly albumPhotosTable: dynamodb.Table;
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: PhotoProfileStackProps) {
    super(scope, id, props);

    const tablePrefix = props.dynamodbTablePrefix ?? "";

    // DynamoDB Tables
    this.photosTable = new dynamodb.Table(this, "PhotosTable", {
      tableName: `${tablePrefix}Photos`,
      partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    this.photosTable.addGlobalSecondaryIndex({
      indexName: "status-createdAt-index",
      partitionKey: { name: "status", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "createdAt", type: dynamodb.AttributeType.NUMBER },
      projectionType: dynamodb.ProjectionType.ALL,
    });
    this.photosTable.addGlobalSecondaryIndex({
      indexName: "createdAt-index",
      partitionKey: { name: "_type", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "createdAt", type: dynamodb.AttributeType.NUMBER },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    this.albumsTable = new dynamodb.Table(this, "AlbumsTable", {
      tableName: `${tablePrefix}Albums`,
      partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    this.albumsTable.addGlobalSecondaryIndex({
      indexName: "isPublished-sortOrder-index",
      partitionKey: {
        name: "isPublished",
        type: dynamodb.AttributeType.NUMBER,
      },
      sortKey: { name: "sortOrder", type: dynamodb.AttributeType.NUMBER },
      projectionType: dynamodb.ProjectionType.ALL,
    });
    this.albumsTable.addGlobalSecondaryIndex({
      indexName: "sortOrder-index",
      partitionKey: { name: "_type", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sortOrder", type: dynamodb.AttributeType.NUMBER },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    this.albumPhotosTable = new dynamodb.Table(this, "AlbumPhotosTable", {
      tableName: `${tablePrefix}AlbumPhotos`,
      partitionKey: { name: "albumId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "photoId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    this.albumPhotosTable.addGlobalSecondaryIndex({
      indexName: "photoId-albumId-index",
      partitionKey: { name: "photoId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "albumId", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    const bucket = s3.Bucket.fromBucketName(
      this,
      "PhotoBucket",
      props.s3BucketName,
    );

    this.distribution = new cloudfront.Distribution(this, "CDN", {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
      },
      comment: "Photo Profile CDN - serves processed images from S3",
    });

    // S3 bucket policy for CloudFront access
    // Includes both s3:GetObject (on bucket/*) and s3:ListBucket (on bucket)
    // to enable proper 404 responses for missing objects
    new s3.CfnBucketPolicy(this, "BucketPolicy", {
      bucket: props.s3BucketName,
      policyDocument: {
        Version: "2012-10-17",
        Statement: [
          {
            Sid: "AllowCloudFrontGetObject",
            Effect: "Allow",
            Principal: {
              Service: "cloudfront.amazonaws.com",
            },
            Action: "s3:GetObject",
            Resource: `arn:aws:s3:::${props.s3BucketName}/*`,
            Condition: {
              StringEquals: {
                "AWS:SourceArn": this.distribution.distributionArn,
              },
            },
          },
          {
            Sid: "AllowCloudFrontListBucket",
            Effect: "Allow",
            Principal: {
              Service: "cloudfront.amazonaws.com",
            },
            Action: "s3:ListBucket",
            Resource: `arn:aws:s3:::${props.s3BucketName}`,
            Condition: {
              StringEquals: {
                "AWS:SourceArn": this.distribution.distributionArn,
              },
            },
          },
        ],
      },
    });

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

    const imageProcessorLogGroup = new logs.LogGroup(
      this,
      "ImageProcessorLogGroup",
      {
        retention: logs.RetentionDays.ONE_MONTH,
      },
    );

    this.imageProcessor = new lambda.Function(this, "ImageProcessor", {
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      handler: "src/infrastructure/jobs/lambdaHandler.handler",
      code: lambda.Code.fromAsset("../lambda-package"),
      timeout: cdk.Duration.seconds(120),
      memorySize: 2048,
      ephemeralStorageSize: cdk.Size.mebibytes(1024),
      environment: {
        AWS_S3_BUCKET: props.s3BucketName,
        AWS_CLOUDFRONT_DOMAIN: this.distribution.distributionDomainName,
        DYNAMODB_TABLE_PREFIX: tablePrefix,
        STORAGE_BACKEND: "s3",
        STORAGE_PATH: "",
        NODE_ENV: "production",
        LOG_LEVEL: "info",
        AUTH_SECRET: "dummy-not-used-by-lambda-at-all!",
        ADMIN_PASSWORD_HASH: "dummy-not-used-by-lambda",
      },
      description:
        "Processes uploaded photos: generates derivatives, extracts EXIF data",
      logGroup: imageProcessorLogGroup,
    });

    this.imageProcessor.addEventSource(
      new SqsEventSource(this.queue, {
        batchSize: 1,
      }),
    );

    this.imageProcessor.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:HeadObject",
        ],
        resources: [`arn:aws:s3:::${props.s3BucketName}/*`],
      }),
    );

    this.imageProcessor.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:ListBucket"],
        resources: [`arn:aws:s3:::${props.s3BucketName}`],
      }),
    );

    this.imageProcessor.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:BatchGetItem",
          "dynamodb:BatchWriteItem",
        ],
        resources: [
          this.photosTable.tableArn,
          `${this.photosTable.tableArn}/index/*`,
          this.albumsTable.tableArn,
          `${this.albumsTable.tableArn}/index/*`,
          this.albumPhotosTable.tableArn,
          `${this.albumPhotosTable.tableArn}/index/*`,
        ],
      }),
    );

    // Vercel IAM user for app deployment
    const vercelUser = new iam.User(this, "VercelAppUser", {
      userName: `${id}-vercel-app`,
    });

    const vercelAccessKey = new iam.AccessKey(this, "VercelAppAccessKey", {
      user: vercelUser,
    });

    // S3 permissions (object-level)
    vercelUser.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:HeadObject",
        ],
        resources: [`arn:aws:s3:::${props.s3BucketName}/*`],
      }),
    );

    // S3 permissions (bucket-level)
    vercelUser.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:ListBucket"],
        resources: [`arn:aws:s3:::${props.s3BucketName}`],
      }),
    );

    // DynamoDB permissions (data-plane only)
    vercelUser.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:BatchGetItem",
          "dynamodb:BatchWriteItem",
        ],
        resources: [
          this.photosTable.tableArn,
          `${this.photosTable.tableArn}/index/*`,
          this.albumsTable.tableArn,
          `${this.albumsTable.tableArn}/index/*`,
          this.albumPhotosTable.tableArn,
          `${this.albumPhotosTable.tableArn}/index/*`,
        ],
      }),
    );

    // DynamoDB ListTables (health endpoint)
    vercelUser.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["dynamodb:ListTables"],
        resources: ["*"],
      }),
    );

    // SQS SendMessage (enqueue image processing jobs)
    vercelUser.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["sqs:SendMessage"],
        resources: [this.queue.queueArn],
      }),
    );

    new cdk.CfnOutput(this, "CloudFrontDomain", {
      value: this.distribution.distributionDomainName,
      description:
        "CloudFront distribution domain name (set as AWS_CLOUDFRONT_DOMAIN and NEXT_PUBLIC_CLOUDFRONT_DOMAIN)",
    });

    new cdk.CfnOutput(this, "CloudFrontDistributionId", {
      value: this.distribution.distributionId,
      description: "CloudFront distribution ID",
    });

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

    new cdk.CfnOutput(this, "VercelAccessKeyId", {
      value: vercelAccessKey.accessKeyId,
      description: "Vercel IAM user access key ID",
    });

    new cdk.CfnOutput(this, "VercelSecretAccessKey", {
      value: vercelAccessKey.secretAccessKey.unsafeUnwrap(),
      description: "Vercel IAM user secret access key (store securely)",
    });
  }
}
