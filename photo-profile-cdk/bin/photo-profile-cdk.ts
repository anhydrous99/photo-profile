#!/opt/homebrew/opt/node/bin/node
import * as cdk from "aws-cdk-lib/core";
import { PhotoProfileCdkStack } from "../lib/photo-profile-cdk-stack";

const app = new cdk.App();

const s3BucketName =
  app.node.tryGetContext("s3BucketName") ?? "photo-profile-bucket";
const dynamodbTablePrefix = app.node.tryGetContext("dynamodbTablePrefix") ?? "";

new PhotoProfileCdkStack(app, "PhotoProfileCdkStack", {
  s3BucketName,
  dynamodbTablePrefix,
});
