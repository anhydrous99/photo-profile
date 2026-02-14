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
| `npm run test`         | Run all tests once (Vitest)            |
| `npm run test:watch`   | Run tests in watch mode                |
| `npm run build:lambda` | Build Lambda deployment package        |

```bash
# Run a single test file
npx vitest run src/infrastructure/auth/__tests__/auth.test.ts

# Run tests matching a name pattern
npx vitest run --testNamePattern="encrypt"

# Run tests with coverage
npx vitest run --coverage
```

Pre-commit hook runs `eslint --fix` + `prettier --write` on staged files via lint-staged. CI pipeline order: lint → format:check → typecheck → build → test.

## Architecture

The codebase follows Clean Architecture with four layers under `src/`:

- **`domain/`** — Entities (`Photo`, `Album`) and repository interfaces. No external dependencies.
- **`application/`** — Currently empty; business logic lives in API routes + infrastructure services.
- **`infrastructure/`** — Concrete implementations: DynamoDB repositories, auth (JWT via jose, bcrypt), file storage, Sharp image processing, SQS job queue, Zod-validated env config.
- **`presentation/`** — React client components (`"use client"`), hooks, and client-side utilities. Barrel exports via `index.ts`.
- **`app/`** — Next.js App Router pages, API routes, and server actions.

### Import Aliases

```
@/*                → ./src/*
@/domain/*         → ./src/domain/*
@/application/*    → ./src/application/*
@/infrastructure/* → ./src/infrastructure/*
@/presentation/*   → ./src/presentation/*
```

### Where to Look

| Task                  | Files                                                                                                |
| --------------------- | ---------------------------------------------------------------------------------------------------- |
| Add domain entity     | `src/domain/entities/` — plain TS interface, add to barrel `index.ts`                                |
| Add repository method | `src/domain/repositories/` (interface) + `src/infrastructure/database/dynamodb/repositories/` (impl) |
| Add API endpoint      | `src/app/api/admin/` — call `verifySession()` first, instantiate repos at module scope               |
| Add admin page        | `src/app/admin/(protected)/` — Server Component → Client Component pattern                           |
| Add public page       | `src/app/` or `src/app/albums/` — Server Components, no auth                                         |
| Add React component   | `src/presentation/components/` — `"use client"`, add to barrel `index.ts`                            |
| Modify auth           | `src/infrastructure/auth/` — session.ts (JWT), dal.ts, password.ts                                   |
| Modify image pipeline | `src/infrastructure/services/imageService.ts`                                                        |
| Modify Lambda handler | `src/infrastructure/jobs/lambdaHandler.ts`                                                           |
| Environment config    | `src/infrastructure/config/env.ts` — Zod schema, crashes on startup if invalid                       |

### Key Patterns

**Auth flow**: `proxy.ts` (Edge) checks cookie existence on `/admin/*` routes, returning 404 if missing (hides admin panel). The `(protected)/layout.tsx` Server Component performs full JWT verification. Never use `middleware.ts` — this project uses `proxy.ts` (Next.js 16 proxy pattern).

**Image pipeline**: Upload saves original to `storage/originals/{photoId}/` (or S3), enqueues a message to SQS. An AWS Lambda function (deployed via CDK in `photo-profile-cdk/`) processes the queue, generating WebP + AVIF derivatives at [300, 600, 1200, 2400] widths using Sharp. Processed files go to `storage/processed/{photoId}/{width}w.{format}` (or S3). The image API route (`/api/images/[photoId]/[filename]`) serves them with immutable caching.

**Data access**: Repository pattern — domain interfaces in `domain/repositories/`, DynamoDB implementations in `infrastructure/database/dynamodb/repositories/`. Repositories are instantiated at module scope in server components and API routes.

**Database**: DynamoDB with tables for photos, albums, and photo-album relationships. UUIDs for IDs, timestamps as milliseconds. Tables auto-created on first run.

**Routing**: Public pages (`/`, `/albums`, `/albums/[id]`) are Server Components. Admin pages under `/admin/(protected)/` use a route group with auth layout. Data flow: Server Component fetches → serializes props → Client Component renders. Mutations: Client calls `fetch()` → `router.refresh()` to revalidate.

**Styling**: Tailwind CSS v4 with PostCSS plugin. No CSS-in-JS, no CSS modules.

### API Route Conventions

- Every admin route: `verifySession()` at top → 401 if null
- Validate params with `isValidUUID(id)` → 400 if invalid
- Validate body with Zod `safeParse` → 400 with `z.flattenError(result.error).fieldErrors` (Zod 4 API, not v3's `result.error.flatten()`)
- Wrap handler in try/catch → `logger.error(...)` → 500
- Return `NextResponse.json(...)` with appropriate status codes

### External Services

- **Redis** (docker-compose.yml) — Optional for rate limiting. App degrades gracefully if unavailable.
- **SQS** — AWS Simple Queue Service for image processing jobs. Optional for development/CI, required for production deployment.
- **Lambda** — AWS Lambda function for processing images from SQS queue (see `photo-profile-cdk/`).
- **DynamoDB** — Cloud database service (AWS). Local testing uses DynamoDB Local (port 8000 via docker-compose).
- **File storage** — Local filesystem at `STORAGE_PATH` (default `./storage`) or S3 (set `STORAGE_BACKEND=s3`). `getStorageAdapter()` is a singleton factory.

## Testing

- **Vitest** with globals enabled, node environment
- Tests colocated in `__tests__/` directories next to source files
- Mock pattern: `vi.hoisted()` for shared mock refs + `vi.mock()` for module mocks
- `fileParallelism: false` — tests run sequentially due to DynamoDB shared state
- Coverage: V8 provider, covers `src/infrastructure/**/*.ts`
- CDK tests use Jest separately in `photo-profile-cdk/` (`npm test`)

## Code Style

- **Strict TypeScript** — `strict: true` in tsconfig
- Domain entities are plain interfaces — no classes, no methods
- Use `type` imports for type-only: `import type { Photo } from "@/domain/entities"`
- Components: PascalCase files (`PhotoGrid.tsx`). Utilities/services: camelCase files (`imageService.ts`)
- All modules use barrel exports via `index.ts`
- No global state management (no Redux/Zustand/Context)

## Anti-Patterns — Never Do

- **Never** remove `.rotate()` from Sharp pipelines — images render with wrong orientation
- **Never** remove `.withMetadata()` from Sharp — colors shift (loses sRGB ICC profile)
- **Never** access GPS/camera serial/software EXIF tags — privacy policy, only 11 safe fields allowed
- **Never** use `middleware.ts` — project uses `proxy.ts` (Next.js 16 proxy pattern)
- **Never** add `@ts-ignore`, `@ts-expect-error`, or `as any`
- **Never** delete failing tests to make the suite pass

## Known Type Workarounds

These are the ONLY acceptable non-strict type patterns in the codebase:

- `session.ts:41` — `payload as unknown as SessionPayload` (jose untyped JWT payload)
- `env.ts:112,114` — `eslint-disable-next-line` for NodeJS namespace augmentation
- `rateLimiter.test.ts:12` — `as unknown as Record<string, unknown>` (mock class casting)
- `PhotoGrid.tsx:150`, `SortablePhotoCard.tsx:58`, `AlbumDetailClient.tsx:199` — `eslint-disable-next-line @next/next/no-img-element` (custom image serving via API)
- `global-error.tsx:74` — `eslint-disable-next-line @next/next/no-html-link-for-pages`

## Watch Out

- `tags` on Album is **comma-separated string**, not array or JSON
- `export const dynamic = "force-dynamic"` on homepage — random photos require no caching
- **Storage backend**: `STORAGE_BACKEND` env var switches between `filesystem` and `s3`
- **Image API**: Falls back to largest available derivative if requested size doesn't exist

## Environment Variables

See `.env.example`.

**Required for all deployments:**

- `AUTH_SECRET` (32+ chars)
- `ADMIN_PASSWORD_HASH` (generate with `npx tsx scripts/hash-password.ts <password>`)

**Storage (choose one):**

- Filesystem: `STORAGE_PATH` (default `./storage`)
- S3: `STORAGE_BACKEND=s3`, `AWS_REGION`, `AWS_S3_BUCKET`, `AWS_CLOUDFRONT_DOMAIN`

**Optional:**

- `SQS_QUEUE_URL` — Required for production image processing, optional for dev/CI
- `DYNAMODB_ENDPOINT` — For local development with DynamoDB Local
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` — For rate limiting
