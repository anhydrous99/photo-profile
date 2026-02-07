# PROJECT KNOWLEDGE BASE

**Generated:** 2026-02-06
**Commit:** 8fb1a59
**Branch:** main

## OVERVIEW

Self-hosted photography portfolio. Next.js 16 App Router + TypeScript + SQLite (Drizzle ORM) + Sharp image processing + BullMQ job queue. Single admin user, public-facing gallery. Clean Architecture (domain/application/infrastructure/presentation).

## STRUCTURE

```
src/
├── domain/              # Pure interfaces, zero dependencies
│   ├── entities/        # Photo (with ExifData), Album
│   └── repositories/    # PhotoRepository, AlbumRepository interfaces
├── application/         # EMPTY — business logic lives in infra + API routes
├── infrastructure/
│   ├── auth/            # JWT (jose/HS256, 8h expiry), bcrypt, rate limiter, DAL
│   ├── config/          # Zod-validated env vars (fail-fast at startup)
│   ├── database/        # Drizzle ORM client, schema, SQLite repository impls
│   ├── jobs/            # BullMQ queue + standalone worker process
│   ├── services/        # Sharp image derivatives, EXIF extraction
│   └── storage/         # Filesystem ops (originals + processed dirs)
├── presentation/
│   ├── components/      # 19 React client components (barrel export via index.ts)
│   └── lib/             # XHR upload utility with progress tracking
├── app/                 # Next.js App Router
│   ├── actions/         # Server Action: login (rate-limited, bcrypt verify)
│   ├── admin/           # Protected admin panel
│   │   ├── login/       # Password-only login page
│   │   └── (protected)/ # Route group — layout.tsx verifies JWT
│   ├── albums/          # Public album pages (Server Components)
│   └── api/             # REST endpoints (admin/* + image serving)
├── lib/                 # Custom Next.js image loader
└── proxy.ts             # Edge middleware: cookie check on /admin/*, 404 if missing
scripts/                 # hash-password, backfill-exif, backfill-dimensions, backfill-blur
```

## WHERE TO LOOK

| Task                   | Location                                                                                    | Notes                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Add domain entity      | `src/domain/entities/`                                                                      | Plain TS interface, no methods                                   |
| Add repository method  | `src/domain/repositories/` (interface) + `src/infrastructure/database/repositories/` (impl) | Impl has `toDomain()`/`toDatabase()` mappers                     |
| Add API endpoint       | `src/app/api/admin/`                                                                        | Call `verifySession()` first; instantiate repos directly         |
| Add admin page         | `src/app/admin/(protected)/`                                                                | Server Component fetches data → passes props to Client Component |
| Add public page        | `src/app/` or `src/app/albums/`                                                             | Server Components, no auth                                       |
| Add React component    | `src/presentation/components/`                                                              | Mark `"use client"`, add to barrel `index.ts`                    |
| Modify auth            | `src/infrastructure/auth/`                                                                  | session.ts (JWT), dal.ts (verify), password.ts (bcrypt)          |
| Modify image pipeline  | `src/infrastructure/services/imageService.ts`                                               | Sharp derivatives: rotate() + resize() + withMetadata()          |
| Modify worker          | `src/infrastructure/jobs/workers/imageProcessor.ts`                                         | Concurrency=2; runs via `npm run worker`                         |
| Add DB column          | `src/infrastructure/database/schema.ts` + migration in `client.ts`                          | Timestamps are MILLISECONDS, not seconds                         |
| Serve new image format | `src/app/api/images/[photoId]/[filename]/route.ts`                                          | Add to MIME_TYPES map                                            |
| Environment config     | `src/infrastructure/config/env.ts`                                                          | Zod schema — app crashes on startup if invalid                   |

## CONVENTIONS

### Architecture Rules

- **Domain layer**: Zero imports from other layers. Entities are plain interfaces (no classes, no methods).
- **No application services**: Business logic is in API routes and infrastructure services. The `application/` layer is intentionally empty.
- **Repository instantiation**: Direct `new SQLitePhotoRepository()` in server components and API routes. No DI container.
- **Upsert pattern**: All `save()` methods use `onConflictDoUpdate` — single method for insert and update.

### Auth — Two-Layer Protection

1. `proxy.ts` (Edge): Checks cookie EXISTS → returns **404** if missing (hides admin panel existence)
2. `(protected)/layout.tsx` (Server Component): Full JWT verify → redirects to `/admin/login` if invalid

- API routes verify session independently via `verifySession()` at top of handler

### Data Flow Pattern

```
Server Component → fetches from repository → serializes props → Client Component
Client Component → useState for UI → fetch() for mutations → router.refresh() to revalidate
```

- No global state management (no Redux/Zustand/Context)
- Optimistic updates with rollback on error (AlbumSelector, SortableAlbumCard, drag-drop)

### Image Pipeline

```
Upload API → saveOriginalFile() → DB record (status="processing") → BullMQ job
Worker → generateDerivatives() → extractExifData() → generateBlurPlaceholder()
       → update photo: status="ready", blurDataUrl, exifData, width, height
```

- Derivatives: WebP (q82) + AVIF (q80) at [300, 600, 1200, 2400]px widths
- No upscaling — skips sizes larger than original
- Image API falls back to largest available derivative if requested size doesn't exist
- Worker concurrency: 2 (50MP images use ~144MB RAM each)

### File Naming

- Components: PascalCase (`PhotoGrid.tsx`)
- Utilities: camelCase (`uploadFile.ts`)
- All barrel exports via `index.ts`

### Styling

- Tailwind CSS v4 with `@tailwindcss/postcss` plugin (not legacy tailwindcss plugin)
- No CSS-in-JS, no CSS modules
- Geist font family (sans + mono)

## ANTI-PATTERNS (THIS PROJECT)

### NEVER

- Remove `.rotate()` from Sharp pipelines — images will render with wrong orientation
- Remove `.withMetadata()` from Sharp pipelines — colors will shift (loses sRGB ICC profile)
- Remove BullMQ worker error handlers (`on('error')`, `on('failed')`, `on('completed')`) — worker fails silently, photos stuck in "processing" forever
- Access GPS, camera serial, or software EXIF tags — privacy policy, only 11 fields extracted
- Use `middleware.ts` — project uses `proxy.ts` (Next.js 16 proxy pattern)
- Add `@ts-ignore`, `@ts-expect-error`, or `as any`

### KNOWN TYPE WORKAROUNDS

- `session.ts:40`: `payload as unknown as SessionPayload` — jose returns untyped payload, double-cast required
- `imageProcessor.ts:60-61`: `rotatedMeta.width!` / `height!` — Sharp metadata guaranteed after `.rotate()`
- `queues.ts:80`: `job.id!` — BullMQ always assigns ID after `queue.add()`
- `env.ts:29,31`: Two `eslint-disable` comments for NodeJS namespace augmentation

### WATCH OUT

- `application/services/` is empty (`.gitkeep` only) — business logic is in API routes and infra services
- Redis unavailable = jobs silently dropped. Upload succeeds but photo stays "processing". Expected in dev without Docker.
- Timestamps are **milliseconds** (`unixepoch() * 1000`), not seconds
- `exifData` column stores **JSON string** in SQLite, parsed/serialized by repository mappers
- `tags` on Album is comma-separated string, not array or JSON
- `export const dynamic = "force-dynamic"` on homepage — random photos require no caching
- Root layout metadata still has default "Create Next App" title — not yet customized

## COMMANDS

```bash
npm run dev              # Dev server (port 3000)
npm run build            # Production build
npm run lint             # ESLint (flat config, ESLint 9+)
npm run lint:fix         # ESLint with auto-fix
npm run format           # Prettier format all
npm run format:check     # Check formatting
npm run typecheck        # tsc --noEmit
npm run worker           # Start BullMQ image processing worker (separate process)
npm run db:push          # Push Drizzle schema to SQLite
npm run db:studio        # Drizzle Studio GUI
npm run exif:backfill    # Backfill EXIF metadata for existing photos
npm run dimensions:backfill  # Backfill image dimensions
```

Pre-commit hook: `lint-staged` runs `eslint --fix` + `prettier --write` on staged files.

## NOTES

- **Docker**: Multi-stage Dockerfile + docker-compose (web, worker, redis). Output: standalone. Worker copies full src + node_modules for tsx execution.
- **Redis**: Required for BullMQ (image jobs) and rate limiting. App degrades gracefully without it.
- **SQLite**: File-based at `DATABASE_PATH`. Auto-migrations in `client.ts` (phases 11-13). Foreign keys enabled at startup.
- **Admin password**: Generate hash with `npx tsx scripts/hash-password.ts <password>`, set as `ADMIN_PASSWORD_HASH` env var.
- **Image loader**: Custom loader (`src/lib/imageLoader.ts`) maps Next.js `<Image>` width requests to nearest derivative: `{src}/{bestWidth}w.webp`.
- **Upload**: Uses XMLHttpRequest (not fetch) for upload progress events. Fetch upload progress is not yet standardized.
- **Lightbox**: `yet-another-react-lightbox` loaded via dynamic import (code splitting). Supports EXIF panel, zoom, fullscreen.
- **Drag-drop**: `@dnd-kit/core` + `@dnd-kit/sortable` for album and photo reordering. Optimistic reorder → API call → rollback on error.
