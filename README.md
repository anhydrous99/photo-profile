# Photo Profile

A modern, high-performance photography portfolio built with **Next.js 16**, following **Clean Architecture** principles. Designed for **Vercel serverless deployment** with AWS Lambda + SQS for image processing. Leverages **DynamoDB** for data storage and flexible storage options (local filesystem or AWS S3 + CloudFront) for image delivery.

## 🚀 Key Features

- **Next.js 16 App Router**: Leveraging Server Components for optimal performance.
- **Clean Architecture**: Strict separation of concerns (Domain, Infrastructure, Presentation).
- **Serverless Deployment**: Vercel with AWS Lambda + SQS for scalable image processing.
- **Infrastructure as Code**: AWS CDK stack for Lambda, SQS, and IAM resources.
- **High-Performance Image Pipeline**:
  - Background processing with **AWS Lambda + SQS** for serverless scalability.
  - High-quality image derivatives (WebP, AVIF) using **Sharp**.
  - Automatic EXIF data extraction.
  - Smart image loading and progressive rendering.
- **Database**:
  - **DynamoDB** for production-grade data storage with local development support.
- **Flexible Storage**:
  - **Local Filesystem**: Simple setup for self-hosting.
  - **AWS S3 + CloudFront**: Scalable object storage with global CDN delivery.
- **Secure Admin Panel**:
  - JWT-based authentication (Jose) with timing attack prevention.
  - Rate limiting and brute-force protection (Upstash Redis for serverless compatibility).
  - Secure password hashing (Bcrypt).
  - IP validation with trusted proxy support.
- **Modern UI**: **Tailwind CSS v4** and **Geist** font family.

## 🛠 Tech Stack

- **Framework**: Next.js 16, React 19
- **Language**: TypeScript
- **Database**: DynamoDB
- **Queue**: AWS SQS + Lambda (serverless image processing)
- **Image Processing**: Sharp (ARM64 optimized for Lambda)
- **Storage**: Local Filesystem or AWS S3
- **Infrastructure**: AWS CDK
- **Styling**: Tailwind CSS v4
- **Testing**: Vitest, Playwright
- **Authentication**: JWT (Jose HS256), Bcrypt, Rate Limiting (Upstash Redis)

## 📋 Prerequisites

- **Node.js** (v20 or higher recommended)
- **AWS Account** (Required for DynamoDB, S3 storage, Lambda, and SQS)
- **Upstash Redis** (Required for rate limiting — serverless-compatible)
- **AWS CDK CLI** (Required for deploying Lambda + SQS infrastructure)

## 🏁 Getting Started

### 1. Installation

```bash
npm install
```

### 2. Environment Configuration

Create a `.env` file in the root directory. You can use the following template:

```env
# Required Core
AUTH_SECRET=your-super-secret-key-at-least-32-chars-long
ADMIN_PASSWORD_HASH= # Generated in step 3

# Database: DynamoDB
# DYNAMODB_ENDPOINT=http://localhost:8000  # Local development only
# DYNAMODB_TABLE_PREFIX=dev_                # Optional prefix for local testing

# Storage Configuration (Choose one)
# Option A: Local Filesystem (Default for local dev)
STORAGE_BACKEND=filesystem
STORAGE_PATH=./storage  # Optional when STORAGE_BACKEND=s3

# Option B: AWS S3 + CloudFront (Required for Vercel)
# STORAGE_BACKEND=s3
# NEXT_PUBLIC_STORAGE_BACKEND=s3  # Must match STORAGE_BACKEND — used by upload page
# AWS_REGION=us-east-1
# AWS_S3_BUCKET=your-bucket-name
# AWS_CLOUDFRONT_DOMAIN=d12345.cloudfront.net
# AWS_ACCESS_KEY_ID=your-access-key
# AWS_SECRET_ACCESS_KEY=your-secret-key
# NEXT_PUBLIC_CLOUDFRONT_DOMAIN=d12345.cloudfront.net

# Queue Backend (SQS for Vercel/Lambda)
SQS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/123456789/photo-profile-queue

# Rate Limiting (Upstash Redis - Required)
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token

# Optional (Defaults)
# NODE_ENV=development
# LOG_LEVEL=info
# NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Ensure the `storage` directory (if using filesystem) exists or is writable.

### 3. Generate Admin Password

Use the included helper script to generate a secure bcrypt hash for your admin password:

```bash
npx tsx scripts/hash-password.ts "your-secure-password"
```

Copy the output hash into your `.env` file as `ADMIN_PASSWORD_HASH`.

### 4. Database Setup

**DynamoDB**

Tables are created automatically on first run. For local development with Docker Compose, tables are provisioned during startup. If developing without Docker, you can set `DYNAMODB_ENDPOINT=http://localhost:8000` to use a local DynamoDB instance.

## 🏃‍♂️ Running the Application

### Local Development

Start the Next.js development server:

```bash
npm run dev
```

The app will be available at http://localhost:3000.

**Note**: Image processing requires Lambda + SQS infrastructure. For local development, you can:

- Deploy the CDK stack to AWS (see below)
- Set `SQS_QUEUE_URL` in your `.env` file
- Images will be processed via Lambda when uploaded

### Vercel Deployment (Production)

Deploy to Vercel with AWS Lambda + SQS for image processing:

1. **Deploy CDK Infrastructure**

   ```bash
   cd photo-profile-cdk
   npm install
   npx cdk bootstrap  # First time only
   npx cdk deploy --context s3BucketName=your-bucket --context dynamodbTablePrefix=prod_
   ```

   Copy the `QueueUrl` from the CDK output.

2. **Connect Repository to Vercel**
   - Import your repository in the Vercel dashboard
   - Configure environment variables (see below)

3. **Set Environment Variables in Vercel**

   ```env
   # Queue Backend (Required)
   SQS_QUEUE_URL=<from CDK output>

    # Storage (Required)
    STORAGE_BACKEND=s3
    NEXT_PUBLIC_STORAGE_BACKEND=s3  # Must match STORAGE_BACKEND — used by upload page
    AWS_S3_BUCKET=<your-bucket>
    AWS_REGION=<your-region>
    AWS_CLOUDFRONT_DOMAIN=<your-cloudfront-domain>
    NEXT_PUBLIC_CLOUDFRONT_DOMAIN=<your-cloudfront-domain>

   # Authentication (Required)
   AUTH_SECRET=<your-secret-key-at-least-32-chars>
   ADMIN_PASSWORD_HASH=<generated-hash>

   # Database (Required)
   DYNAMODB_TABLE_PREFIX=prod_  # Must match CDK context

   # Rate Limiting (Required - Upstash Redis)
   UPSTASH_REDIS_REST_URL=<your-upstash-redis-url>
   UPSTASH_REDIS_REST_TOKEN=<your-upstash-token>

   # AWS Credentials (Required)
   AWS_ACCESS_KEY_ID=<your-access-key>
   AWS_SECRET_ACCESS_KEY=<your-secret-key>

   # Site URL (Required)
   NEXT_PUBLIC_SITE_URL=https://your-domain.vercel.app
   ```

4. **Deploy**

   Vercel will automatically deploy on push to your main branch. Image processing happens via Lambda (no worker process needed).

## 📂 Project Structure

This project follows Clean Architecture:

```
src/
├── domain/              # Pure business entities & repository interfaces (No dependencies)
├── application/         # Application use cases (Logic lives in infra/API in this project)
├── infrastructure/      # Database, Auth, Image Processing, File System implementations
├── presentation/        # React Components (UI)
└── app/                 # Next.js App Router (Pages & API Routes)
```

## 🏗️ Architecture

The application uses a serverless architecture optimized for Vercel deployment:

```
Client → Next.js (Vercel) → SQS → Lambda → Sharp → S3 + CloudFront
                                              ↓
                                          DynamoDB
```

- **Queue**: AWS SQS
- **Image Processing**: Lambda function (Node.js 22.x, ARM64, 120s timeout, 2048MB memory)
- **Storage**: S3 + CloudFront (required)
- **Deployment**: Vercel + AWS CDK

## 📜 Scripts

| Command                 | Description                                      |
| ----------------------- | ------------------------------------------------ |
| **Development**         |                                                  |
| `npm run dev`           | Start Next.js dev server (http://localhost:3000) |
| **Build & Production**  |                                                  |
| `npm run build`         | Build for production (standalone output)         |
| `npm run build:lambda`  | Build Lambda package with Sharp ARM64 binary     |
| `npm run start`         | Start production server                          |
| `npm run analyze`       | Analyze webpack bundle size                      |
| **Code Quality**        |                                                  |
| `npm run lint`          | Run ESLint                                       |
| `npm run lint:fix`      | Run ESLint with auto-fix                         |
| `npm run format`        | Format code with Prettier                        |
| `npm run format:check`  | Check formatting without modifying files         |
| `npm run typecheck`     | Run TypeScript type checking                     |
| **Testing**             |                                                  |
| `npm run test`          | Run all tests with Vitest                        |
| `npm run test:watch`    | Run tests in watch mode                          |
| `npm run test:pipeline` | E2E test: verify image processing pipeline       |
| **Utilities**           |                                                  |
| `npm run prepare`       | Setup Husky pre-commit hooks                     |

## ☁️ CDK Infrastructure

The `photo-profile-cdk/` directory contains AWS CDK infrastructure for serverless deployment:

### Resources Provisioned

- **Lambda Function**:
  - Runtime: Node.js 22.x on ARM64
  - Memory: 2048MB, Timeout: 120s
  - Ephemeral storage: 1024MB (`/tmp`)
  - Concurrency limit: 5
  - Handler: `src/infrastructure/jobs/lambdaHandler.handler`
- **SQS Queue**:
  - Standard queue with 180s visibility timeout
  - Dead Letter Queue (DLQ) with 14-day retention
  - Max receive count: 3 (messages move to DLQ after 3 failed attempts)
- **IAM Roles**:
  - S3: `GetObject`, `PutObject` permissions
  - DynamoDB: `GetItem`, `PutItem`, `UpdateItem` permissions
  - CloudWatch Logs: Full access for Lambda logging

### Deployment

```bash
cd photo-profile-cdk
npm install

# Bootstrap CDK (first time only)
npx cdk bootstrap

# Deploy with context parameters
npx cdk deploy \
  --context s3BucketName=your-bucket \
  --context dynamodbTablePrefix=prod_
```

**Context Parameters:**

- `s3BucketName` (required): S3 bucket name for image storage
- `dynamodbTablePrefix` (optional): DynamoDB table prefix (default: empty string)

**Outputs:**

- `QueueUrl`: SQS queue URL (set as `SQS_QUEUE_URL` in Vercel)
- `QueueArn`: SQS queue ARN
- `LambdaFunctionArn`: Lambda function ARN
- `DLQUrl`: Dead Letter Queue URL

### Testing CDK Stack

```bash
cd photo-profile-cdk
npm test  # Run Jest tests for infrastructure
```

### S3 CORS Configuration

When using S3 as the storage backend (`STORAGE_BACKEND=s3`), you must configure CORS on your S3 bucket to allow direct browser uploads via presigned URLs.

**Why CORS is Required:**

Direct browser uploads to S3 require the bucket to allow `PUT` requests from your application's domain. Without CORS configuration, browsers will block the upload with a cross-origin error.

**Configure CORS:**

Use the provided script to apply CORS configuration:

```bash
./scripts/configure-s3-cors.sh <bucket-name> <allowed-origin>
```

**Examples:**

```bash
# For Vercel production deployment
./scripts/configure-s3-cors.sh my-photo-bucket https://mysite.vercel.app

# For local development
./scripts/configure-s3-cors.sh my-photo-bucket http://localhost:3000

# For multiple origins, run the script multiple times
./scripts/configure-s3-cors.sh my-photo-bucket https://mysite.vercel.app
./scripts/configure-s3-cors.sh my-photo-bucket http://localhost:3000
```

**CORS Configuration Details:**

The script applies the following CORS rules:

- **AllowedOrigins**: Your application domain (no wildcards for security)
- **AllowedMethods**: `PUT` only (required for uploads)
- **AllowedHeaders**: `Content-Type` (required for multipart uploads)
- **ExposeHeaders**: `ETag` (required to read upload response)
- **MaxAgeSeconds**: 3600 (1 hour cache for preflight requests)

**Verify Configuration:**

```bash
aws s3api get-bucket-cors --bucket my-photo-bucket
```

## 🔒 Security Features

The admin panel includes multiple layers of security:

- **JWT Authentication**: Tokens expire after 8 hours (configurable)
- **Password Hashing**: Bcrypt with security best practices
- **Timing Attack Prevention**: Constant-time password comparison + random jitter
- **Rate Limiting**: Upstash Redis rate limiter (5 attempts per 15 minutes, serverless-compatible)
- **IP Validation**: Trusted proxy support to prevent IP spoofing attacks
- **EXIF Privacy**: Only 11 safe metadata fields exposed (no GPS, camera serial, software info)
- **HttpOnly Cookies**: Session tokens stored in secure, HTTP-only cookies

## 🐛 Troubleshooting

### Images stay in "Processing" state

**Cause**: Lambda function failed or SQS message processing error.

**Solution**:

1. Check Lambda logs in CloudWatch:
   ```bash
   aws logs tail /aws/lambda/PhotoProfileImageProcessor --follow
   ```
2. Check SQS Dead Letter Queue for failed messages:
   ```bash
   aws sqs receive-message --queue-url <DLQ-URL-from-CDK-output>
   ```
3. Verify Lambda has correct IAM permissions for S3 and DynamoDB
4. Check Lambda timeout (120s) is sufficient for large images
5. Verify `SQS_QUEUE_URL` is correctly set in environment variables

### Database errors on startup

**Cause**: DynamoDB tables don't exist or endpoint is unreachable.

**Solution**:

1. Verify AWS credentials are set correctly
2. Check `DYNAMODB_TABLE_PREFIX` matches your CDK deployment
3. Ensure DynamoDB tables exist in your AWS account
4. For local development, set `DYNAMODB_ENDPOINT=http://localhost:8000` and run DynamoDB Local

### Rate limiter not working

**Cause**: Upstash Redis is unavailable or credentials are incorrect.

**Impact**: Rate limiting is skipped, but app continues functioning (graceful degradation).

**Solution**:

1. Verify `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set correctly
2. Check Upstash Redis dashboard for service status
3. Test connection with Upstash Redis CLI or REST API

### Lambda image processing failures

**Cause**: Lambda function errors, timeout, or insufficient memory.

**Solution**:

1. Check CloudWatch Logs for Lambda errors:
   ```bash
   aws logs tail /aws/lambda/PhotoProfileImageProcessor --follow
   ```
2. Check SQS Dead Letter Queue:
   ```bash
   aws sqs receive-message --queue-url <DLQ-URL>
   ```
3. Common issues:
   - **Timeout**: Increase Lambda timeout in CDK stack (current: 120s)
   - **Memory**: Increase Lambda memory in CDK stack (current: 2048MB)
   - **Permissions**: Verify IAM role has S3 and DynamoDB access
   - **Ephemeral storage**: Large images may need more `/tmp` space (current: 1024MB)

### S3 upload errors

**Cause**: AWS credentials are missing or invalid.

**Solution**:

1. Verify `AWS_S3_BUCKET`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
2. Test credentials:
   ```bash
   aws s3 ls s3://your-bucket-name
   ```
3. Ensure CloudFront domain is set if using CDN:
   ```env
   AWS_CLOUDFRONT_DOMAIN=d12345.cloudfront.net
   NEXT_PUBLIC_CLOUDFRONT_DOMAIN=d12345.cloudfront.net
   ```

## 🧪 Quality Assurance

This project uses **Husky** and **lint-staged** to ensure code quality. Pre-commit hooks automatically run:

- ESLint (fix mode)
- Prettier (write mode)

**Test Coverage:**

- **364+ unit tests** (Vitest) covering infrastructure, services, and API routes
- **10 CDK infrastructure tests** (Jest) validating AWS resource configuration
