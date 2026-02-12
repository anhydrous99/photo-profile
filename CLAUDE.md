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
