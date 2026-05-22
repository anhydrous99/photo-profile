# Go Image Worker Staging Smoke, Canary, and Rollback Runbook

This runbook is for staging only. Do not use it for production traffic, and do not cut production over to the Go image worker until Task 14 staging validation passes every check in this document.

The Go worker is opt in. Node remains the default image worker and the rollback target.

## Required Staging Inputs

Set these values before running any command. Use staging values only.

| Name                    | Required value                                                |
| ----------------------- | ------------------------------------------------------------- |
| `AWS_PROFILE`           | AWS CLI profile for the staging account                       |
| `AWS_REGION`            | AWS region for the staging stack                              |
| `CDK_STACK_NAME`        | CDK stack name, for example `PhotoProfileCdkStack`            |
| `IMAGE_WORKER_RUNTIME`  | `go` for forward deploy and smoke, `node` for rollback        |
| `S3_BUCKET`             | Staging photo bucket name                                     |
| `SQS_QUEUE_URL`         | Staging image processing queue URL                            |
| `DLQ_URL`               | Staging image processing DLQ URL                              |
| `DYNAMODB_TABLE_PREFIX` | Staging DynamoDB table prefix used by CDK and the app         |
| `PHOTO_ID`              | Existing staging photo UUID to smoke or repair                |
| `ORIGINAL_KEY`          | Existing original object key for `PHOTO_ID`                   |
| `PUBLIC_SITE_URL`       | Staging public site origin, with scheme and no trailing slash |

Optional for API reprocess:

| Name                   | Required value                                                  |
| ---------------------- | --------------------------------------------------------------- |
| `ADMIN_SESSION_COOKIE` | Value of a current staging `session` cookie from an admin login |

Use this shell setup pattern. Replace the sample values before running Task 14.

```bash
export AWS_PROFILE="staging"
export AWS_REGION="us-east-1"
export CDK_STACK_NAME="PhotoProfileCdkStack"
export IMAGE_WORKER_RUNTIME="go"
export S3_BUCKET="photo-profile-staging-bucket"
export SQS_QUEUE_URL="https://sqs.us-east-1.amazonaws.com/123456789012/photo-profile-staging-image-processing"
export DLQ_URL="https://sqs.us-east-1.amazonaws.com/123456789012/photo-profile-staging-image-processing-dlq"
export DYNAMODB_TABLE_PREFIX="staging_"
export PHOTO_ID="00000000-0000-4000-8000-000000000000"
export ORIGINAL_KEY="originals/00000000-0000-4000-8000-000000000000/original.jpg"
export PUBLIC_SITE_URL="https://staging.example.com"
export ADMIN_SESSION_COOKIE="redacted-session-cookie"
```

The frozen SQS payload shape is:

```json
{ "photoId": "string", "originalKey": "string" }
```

## Evidence Handling

Do not paste secrets into task evidence. Redact AWS account IDs, session cookies, signed URLs, access keys, and private bucket object URLs. Keep command names, resource names, status values, HTTP status codes, object keys under `processed/`, and CloudWatch success or error counts.

Good evidence keeps `PHOTO_ID`, processed derivative keys, `ready` or `error`, DLQ counts, and HTTP status codes. Bad evidence includes `ADMIN_SESSION_COOKIE`, access key IDs, secret access keys, or full presigned URLs.

## Preflight Checks

These checks prove the staging operator can deploy the Go container image and that the target photo can be processed.

1. Confirm Docker and Buildx are available because the Go CDK branch packages a Linux ARM64 Lambda container image.

```bash
docker version
docker buildx version
```

Pass: both commands exit zero.
Fail: either command is missing or exits nonzero. Stop and install Docker Desktop or Docker Engine with BuildKit and Buildx.

2. Confirm the original object exists.

```bash
aws s3api head-object \
  --bucket "$S3_BUCKET" \
  --key "$ORIGINAL_KEY" \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --query '{ContentType: ContentType, ContentLength: ContentLength}'
```

Pass: command exits zero and returns a content type plus content length.
Fail: command exits nonzero. Stop and choose a valid staging `PHOTO_ID` and `ORIGINAL_KEY`.

3. Confirm the target photo exists in DynamoDB.

```bash
aws dynamodb get-item \
  --table-name "${DYNAMODB_TABLE_PREFIX}Photos" \
  --key "{\"id\":{\"S\":\"$PHOTO_ID\"}}" \
  --projection-expression "id, #status" \
  --expression-attribute-names '{"#status":"status"}' \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --query 'Item'
```

Pass: output contains `id` and `status`.
Fail: output is null or empty. Stop and choose a valid staging photo.

4. Confirm the DLQ is empty before smoke.

```bash
aws sqs get-queue-attributes \
  --queue-url "$DLQ_URL" \
  --attribute-names ApproximateNumberOfMessages ApproximateNumberOfMessagesNotVisible \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --query 'Attributes'
```

Pass: `ApproximateNumberOfMessages` is `0` and `ApproximateNumberOfMessagesNotVisible` is `0`.
Fail: either value is not `0`. Stop and inspect the DLQ before starting a clean smoke.

## Forward Deploy to Go in Staging

Context wins over the environment selector, so the deploy commands pass `IMAGE_WORKER_RUNTIME` both ways. Keep `IMAGE_WORKER_RUNTIME=go` only for this staging forward path.

1. Build the Go Lambda container locally as a packaging preflight.

```bash
npm run build:lambda:go
```

Pass: command exits zero and reports a Linux ARM64 image.
Fail: command exits nonzero. Stop before CDK deploy.

2. Review the Go CDK diff.

```bash
(cd photo-profile-cdk && IMAGE_WORKER_RUNTIME=go npx cdk diff "$CDK_STACK_NAME" \
  -c s3BucketName="$S3_BUCKET" \
  -c dynamodbTablePrefix="$DYNAMODB_TABLE_PREFIX" \
  -c IMAGE_WORKER_RUNTIME=go \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION")
```

Pass: diff replaces or updates only the staging image worker Lambda packaging and related image asset wiring expected for the Go container branch.
Fail: diff touches production resources, unrelated tables, or deletes retained data resources. Stop and do not deploy.

3. Synthesize the staging Go stack.

```bash
(cd photo-profile-cdk && IMAGE_WORKER_RUNTIME=go npx cdk synth "$CDK_STACK_NAME" \
  -c s3BucketName="$S3_BUCKET" \
  -c dynamodbTablePrefix="$DYNAMODB_TABLE_PREFIX" \
  -c IMAGE_WORKER_RUNTIME=go \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION")
```

Pass: synth exits zero. The generated Lambda worker uses the Go image package path.
Fail: synth exits nonzero. Stop and keep Node deployed.

4. Deploy the Go worker to staging.

```bash
(cd photo-profile-cdk && IMAGE_WORKER_RUNTIME=go npx cdk deploy "$CDK_STACK_NAME" \
  -c s3BucketName="$S3_BUCKET" \
  -c dynamodbTablePrefix="$DYNAMODB_TABLE_PREFIX" \
  -c IMAGE_WORKER_RUNTIME=go \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --require-approval never)
```

Pass: deploy exits zero and the image worker Lambda environment contains `IMAGE_WORKER_RUNTIME=go`.
Fail: deploy exits nonzero. Start the rollback path if staging has drifted or the Lambda was partially updated.

5. Confirm the deployed Lambda runtime selector.

```bash
IMAGE_WORKER_FUNCTION_NAME=$(aws cloudformation describe-stack-resources \
  --stack-name "$CDK_STACK_NAME" \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --query "StackResources[?starts_with(LogicalResourceId, 'ImageProcessor') && ResourceType == 'AWS::Lambda::Function'].PhysicalResourceId | [0]" \
  --output text)

aws lambda get-function-configuration \
  --function-name "$IMAGE_WORKER_FUNCTION_NAME" \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --query '{PackageType: PackageType, RuntimeSelector: Environment.Variables.IMAGE_WORKER_RUNTIME}'
```

Pass: `PackageType` is `Image` and `RuntimeSelector` is `go`.
Fail: either value differs. Stop and rollback to Node.

## Go Smoke and Canary

Run this section after the staging Go deploy passes. Use one known staging photo first. Do not start a broader canary until every binary check passes for that photo.

1. Inject one SQS smoke message using the frozen payload shape.

```bash
aws sqs send-message \
  --queue-url "$SQS_QUEUE_URL" \
  --message-body "{\"photoId\":\"$PHOTO_ID\",\"originalKey\":\"$ORIGINAL_KEY\"}" \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --query 'MessageId' \
  --output text
```

Pass: command prints one SQS message ID.
Fail: command exits nonzero. Stop and fix queue access or the queue URL.

2. Wait up to three minutes, then confirm DynamoDB status is `ready`.

```bash
aws dynamodb get-item \
  --table-name "${DYNAMODB_TABLE_PREFIX}Photos" \
  --key "{\"id\":{\"S\":\"$PHOTO_ID\"}}" \
  --projection-expression "#status, updatedAt, derivatives" \
  --expression-attribute-names '{"#status":"status"}' \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --query 'Item.status.S' \
  --output text
```

Pass: output is exactly `ready`.
Fail: output is `error`, empty, or any other value. Stop the Go canary and start rollback.

3. Treat `error` as a failure signal.

```bash
aws dynamodb get-item \
  --table-name "${DYNAMODB_TABLE_PREFIX}Photos" \
  --key "{\"id\":{\"S\":\"$PHOTO_ID\"}}" \
  --projection-expression "#status" \
  --expression-attribute-names '{"#status":"status"}' \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --query 'Item.status.S' \
  --output text
```

Pass: output is not `error`.
Fail: output is exactly `error`. Stop and rollback.

4. Confirm S3 derivatives and content types. Large originals should produce all eight objects. Small originals can skip wider sizes due to the no upscale contract, so use a smoke photo that is at least 2400 pixels wide when the goal is a full canary.

```bash
for width in 300 600 1200 2400; do
  for format in webp avif; do
    if [ "$format" = "webp" ]; then expected="image/webp"; else expected="image/avif"; fi
    actual=$(aws s3api head-object \
      --bucket "$S3_BUCKET" \
      --key "processed/${PHOTO_ID}/${width}w.${format}" \
      --profile "$AWS_PROFILE" \
      --region "$AWS_REGION" \
      --query 'ContentType' \
      --output text)
    printf '%s %s\n' "processed/${PHOTO_ID}/${width}w.${format}" "$actual"
    test "$actual" = "$expected"
  done
done
```

Pass: every `head-object` exits zero and prints the expected content type for each derivative.
Fail: any object is missing, any command exits nonzero, or any content type differs. Stop and rollback.

5. Confirm the DLQ visible count is zero after smoke.

```bash
aws sqs get-queue-attributes \
  --queue-url "$DLQ_URL" \
  --attribute-names ApproximateNumberOfMessages ApproximateNumberOfMessagesNotVisible \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --query 'Attributes'
```

Pass: both returned counts are `0`.
Fail: either count is not `0`. Stop and rollback.

6. Confirm the public image endpoint returns HTTP 200 for one processed derivative.

```bash
curl -sS -o /dev/null -w '%{http_code}\n' \
  "$PUBLIC_SITE_URL/api/images/$PHOTO_ID/300w.webp"
```

Pass: output is exactly `200`.
Fail: output is not `200`. Stop and rollback.

7. Confirm CloudWatch success logs and no CloudWatch error logs for the photo.

```bash
IMAGE_WORKER_LOG_GROUP_NAME=$(aws cloudformation describe-stack-resources \
  --stack-name "$CDK_STACK_NAME" \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --query "StackResources[?starts_with(LogicalResourceId, 'ImageProcessorLogGroup') && ResourceType == 'AWS::Logs::LogGroup'].PhysicalResourceId | [0]" \
  --output text)

aws logs filter-log-events \
  --log-group-name "$IMAGE_WORKER_LOG_GROUP_NAME" \
  --filter-pattern "{ $.photoId = \"$PHOTO_ID\" && $.message = \"Lambda image processing record completed\" }" \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --query 'length(events)' \
  --output text

aws logs filter-log-events \
  --log-group-name "$IMAGE_WORKER_LOG_GROUP_NAME" \
  --filter-pattern "{ $.photoId = \"$PHOTO_ID\" && $.level = \"error\" }" \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --query 'length(events)' \
  --output text
```

Pass: the first command returns `1` or greater, and the second command returns `0`.
Fail: the first command returns `0`, or the second command returns greater than `0`. Stop and rollback.

8. Canary only after all smoke checks pass. Repeat the SQS injection and all checks for a small staging batch of representative JPEG, PNG, WebP, HEIC, and HEIF originals. Keep the batch small enough that every photo can be checked manually.

Pass: every canary photo has `ready`, expected derivatives for its source width, zero DLQ count, HTTP 200 for at least one derivative, success logs, and zero photo scoped error logs.
Fail: any photo fails one binary check. Stop the canary and rollback.

## Reprocess Command

The admin reprocess route is useful for repairing a failed or stale staging photo. It verifies the admin session, rejects missing photos, rejects photos already in `ready`, resets the photo to `processing`, finds the original file, and enqueues the same frozen SQS payload shape through the app path.

Only run this command when the photo status is not `ready`.

```bash
curl -sS -X POST \
  "$PUBLIC_SITE_URL/api/admin/photos/$PHOTO_ID/reprocess" \
  -H "Cookie: session=$ADMIN_SESSION_COOKIE" \
  -H 'Content-Type: application/json'
```

Pass: response body contains `"status":"processing"`.
Fail: response is `401`, `404`, `400`, or any body without `"status":"processing"`. If the photo is already `ready`, use SQS injection for smoke instead of reprocess.

## Rollback to Node

Start rollback immediately if any Go smoke or canary check fails, if DynamoDB reports `error`, if the DLQ count is nonzero, if public image fetch returns anything other than HTTP 200, or if CloudWatch records a photo scoped error.

1. Force the runtime selector to Node.

```bash
export IMAGE_WORKER_RUNTIME="node"
```

Pass: `printf '%s\n' "$IMAGE_WORKER_RUNTIME"` prints `node`.
Fail: it prints anything else. Stop before deploy.

2. Review the Node CDK diff.

```bash
(cd photo-profile-cdk && IMAGE_WORKER_RUNTIME=node npx cdk diff "$CDK_STACK_NAME" \
  -c s3BucketName="$S3_BUCKET" \
  -c dynamodbTablePrefix="$DYNAMODB_TABLE_PREFIX" \
  -c IMAGE_WORKER_RUNTIME=node \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION")
```

Pass: diff restores the Node Lambda zip packaging and does not delete retained data resources.
Fail: diff touches unrelated resources. Stop and inspect before deploy.

3. Synthesize the Node rollback stack.

```bash
(cd photo-profile-cdk && IMAGE_WORKER_RUNTIME=node npx cdk synth "$CDK_STACK_NAME" \
  -c s3BucketName="$S3_BUCKET" \
  -c dynamodbTablePrefix="$DYNAMODB_TABLE_PREFIX" \
  -c IMAGE_WORKER_RUNTIME=node \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION")
```

Pass: synth exits zero and the image worker branch is Node.
Fail: synth exits nonzero. Stop and keep investigating with staging isolated.

4. Deploy Node rollback to staging.

```bash
(cd photo-profile-cdk && IMAGE_WORKER_RUNTIME=node npx cdk deploy "$CDK_STACK_NAME" \
  -c s3BucketName="$S3_BUCKET" \
  -c dynamodbTablePrefix="$DYNAMODB_TABLE_PREFIX" \
  -c IMAGE_WORKER_RUNTIME=node \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --require-approval never)
```

Pass: deploy exits zero and the image worker Lambda environment contains `IMAGE_WORKER_RUNTIME=node`.
Fail: deploy exits nonzero. Keep staging isolated and escalate.

5. Confirm the deployed Lambda runtime selector is Node.

```bash
IMAGE_WORKER_FUNCTION_NAME=$(aws cloudformation describe-stack-resources \
  --stack-name "$CDK_STACK_NAME" \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --query "StackResources[?starts_with(LogicalResourceId, 'ImageProcessor') && ResourceType == 'AWS::Lambda::Function'].PhysicalResourceId | [0]" \
  --output text)

aws lambda get-function-configuration \
  --function-name "$IMAGE_WORKER_FUNCTION_NAME" \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --query '{PackageType: PackageType, RuntimeSelector: Environment.Variables.IMAGE_WORKER_RUNTIME}'
```

Pass: `RuntimeSelector` is `node`.
Fail: `RuntimeSelector` is not `node`. Do not reprocess until Node is active.

6. Reprocess the failed staging photo through the app path if it is not `ready`.

```bash
curl -sS -X POST \
  "$PUBLIC_SITE_URL/api/admin/photos/$PHOTO_ID/reprocess" \
  -H "Cookie: session=$ADMIN_SESSION_COOKIE" \
  -H 'Content-Type: application/json'
```

Pass: response body contains `"status":"processing"`.
Fail: response is not accepted. Use the direct SQS injection below only after confirming Node is deployed.

7. Redrive the DLQ only if messages are visible in the DLQ.

```bash
DLQ_ARN=$(aws sqs get-queue-attributes \
  --queue-url "$DLQ_URL" \
  --attribute-names QueueArn \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --query 'Attributes.QueueArn' \
  --output text)

SQS_QUEUE_ARN=$(aws sqs get-queue-attributes \
  --queue-url "$SQS_QUEUE_URL" \
  --attribute-names QueueArn \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --query 'Attributes.QueueArn' \
  --output text)

aws sqs start-message-move-task \
  --source-arn "$DLQ_ARN" \
  --destination-arn "$SQS_QUEUE_ARN" \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION"
```

Pass: command exits zero and returns a task handle.
Fail: command exits nonzero. Do not purge the DLQ. Inspect the message and retry rollback repair manually.

8. If reprocess was not available and no DLQ redrive was needed, inject one Node repair message.

```bash
aws sqs send-message \
  --queue-url "$SQS_QUEUE_URL" \
  --message-body "{\"photoId\":\"$PHOTO_ID\",\"originalKey\":\"$ORIGINAL_KEY\"}" \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --query 'MessageId' \
  --output text
```

Pass: command prints one SQS message ID.
Fail: command exits nonzero. Stop and fix queue access.

9. Verify Node repaired or produced the derivatives.

```bash
aws dynamodb get-item \
  --table-name "${DYNAMODB_TABLE_PREFIX}Photos" \
  --key "{\"id\":{\"S\":\"$PHOTO_ID\"}}" \
  --projection-expression "#status, updatedAt, derivatives" \
  --expression-attribute-names '{"#status":"status"}' \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --query 'Item.status.S' \
  --output text

aws s3api head-object \
  --bucket "$S3_BUCKET" \
  --key "processed/${PHOTO_ID}/300w.webp" \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --query 'ContentType' \
  --output text

curl -sS -o /dev/null -w '%{http_code}\n' \
  "$PUBLIC_SITE_URL/api/images/$PHOTO_ID/300w.webp"
```

Pass: DynamoDB returns `ready`, S3 content type returns `image/webp`, and curl returns `200`.
Fail: any value differs. Keep Node deployed and continue staging incident review.

10. Confirm the DLQ count is zero after rollback repair.

```bash
aws sqs get-queue-attributes \
  --queue-url "$DLQ_URL" \
  --attribute-names ApproximateNumberOfMessages ApproximateNumberOfMessagesNotVisible \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --query 'Attributes'
```

Pass: both returned counts are `0`.
Fail: either count is not `0`. Keep Node deployed and inspect the DLQ messages.

## Final Task 14 Decision

Task 14 may pass the staging Go validation only when all of these are true:

1. CDK diff, synth, and deploy succeed with `IMAGE_WORKER_RUNTIME=go` in staging.
2. The Go worker Lambda reports `PackageType` as `Image` and `RuntimeSelector` as `go`.
3. SQS smoke injection accepts `{ "photoId": string, "originalKey": string }`.
4. DynamoDB returns `ready` for every smoke and canary photo.
5. DynamoDB never returns `error` for any smoke or canary photo.
6. S3 has expected `processed/{PHOTO_ID}/{width}w.webp` and `processed/{PHOTO_ID}/{width}w.avif` derivatives with `image/webp` and `image/avif` content types.
7. DLQ visible and not visible counts remain zero.
8. Public image fetch returns HTTP `200` for at least one processed derivative per photo.
9. CloudWatch has one or more success logs and zero photo scoped error logs.
10. Rollback has been dry reviewed and can force Node, deploy Node, repair or redrive a failed photo, verify derivatives, and confirm DLQ zero.

If any item fails, Task 14 fails and production cutover remains forbidden.
