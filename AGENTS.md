# photo-profile

Photography portfolio: Next.js 16 full-stack app with DynamoDB, S3, SQS/Lambda image pipeline.

## STACK

Next.js 16.1.6 (App Router) · React 19 · TypeScript 5 (strict) · Tailwind CSS 4 · DynamoDB · S3 + CloudFront · SQS + Lambda · Redis · Sharp · Zod 4 · Vitest

## ARCHITECTURE

Clean Architecture with four layers. Imports flow **down** only: app → presentation → infrastructure → domain.

```
src/
├── domain/              # Entities (Photo, Album) + repository interfaces
├── application/         # Use cases (currently empty — logic lives in API routes)
├── infrastructure/      # See infrastructure/AGENTS.md for details
├── presentation/        # React components, hooks, client utilities
├── app/                 # Next.js App Router (pages, API routes, server actions)
└── lib/                 # Shared utilities (imageLoader)
```

## WHERE TO LOOK

| Task                    | Location                                             | Notes                                                 |
| ----------------------- | ---------------------------------------------------- | ----------------------------------------------------- |
| Add/edit page           | `src/app/`                                           | Next.js App Router conventions                        |
| Add API endpoint        | `src/app/api/`                                       | All admin routes verify session first                 |
| Add UI component        | `src/presentation/components/`                       | 19 components, no global state                        |
| Domain entity           | `src/domain/entities/`                               | Photo, Album — pure interfaces                        |
| Repository interface    | `src/domain/repositories/`                           | PhotoRepository, AlbumRepository                      |
| DynamoDB implementation | `src/infrastructure/database/dynamodb/repositories/` | DynamoDBPhotoRepository (605 lines — biggest file)    |
| Storage adapter         | `src/infrastructure/storage/`                        | Factory pattern: S3 or filesystem via env             |
| Auth changes            | `src/infrastructure/auth/`                           | JWT/bcrypt/rate-limit/timing-safe                     |
| Image processing        | `src/infrastructure/services/imageService.ts`        | Sharp derivatives (300/600/1200/2400 × webp+avif)     |
| EXIF extraction         | `src/infrastructure/services/exifService.ts`         | 11 safe fields only — no GPS/serial                   |
| Lambda handler          | `lambda/handler.ts`                                  | SQS consumer — own tsconfig, excluded from main build |
| Server actions          | `src/app/actions/auth.ts`                            | Login with rate limiting + timing attack prevention   |
| Upload flow             | `src/app/api/admin/upload/route.ts`                  | Save original → create record → enqueue SQS           |
| Env validation          | `src/infrastructure/config/env.ts`                   | Zod schema — crashes on missing vars                  |
| App initialization      | `src/infrastructure/initialization.ts`               | Creates DynamoDB tables on startup                    |

## IMAGE PROCESSING PIPELINE

```
Upload (API route)
  → saveOriginalFile() to S3 as originals/{photoId}/original.{ext}
  → create Photo record (status: "processing")
  → enqueueImageProcessing() via SQS
      → Lambda handler picks up message
         → downloads original from S3
         → generateDerivatives(): 4 widths × 2 formats (webp + avif)
         → extractExifData(): 11 fields
         → generateBlurPlaceholder(): 10px LQIP
         → uploads derivatives to S3 as processed/{photoId}/{width}w.{format}
         → updates Photo record (status: "ready", dimensions, exif, blur)
```

## KEY PATTERNS

- **Repository pattern**: domain interfaces → DynamoDB implementations
- **Adapter pattern**: StorageAdapter → S3StorageAdapter | FilesystemStorageAdapter
- **Factory pattern**: `getStorageAdapter()` returns backend based on `STORAGE_BACKEND` env
- **Cursor-based pagination**: DynamoDB-compatible, base64-encoded `ExclusiveStartKey`
- **Singleton clients**: DynamoDB, S3, SQS clients lazy-initialized once
- **No global state**: Components use `useState`/`useCallback` only — no Redux/Zustand/Context
- **Server Components by default**: Client components explicitly marked `"use client"`
- **Barrel exports**: Each infrastructure subdirectory has `index.ts`

## API ROUTES

| Method | Path                                    | Auth | Purpose                                      |
| ------ | --------------------------------------- | ---- | -------------------------------------------- |
| POST   | `/api/admin/upload`                     | Yes  | Upload photo (100MB max, JPEG/PNG/WebP/HEIC) |
| PATCH  | `/api/admin/photos/[id]`                | Yes  | Update title/description                     |
| DELETE | `/api/admin/photos/[id]`                | Yes  | Delete photo + all files                     |
| POST   | `/api/admin/photos/[id]/reprocess`      | Yes  | Re-enqueue image processing                  |
| PUT    | `/api/admin/photos/[id]/albums`         | Yes  | Set album memberships                        |
| GET    | `/api/admin/albums`                     | Yes  | List albums with photo counts                |
| POST   | `/api/admin/albums`                     | Yes  | Create album                                 |
| PATCH  | `/api/admin/albums/[id]`                | Yes  | Update album                                 |
| DELETE | `/api/admin/albums/[id]`                | Yes  | Delete album (optionally with photos)        |
| POST   | `/api/admin/albums/reorder`             | Yes  | Reorder albums                               |
| POST   | `/api/admin/albums/[id]/photos/reorder` | Yes  | Reorder photos in album                      |
| GET    | `/api/images/[photoId]/[filename]`      | No   | Serve derivative (ETag + fallback)           |
| GET    | `/api/health`                           | No   | Health check                                 |

## DYNAMODB TABLES

| Table       | PK      | SK      | GSIs                                    | Purpose                 |
| ----------- | ------- | ------- | --------------------------------------- | ----------------------- |
| Photos      | id      | —       | status-createdAt, \_type-createdAt      | Photo metadata + status |
| Albums      | id      | —       | isPublished-sortOrder, \_type-sortOrder | Album metadata          |
| AlbumPhotos | albumId | photoId | photoId-albumId (inverse)               | Many-to-many junction   |

## CONVENTIONS

- **Path aliases**: `@/domain/*`, `@/infrastructure/*`, `@/presentation/*`, `@/application/*`
- **Pre-commit**: Husky + lint-staged (ESLint --fix + Prettier)
- **Tests**: Vitest with `__tests__/` dirs, `.test.ts` suffix. Coverage on `src/infrastructure/` only.
- **Lambda tests**: Separate config `vitest.lambda.config.ts`
- **CI**: lint → format:check → typecheck → build → test (GitHub Actions, Node 20)
- **Logging**: Structured JSON in production (`logger.info/warn/error`), prefixed console in dev
- **Env**: Zod-validated at import time. Build uses dummy values (see Dockerfile + CI).

## ANTI-PATTERNS (THIS PROJECT)

- **NEVER** import `@/infrastructure/config/env.ts` in Lambda handler — Zod schema requires web-only vars
- **NEVER** remove `.rotate()` from Sharp pipeline — breaks EXIF orientation
- **NEVER** remove `.withMetadata()` from Sharp pipeline — breaks sRGB color profiles
- **DO NOT** expose GPS, camera serial, or software tags from EXIF — privacy
- **DO NOT** use BullMQ/Redis for job queue — migrated to SQS
- **DO NOT** use SQLite/Drizzle for data access — migrated to DynamoDB

## COMMANDS

```bash
npm run dev           # Next.js dev server
npm run build         # Production build (needs env vars or dummies)
npm run test          # Vitest (unit + integration)
npm run lint          # ESLint
npm run format:check  # Prettier check
npm run typecheck     # tsc --noEmit
```

## NOTES

- `application/services/` is empty — business logic currently lives in API route handlers
- `storage/processed/` has thousands of UUID dirs (generated derivatives) — not source code
- Docker Compose includes: web, worker, redis, dynamodb-local
- Lambda has its own `Dockerfile`, `package.json`, `tsconfig.json` — separate build context
- Rate limiting degrades gracefully when Redis is down (security trade-off for availability)
- `layout.tsx` runs `initializeApp()` to create DynamoDB tables — skipped during `next build`
