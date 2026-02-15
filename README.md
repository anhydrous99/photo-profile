# Photo Profile

[![Next.js 16](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind_CSS-v4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Vitest](https://img.shields.io/badge/Tests-Vitest-6E9F18?logo=vitest&logoColor=white)](https://vitest.dev/)
[![License: Private](https://img.shields.io/badge/License-Private-red)](#)

Photography portfolio built on Next.js 16 App Router with a serverless image pipeline (SQS + Lambda + Sharp) and DynamoDB. Designed for Vercel deployments with optional local filesystem or S3 + CloudFront storage.

## Highlights

| Area           | Notes                                                                   |
| -------------- | ----------------------------------------------------------------------- |
| Architecture   | Clean Architecture layers (domain, infrastructure, presentation)        |
| Image Pipeline | Sharp derivatives (WebP/AVIF), EXIF extraction, SQS + Lambda processing |
| Admin Auth     | JWT (jose HS256, 8h), bcrypt, Upstash rate limiting, IP validation      |
| Storage        | Filesystem for local dev, S3 + CloudFront for production                |
| Infra          | AWS CDK stack for Lambda, SQS, DynamoDB, IAM                            |

## Stack

| Layer     | Tech                             |
| --------- | -------------------------------- |
| Framework | Next.js 16, React 19, TypeScript |
| Data      | DynamoDB                         |
| Queue     | SQS + Lambda                     |
| Images    | Sharp (ARM64 for Lambda)         |
| Styling   | Tailwind CSS v4                  |
| Testing   | Vitest, Playwright               |

## Quick Start

```bash
npm install
cp .env.example .env
npm run dev
```

> Tip: Keep `SQS_QUEUE_URL` set even in local dev so uploads can enqueue processing jobs.

Generate the admin password hash:

```bash
npx tsx scripts/hash-password.ts "your-secure-password"
```

> Note: `ADMIN_PASSWORD_HASH` is required for the admin login page.

Local DynamoDB: set `DYNAMODB_ENDPOINT=http://localhost:8000` or use Docker Compose.

## Environment

Required (see `.env.example`):

| Variable              | Description                                 |
| --------------------- | ------------------------------------------- |
| `AUTH_SECRET`         | JWT signing key (min 32 chars)              |
| `ADMIN_PASSWORD_HASH` | bcrypt hash from `scripts/hash-password.ts` |
| `STORAGE_BACKEND`     | `filesystem` or `s3`                        |
| `SQS_QUEUE_URL`       | Queue URL for image processing              |

Common optional:

| Variable                   | Description                                   |
| -------------------------- | --------------------------------------------- |
| `UPSTASH_REDIS_REST_URL`   | Upstash Redis URL for rate limiting           |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis token                           |
| `STORAGE_PATH`             | Local storage directory (default `./storage`) |
| `DYNAMODB_ENDPOINT`        | Local DynamoDB endpoint                       |
| `DYNAMODB_TABLE_PREFIX`    | Table prefix (must match CDK)                 |
| `TRUSTED_PROXIES`          | Comma-separated proxy IPs                     |
| `NEXT_PUBLIC_SITE_URL`     | Public site URL                               |

## Storage Backends

- Filesystem: set `STORAGE_BACKEND=filesystem` and ensure `storage/` is writable.
- S3 + CloudFront: set `STORAGE_BACKEND=s3`, AWS credentials, and CloudFront domain.

If using S3, configure CORS for direct uploads:

```bash
./scripts/configure-s3-cors.sh <bucket-name> <allowed-origin>
```

## Deployment (Vercel + AWS)

1. Deploy the CDK stack from `photo-profile-cdk/` (SQS, Lambda, DynamoDB, IAM).
2. Set Vercel env vars to match `.env.example`.
3. Ensure `DYNAMODB_TABLE_PREFIX` matches your CDK table prefix.

> Tip: `STORAGE_BACKEND=s3` is required for Vercel deployments.

CDK commands:

```bash
cd photo-profile-cdk
npm install
npx cdk deploy
```

## Scripts

| Command                | Description          |
| ---------------------- | -------------------- |
| `npm run dev`          | Start dev server     |
| `npm run build`        | Production build     |
| `npm run build:lambda` | Build Lambda package |
| `npm run lint`         | ESLint               |
| `npm run format`       | Prettier             |
| `npm run typecheck`    | TypeScript checks    |
| `npm run test`         | Vitest               |

## Architecture

```
              +---------------------------+
Browser ----> |   Next.js (Vercel)        |
              |   App Router + API        |
              +-------------+-------------+
                            |
                            v
                     +------+------+
                     |   SQS Queue  |
                     +------+------+
                            |
                            v
                     +------+------+
                     |  Lambda +   |
                     |   Sharp     |
                     +------+------+
                            |
                 +----------+-----------+
                 v                      v
        +--------+--------+     +-------+-------+
        |   DynamoDB      |     | S3 + CloudFront|
        +-----------------+     +---------------+
```

## Project Structure

```
src/
├── domain/          Entities + repository interfaces
├── infrastructure/  Auth, database, storage, services, jobs
├── presentation/    Client components and upload utilities
└── app/             App Router + API routes
```

## Troubleshooting

| Symptom                    | Likely Cause                  | Fix                                                     |
| -------------------------- | ----------------------------- | ------------------------------------------------------- |
| Images stuck in Processing | Lambda or DLQ issue           | Check Lambda logs and DLQ; verify `SQS_QUEUE_URL`       |
| DynamoDB errors            | Endpoint/credentials mismatch | Confirm `DYNAMODB_ENDPOINT` or AWS creds                |
| Rate limiting skipped      | Missing Upstash config        | Set `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` |
