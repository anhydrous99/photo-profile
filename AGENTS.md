# AGENTS.md — Photo Profile

Self-hosted photography portfolio. Next.js 16 App Router + TypeScript + DynamoDB (via AWS SDK) + Sharp image processing + BullMQ job queue. Single admin user, public-facing gallery. Clean Architecture layers under `src/`.

## COMMANDS

```bash
# --- Development ---
npm run dev                    # Next.js dev server (port 3000)
npm run worker                 # BullMQ image processing worker (separate process, requires Redis)

# --- Quality ---
npm run lint                   # ESLint 9 flat config (eslint-config-next + prettier)
npm run lint:fix               # ESLint with auto-fix
npm run format                 # Prettier format all files
npm run format:check           # Check formatting only
npm run typecheck              # tsc --noEmit

# --- Tests ---
npm run test                   # Vitest — run all tests once
npm run test:watch             # Vitest — watch mode
npx vitest run src/infrastructure/auth/__tests__/auth.test.ts       # Single test file
npx vitest run --testNamePattern="encrypt"                          # Run tests matching name
npx vitest run --coverage                                           # With V8 coverage

# --- Build & Deploy ---
npm run build                  # Production build (output: standalone)
npm run db:push                # Push Drizzle schema to SQLite
npm run db:studio              # Drizzle Studio GUI

# --- CDK (photo-profile-cdk/) ---
# cd ../photo-profile-cdk && npm run build && npx cdk synth
# Tests: npm test (Jest + ts-jest)
```

Pre-commit hook (`husky` + `lint-staged`): runs `eslint --fix` + `prettier --write` on staged `.ts/.tsx/.js/.jsx` files. CI runs: lint → format:check → typecheck → build → test.

## STRUCTURE

```
src/
├── domain/                    # Pure interfaces, ZERO external imports
│   ├── entities/              # Photo (with ExifData), Album — plain interfaces
│   └── repositories/          # PhotoRepository, AlbumRepository interfaces
├── application/               # EMPTY — business logic lives in API routes + infra services
├── infrastructure/
│   ├── auth/                  # JWT (jose HS256, 8h), bcrypt, rate limiter, DAL
│   ├── config/                # Zod-validated env vars (crash on startup if invalid)
│   ├── database/
│   │   ├── schema.ts          # Drizzle ORM SQLite schema (legacy)
│   │   ├── client.ts          # SQLite connection + auto-migrations
│   │   └── dynamodb/          # DynamoDB repositories, tables, client
│   ├── jobs/                  # BullMQ queue + standalone worker
│   ├── logging/               # Structured logger (JSON in prod, pretty in dev)
│   ├── services/              # Sharp image derivatives, EXIF extraction
│   ├── storage/               # StorageAdapter interface + filesystem/S3 implementations
│   └── validation/            # UUID validation helpers
├── presentation/
│   ├── components/            # React client components (barrel export via index.ts)
│   └── lib/                   # XHR upload utility with progress tracking
├── app/                       # Next.js App Router
│   ├── actions/               # Server Action: login (rate-limited, bcrypt verify)
│   ├── admin/login/           # Password-only login page
│   ├── admin/(protected)/     # Route group — layout.tsx verifies JWT
│   ├── albums/                # Public album pages (Server Components)
│   └── api/                   # REST endpoints (admin/* + image serving)
├── lib/                       # Custom Next.js image loader
└── proxy.ts                   # Edge: cookie check on /admin/*, 404 if missing
```

## WHERE TO LOOK

| Task                  | Files                                                                                                |
| --------------------- | ---------------------------------------------------------------------------------------------------- |
| Add domain entity     | `src/domain/entities/` — plain TS interface, add to barrel `index.ts`                                |
| Add repository method | `src/domain/repositories/` (interface) + `src/infrastructure/database/dynamodb/repositories/` (impl) |
| Add API endpoint      | `src/app/api/admin/` — call `verifySession()` first, instantiate repos directly                      |
| Add admin page        | `src/app/admin/(protected)/` — Server Component → Client Component pattern                           |
| Add public page       | `src/app/` or `src/app/albums/` — Server Components, no auth                                         |
| Add React component   | `src/presentation/components/` — `"use client"`, add to barrel `index.ts`                            |
| Modify auth           | `src/infrastructure/auth/` — session.ts (JWT), dal.ts, password.ts                                   |
| Modify image pipeline | `src/infrastructure/services/imageService.ts`                                                        |
| Modify worker         | `src/infrastructure/jobs/workers/imageProcessor.ts` (concurrency=2)                                  |
| Add storage operation | `src/infrastructure/storage/types.ts` (interface) + both adapter impls                               |
| Environment config    | `src/infrastructure/config/env.ts` — Zod schema, crash on invalid                                    |

## CODE STYLE

### TypeScript

- **Strict mode** enabled (`strict: true` in tsconfig)
- Path aliases: `@/*` → `./src/*`, `@/domain/*`, `@/infrastructure/*`, `@/presentation/*`, `@/application/*`
- Domain entities are **plain interfaces** — no classes, no methods
- Use `type` imports for type-only: `import type { Photo } from "@/domain/entities"`
- Validate inputs with **Zod** (`z.object({...}).safeParse(body)`)
- UUIDs for all entity IDs (`crypto.randomUUID()`)
- Timestamps are **milliseconds** (not seconds)

### Formatting & Linting

- **Prettier** for formatting (default config)
- **ESLint 9** flat config: `eslint-config-next/core-web-vitals` + `eslint-config-next/typescript` + `eslint-config-prettier`
- Trailing commas in multi-line (Prettier default)

### Naming

- Components: **PascalCase** files (`PhotoGrid.tsx`, `SortableAlbumCard.tsx`)
- Utilities/services: **camelCase** files (`uploadFile.ts`, `imageService.ts`)
- Repository classes: **PascalCase** (`DynamoDBPhotoRepository`)
- All modules use **barrel exports** via `index.ts`

### React & Next.js

- Client components: `"use client"` directive at top
- Data flow: Server Component fetches → serializes props → Client Component renders
- Mutations: Client calls `fetch()` → `router.refresh()` to revalidate
- No global state management (no Redux/Zustand/Context)
- Optimistic updates with rollback on error
- Styling: **Tailwind CSS v4** with `@tailwindcss/postcss` — no CSS-in-JS, no CSS modules

### API Routes

- Every admin route: `verifySession()` at top → 401 if null
- Validate params with `isValidUUID(id)` → 400 if invalid
- Validate body with Zod `safeParse` → 400 with `fieldErrors`
- Wrap handler in try/catch → `logger.error(...)` → 500
- Return `NextResponse.json(...)` with appropriate status codes
- Repository instantiated at module scope: `const repo = new DynamoDBPhotoRepository()`

### Error Handling

- API routes: try/catch with structured logging (`logger.error("route description", { error: ... })`)
- Error serialization: `error instanceof Error ? { message: error.message, stack: error.stack } : error`
- No empty catch blocks
- Redis/BullMQ failures: graceful degradation (photo stays "processing")

### Testing

- **Vitest** with globals enabled, node environment
- Tests colocated: `__tests__/` directories next to source files
- Mock pattern: `vi.hoisted()` for shared mock refs + `vi.mock()` for module mocks
- Import `{ describe, it, expect }` from `"vitest"` explicitly (even with globals)
- Test env vars set in `vitest.config.ts` (DATABASE_PATH=`:memory:`, etc.)
- Coverage: V8 provider, covers `src/infrastructure/**/*.ts`

## ANTI-PATTERNS — NEVER DO

- **Never** remove `.rotate()` from Sharp pipelines — images render with wrong orientation
- **Never** remove `.withMetadata()` from Sharp — colors shift (loses sRGB ICC profile)
- **Never** remove BullMQ worker error handlers — worker fails silently, photos stuck "processing"
- **Never** access GPS/camera serial/software EXIF tags — privacy policy, only 11 fields allowed
- **Never** use `middleware.ts` — project uses `proxy.ts` (Next.js 16 proxy pattern)
- **Never** add `@ts-ignore`, `@ts-expect-error`, or `as any`
- **Never** delete failing tests to make the suite pass

## KNOWN TYPE WORKAROUNDS

These are the ONLY acceptable non-strict type patterns in the codebase:

- `session.ts:40` — `payload as unknown as SessionPayload` (jose untyped payload)
- `imageProcessor.ts:60-61` — `rotatedMeta.width!` / `height!` (Sharp guarantees after `.rotate()`)
- `queues.ts:80` — `job.id!` (BullMQ assigns ID after `queue.add()`)
- `env.ts:29,31` — `eslint-disable` for NodeJS namespace augmentation

## WATCH OUT

- `application/services/` is **empty** (`.gitkeep`) — business logic is in API routes + infra services
- **Redis unavailable** = jobs silently dropped; photo stays "processing" forever. Expected in dev without Docker.
- `exifData` column stores **JSON string** in SQLite, parsed/serialized by repository mappers
- `tags` on Album is **comma-separated string**, not array or JSON
- `export const dynamic = "force-dynamic"` on homepage — random photos require no caching
- **Storage backend**: `STORAGE_BACKEND` env var switches between `filesystem` and `s3`; `getStorageAdapter()` is a singleton factory
- **DynamoDB**: Used for repositories; local dev via `dynamodb-local` in docker-compose (port 8000)
- **Image API**: Falls back to largest available derivative if requested size doesn't exist

## INFRASTRUCTURE

- **Docker**: Multi-stage Dockerfile + docker-compose (web, worker, redis, dynamodb-local). Output: standalone.
- **Redis**: Required for BullMQ + rate limiting. App degrades gracefully without it.
- **SQLite**: Legacy — Drizzle ORM schema still present. DynamoDB is the active data layer.
- **S3 + CloudFront**: Optional storage backend; filesystem is the default.
- **CDK**: `photo-profile-cdk/` — AWS CDK stack (scaffold only). Jest for tests.
- **Admin password**: `npx tsx scripts/hash-password.ts <password>` → set `ADMIN_PASSWORD_HASH` env var.
