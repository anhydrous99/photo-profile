# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Photo Profile is a self-hosted photography portfolio built with Next.js 16 (App Router), TypeScript, DynamoDB, and Sharp for image processing. Single admin user, public-facing gallery.

## Commands

| Command                | Purpose                                |
| ---------------------- | -------------------------------------- |
| `npm run dev`          | Dev server (port 3000)                 |
| `npm run build`        | Production build                       |
| `npm run lint`         | ESLint                                 |
| `npm run lint:fix`     | ESLint with auto-fix                   |
| `npm run format`       | Prettier format all files              |
| `npm run format:check` | Check Prettier formatting              |
| `npm run typecheck`    | TypeScript type check (`tsc --noEmit`) |
| `npm run worker`       | Start BullMQ image processing worker   |

Pre-commit hook runs `eslint --fix` + `prettier --write` on staged files via lint-staged.

## Architecture

The codebase follows Clean Architecture with four layers under `src/`:

- **`domain/`** — Entities (`Photo`, `Album`) and repository interfaces. No external dependencies.
- **`application/`** — Business logic services that orchestrate domain objects.
- **`infrastructure/`** — Concrete implementations: DynamoDB repositories, auth (JWT via jose, bcrypt), file storage, Sharp image processing, BullMQ job queue.
- **`presentation/`** — React components, hooks, and client-side utilities.
- **`app/`** — Next.js App Router pages, API routes, and server actions.

### Import Aliases

```
@/*                → ./src/*
@/domain/*         → ./src/domain/*
@/application/*    → ./src/application/*
@/infrastructure/* → ./src/infrastructure/*
@/presentation/*   → ./src/presentation/*
```

### Key Patterns

**Auth flow**: `proxy.ts` (Edge) checks cookie existence on `/admin/*` routes, returning 404 if missing (hides admin panel). The `(protected)/layout.tsx` Server Component performs full JWT verification.

**Image pipeline**: Upload saves original to `storage/originals/{photoId}/`, enqueues a BullMQ job. The worker (`npm run worker`) generates WebP + AVIF derivatives at [300, 600, 1200, 2400] widths using Sharp. Processed files go to `storage/processed/{photoId}/{width}w.{format}`. The image API route (`/api/images/[photoId]/[filename]`) serves them with immutable caching.

**Data access**: Repository pattern — domain interfaces in `domain/repositories/`, DynamoDB implementations in `infrastructure/database/dynamodb/repositories/`. Repositories are instantiated directly in server components and API routes.

**Database**: DynamoDB with tables for photos, albums, and photo-album relationships. UUIDs for IDs, timestamps as milliseconds.

**Routing**: Public pages (`/`, `/albums`, `/albums/[id]`) are Server Components. Admin pages under `/admin/(protected)/` use a route group with auth layout. Client components use `"use client"` directive.

**Styling**: Tailwind CSS v4 with PostCSS plugin. No CSS-in-JS.

### External Services

- **Redis** (docker-compose.yml) — Required for BullMQ job queue and rate limiting. App degrades gracefully if unavailable.
- **DynamoDB** — Cloud database service (AWS). Local testing uses DynamoDB Local.
- **File storage** — Local filesystem at `STORAGE_PATH` (default `./storage`).

## Environment Variables

See `.env.example`. Required: `STORAGE_PATH`, `AUTH_SECRET` (32+ chars), `ADMIN_PASSWORD_HASH` (generate with `npx tsx scripts/hash-password.ts <password>`). Optional: `DYNAMODB_ENDPOINT` (for local development with DynamoDB Local).

## AWS Deployment Options

Photo Profile can be deployed to AWS using different architectures. Choose based on your cost, complexity, and performance requirements.

### Option 1: ECS Fargate (Current recommended)

**Architecture**: Containerized Next.js on always-on ECS tasks + separate BullMQ worker + ElastiCache Redis.

**Cost**: ~$175/month (production moderate traffic)

**Pros**:
- ✅ Always-fast responses (no cold starts)
- ✅ Unlimited processing time for images
- ✅ Familiar Docker/container workflow
- ✅ Full observability with CloudWatch

**Cons**:
- ❌ Expensive Redis service ($42/month)
- ❌ Always-on costs even with low traffic
- ❌ Requires ALB ($16/month)

**When to choose**: You need consistent sub-100ms response times and have steady traffic.

---

### Option 2: Serverless (AWS Lambda + SQS) - **Recommended for cost**

**Architecture**: API Gateway → Lambda functions for web requests; SQS → Lambda for image processing; DynamoDB for rate limiting (no Redis).

**Cost**: ~$50/month (production with same traffic)

**Pros**:
- ✅ **70% cost reduction** (no Redis, no ALB, no always-on tasks)
- ✅ Auto-scales instantly with traffic
- ✅ Zero ops overhead
- ✅ Pay only per request/invocation
- ✅ Simple deployment (single CDK stack)

**Cons**:
- ⚠️ Cold starts (1-2 seconds on first request after idle)
- ⚠️ 15-minute Lambda timeout (usually sufficient)
- ⚠️ Requires refactoring job queue (Redis → SQS)
- ⚠️ Admin portal might experience occasional latency

**Mitigations**:
- Use keep-warm function (~$1/month) to eliminate cold starts
- Use Provisioned Concurrency ($15-20/month) for guaranteed hot Lambdas
- Optimize image processing with parallel Sharp operations

**When to choose**: You want maximum cost savings and occasional latency is acceptable.

**Migration effort**: 2-3 days (main work: replace Redis with SQS, update job queue logic)

---

### Option 3: Hybrid (ECS + DynamoDB, no Redis) - **Recommended for balance**

**Architecture**: Keep current ECS setup but remove ElastiCache Redis. Use DynamoDB for rate limiting and SQS for job queue.

**Cost**: ~$110/month (35% savings)

**Pros**:
- ✅ **35-45% cost reduction** (no Redis, smaller cost impact)
- ✅ Minimal code changes needed
- ✅ Keeps familiar ECS workflow
- ✅ Still always-fast responses

**Cons**:
- ⚠️ Slightly higher DynamoDB costs for rate limiting
- ⚠️ SQS for queuing is less performant than Redis

**When to choose**: You want quick cost savings without major refactoring.

**Migration effort**: 4-6 hours (replace Redis calls with DynamoDB/SQS equivalents)

---

### Option 4: Vercel Deployment - **Easiest serverless**

**Architecture**: Next.js deployed on Vercel (serverless); Lambda or Vercel Functions for image processing.

**Cost**: ~$20-40/month (includes Vercel Pro)

**Pros**:
- ✅ Zero deployment complexity (git push auto-deploys)
- ✅ Best-in-class Next.js optimization
- ✅ Vercel handles cold starts with intelligent caching
- ✅ Built-in edge caching and CDN

**Cons**:
- ❌ Less control over AWS services
- ❌ Vendor lock-in to Vercel
- ❌ Image processing still requires AWS Lambda separately

**When to choose**: You prioritize development velocity and deploy simplicity.

---

### Cost Comparison

| Option | Monthly Cost | Setup Time | Response Time | Best For |
|--------|--------------|-----------|---------------|----------|
| ECS Fargate | $175 | 1-2 days | <100ms | Consistent traffic, predictable load |
| **Serverless** | **$50** | **2-3 days** | **1-2s cold start** | **Cost optimization** |
| Hybrid | $110 | 4-6 hours | <100ms | Quick savings |
| Vercel | $20-40 | 1 hour | <100ms | Minimal ops |

---

### Deployment Checklist

**For ECS**:
- [ ] Create ECR repository
- [ ] Build and push Docker image
- [ ] Create RDS security groups
- [ ] Deploy with CloudFormation/Terraform
- [ ] Configure ElastiCache Redis
- [ ] Set up CloudWatch alarms
- [ ] Configure auto-scaling policies

**For Serverless**:
- [ ] Create Lambda functions (web + worker)
- [ ] Replace Redis calls with SQS + DynamoDB
- [ ] Update image processing pipeline
- [ ] Deploy API Gateway
- [ ] Configure CloudWatch logs
- [ ] Set up Lambda concurrency limits
- [ ] Test cold start performance

**For Hybrid**:
- [ ] Replace Redis calls with DynamoDB
- [ ] Replace BullMQ with SQS
- [ ] Keep ECS deployment unchanged
- [ ] Test job queue with SQS
- [ ] Verify rate limiting works with DynamoDB

---

### Recommended Path

1. **Start with**: Current ECS setup (already documented in CDK)
2. **Quick win**: Implement Hybrid approach (4-6 hours, saves 35%)
3. **If needed**: Migrate to Serverless (2-3 days, saves 70%)
4. **Alternative**: Consider Vercel for minimal ops overhead

For a photography portfolio with variable traffic, **Serverless** offers the best value despite occasional cold starts. Use keep-warm functions if response time is critical.

---

## Vercel Deployment Guide

Deploy Photo Profile to Vercel with minimal ops overhead. This guide covers the migration path from local development to production on Vercel.

### Architecture Overview

**Current (Local/ECS)**:
```
Local filesystem → ./storage/
Redis → BullMQ job queue
ECS → Always-on Next.js server
```

**Vercel deployment**:
```
AWS S3 → File storage (persistent)
AWS Lambda or Upstash → Image processing jobs
Vercel → Next.js frontend + API routes (serverless)
DynamoDB → Database (unchanged)
```

### Why Vercel?

- **Deploy complexity**: `git push` → auto-deployed (no Docker, no ECS management)
- **Cost**: ~$45/month (Vercel Pro + S3 + Lambda)
- **Performance**: Edge caching, automatic scaling, zero cold start overhead
- **Best for**: Minimal ops, variable traffic, developer experience

### Key Changes Required

#### 1. **File Storage: Disk → S3**

Currently files are stored locally. Vercel deployments are ephemeral (cleaned up after each deploy), so you must move to S3.

**Files to modify**:
- `src/infrastructure/file-storage/` — Create S3 implementation
- `src/app/api/upload/route.ts` — Save to S3 instead of disk
- `src/app/api/images/[photoId]/[filename]/route.ts` — Serve from S3

**Implementation**:
```typescript
// NEW: src/infrastructure/file-storage/s3-storage.ts
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'

export class S3FileStorage implements IFileStorage {
  private s3 = new S3Client({ region: process.env.AWS_REGION })
  private bucket = process.env.AWS_S3_BUCKET!

  async save(path: string, buffer: Buffer): Promise<void> {
    await this.s3.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: path,
      Body: buffer,
      ContentType: 'image/jpeg' // or detect
    }))
  }

  async load(path: string): Promise<Buffer> {
    const response = await this.s3.send(new GetObjectCommand({
      Bucket: this.bucket,
      Key: path
    }))
    return Buffer.from(await response.Body?.transformToByteArray() || [])
  }

  async delete(path: string): Promise<void> {
    await this.s3.send(new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: path
    }))
  }
}
```

**Effort**: 3-4 hours

---

#### 2. **Image Processing: BullMQ → Lambda or Upstash**

You have two options:

**Option A: AWS Lambda (Recommended for reliability)**
```
Upload → API saves to S3
  ↓
API enqueues SQS message
  ↓
AWS Lambda invoked (triggered by SQS)
  ↓
Lambda processes with Sharp
  ↓
Lambda saves derivatives to S3
  ↓
Lambda updates DynamoDB
```

**Option B: Upstash + Vercel Functions (Easier integration)**
```
Upload → API saves to S3
  ↓
API enqueues to Upstash Redis
  ↓
Upstash triggers Vercel Function
  ↓
Vercel Function processes with Sharp
  ↓
Updates S3 + DynamoDB
```

**Recommendation**: Use **Option A (Lambda)** for better reliability and timeout handling. Vercel Functions have a 10-second timeout which may be too short for images.

**Files to modify**:
- Remove: `src/infrastructure/queue/bullmq-queue.ts`
- Remove: BullMQ worker code (`npm run worker`)
- Create: `src/infrastructure/image-processing/image-processor.ts` (orchestrates S3 + Sharp)
- Update: `src/app/api/upload/route.ts` (enqueue to SQS instead of BullMQ)
- Create: Lambda handler (separate from Next.js)

**Effort**: 4-5 hours

**Lambda handler** (separate repository or AWS Lambda console):
```typescript
// lambda/image-processor.ts
import { SQSEvent } from 'aws-lambda'
import sharp from 'sharp'
import { S3Client } from '@aws-sdk/client-s3'

export async function handler(event: SQSEvent) {
  for (const record of event.Records) {
    const { photoId } = JSON.parse(record.body)

    // Download original from S3
    // Process with Sharp
    // Upload derivatives
    // Update DynamoDB
  }
}
```

---

#### 3. **Remove Docker**

**Delete**:
- `Dockerfile`
- `docker-compose.yml`
- Docker-related `.dockerignore`, etc.

**Update**:
- `CLAUDE.md` — Remove `npm run worker` command
- `package.json` — Remove `bullmq`, `redis`, `redis-client` dependencies
- `.env.example` — Remove `REDIS_URL`, add AWS env vars

**Effort**: 1 hour

---

#### 4. **Environment Variables Setup**

**Create `.env.local` for local development**:
```bash
# Database
DYNAMODB_ENDPOINT=http://localhost:8000

# File Storage
AWS_S3_BUCKET=photo-profile-dev
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=<your-key>
AWS_SECRET_ACCESS_KEY=<your-secret>

# Auth
AUTH_SECRET=<32+ random characters>
ADMIN_PASSWORD_HASH=<generate with hash-password.ts>
```

**Create Vercel environment variables** (via Vercel dashboard):
```
AWS_S3_BUCKET=photo-profile-prod
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=<production-key>
AWS_SECRET_ACCESS_KEY=<production-secret>
AUTH_SECRET=<same as local>
ADMIN_PASSWORD_HASH=<same as local>
```

**Effort**: 30 minutes

---

#### 5. **S3 Bucket Configuration**

Create S3 bucket with:
- **Public read access** for processed images (CloudFront optional)
- **Versioning disabled** (save costs)
- **Lifecycle policy** to delete old originals after 30 days
- **CORS** configured for Vercel domain

```json
{
  "CORSRules": [
    {
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["GET", "PUT", "POST"],
      "AllowedOrigins": [
        "https://yoursite.vercel.app",
        "http://localhost:3000"
      ],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3000
    }
  ]
}
```

**Effort**: 30 minutes

---

#### 6. **Authentication Verification**

Your current auth should work, but verify:

**Proxy middleware** (`src/middleware.ts`):
- ✅ JWT token in cookies works in Vercel
- ✅ Edge runtime supported
- ✅ Redirect logic works fine

**Potential issues**:
- Rate limiting via Redis won't work — use DynamoDB instead (already abstracted)
- Session storage — currently in-memory won't work across Vercel instances

**Change needed**:
```typescript
// If using in-memory sessions, replace with DynamoDB
// Or use JWT tokens only (current implementation should be fine)
```

**Effort**: 1 hour (mostly verification)

---

### Complete Migration Checklist

**Phase 1: Preparation** (2 hours)
- [ ] Create AWS S3 bucket with proper config
- [ ] Create IAM user with S3 + SQS + Lambda permissions
- [ ] Create Lambda function for image processing
- [ ] Create SQS queue for job messages
- [ ] Create Vercel account and connect GitHub repo

**Phase 2: Code Changes** (10-12 hours)
- [ ] Create S3FileStorage implementation (3 hrs)
- [ ] Create image processor and Lambda handler (4 hrs)
- [ ] Update upload/download API routes (2 hrs)
- [ ] Remove Docker and BullMQ (1 hr)
- [ ] Update environment variables (30 min)
- [ ] Verify auth flow (1 hr)

**Phase 3: Testing** (2-3 hours)
- [ ] Test file uploads locally
- [ ] Test image processing (via Lambda or local mock)
- [ ] Test image serving from S3
- [ ] Test admin authentication
- [ ] Load test with multiple concurrent uploads

**Phase 4: Deployment** (1 hour)
- [ ] Push to GitHub (with environment variables)
- [ ] Vercel auto-deploys
- [ ] Test in production
- [ ] Monitor CloudWatch logs

**Phase 5: Cleanup** (30 min)
- [ ] Migrate existing photos from local storage to S3
- [ ] Update documentation
- [ ] Archive old infrastructure

---

### Cost Breakdown

**Monthly costs** (100 photos, 500 visitors):

```
Vercel Pro                           $20/month
AWS S3 (200 GB storage)              $5/month
AWS Lambda (image processing)        $10/month
AWS SQS (10 messages/month)          $0.50/month
AWS DynamoDB (on-demand)             $5/month
─────────────────────────────────
Total:                              $40.50/month
```

**vs ECS**: Save $134/month
**vs Hybrid**: Save $70/month

---

### File Structure After Migration

```
photo-profile/
├── src/
│   ├── infrastructure/
│   │   ├── file-storage/
│   │   │   ├── file-storage.interface.ts  (unchanged)
│   │   │   └── s3-storage.ts  (NEW)
│   │   ├── image-processing/
│   │   │   ├── image-processor.ts  (NEW - orchestrator)
│   │   │   └── sharp-processor.ts  (move from domain)
│   │   ├── queue/
│   │   │   └── sqs-queue.ts  (NEW - replace bullmq)
│   ├── app/
│   │   ├── api/
│   │   │   ├── upload/route.ts  (updated)
│   │   │   └── images/[photoId]/[filename]/route.ts  (updated)
├── lambda/  (NEW - separate function)
│   ├── image-processor.ts
│   └── package.json
├── Dockerfile  (DELETE)
├── docker-compose.yml  (DELETE)
├── vercel.json  (NEW)
└── ...
```

---

### Vercel Configuration

**Create `vercel.json`**:
```json
{
  "env": {
    "AWS_S3_BUCKET": "@aws_s3_bucket",
    "AWS_REGION": "@aws_region",
    "AWS_ACCESS_KEY_ID": "@aws_access_key_id",
    "AWS_SECRET_ACCESS_KEY": "@aws_secret_access_key",
    "AUTH_SECRET": "@auth_secret",
    "ADMIN_PASSWORD_HASH": "@admin_password_hash"
  },
  "buildCommand": "npm run build",
  "devCommand": "npm run dev",
  "installCommand": "npm ci"
}
```

---

### Deployment Steps

1. **Push code to GitHub**:
   ```bash
   git add .
   git commit -m "Migrate to Vercel: S3 storage, Lambda image processing"
   git push origin main
   ```

2. **Connect to Vercel**:
   - Go to https://vercel.com/import
   - Select your GitHub repo
   - Add environment variables from `.env.local`
   - Deploy

3. **Verify deployment**:
   - Test image upload
   - Check CloudWatch Logs for Lambda
   - Verify S3 bucket contains files
   - Test image serving

4. **Monitor**:
   - Vercel dashboard for function performance
   - CloudWatch for Lambda errors
   - S3 for storage usage

---

### Troubleshooting

**Problem**: Images not appearing after upload
- Check S3 bucket permissions
- Verify CORS configuration
- Check CloudWatch Lambda logs

**Problem**: Lambda timeouts during processing
- Increase Lambda memory/timeout
- Optimize Sharp processing (reduce image size)
- Check SQS queue for stuck messages

**Problem**: Cold starts slow down admin uploads
- Use Vercel Pro (better infrastructure)
- Add Lambda concurrency reservation
- Implement background processing UI

---

### Post-Migration Checklist

- [ ] Migrate existing photos from local storage to S3
- [ ] Update documentation (remove Docker references)
- [ ] Remove development .env files from git
- [ ] Set up monitoring/alerting
- [ ] Configure CloudFront for S3 (optional, for CDN)
- [ ] Test disaster recovery (S3 bucket restoration)
- [ ] Document AWS credentials rotation process
- [ ] Archive old ECS/Docker infrastructure
