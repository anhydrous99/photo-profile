# AGENTS.md — Photo Profile

Photography portfolio for Vercel deployment. Next.js 16 App Router + TypeScript + DynamoDB (via AWS SDK) + Sharp image processing + Lambda + SQS job queue. Single admin user, public-facing gallery. Clean Architecture layers under `src/`.

## COMMANDS

```bash
# --- Development ---
npm run dev                    # Next.js dev server (port 3000)

# --- Quality ---
npm run lint                   # ESLint 9 flat config (eslint-config-next + prettier)
npm run lint:fix               # ESLint with auto-fix
npm run format                 # Prettier format all files
npm run format:check           # Check formatting only
npm run typecheck              # tsc --noEmit

# --- Tests (Vitest) ---
npm run test                   # Run all tests once
npm run test:watch             # Watch mode
npx vitest run src/infrastructure/auth/__tests__/auth.test.ts       # Single test file
npx vitest run --testNamePattern="encrypt"                          # Run tests matching name
npx vitest run --coverage                                           # With V8 coverage

# --- Build ---
npm run build                  # Production build (output: standalone)
npm run build:lambda           # Build Lambda package with Sharp ARM64 binary
```

Pre-commit hook (`husky` + `lint-staged`): runs `eslint --fix` + `prettier --write` on staged `.ts/.tsx/.js/.jsx/.json/.md/.yml/.yaml` files. CI pipeline: lint → format:check → typecheck → build → test.

## STRUCTURE

```
src/
├── domain/                    # Pure interfaces, ZERO external imports
│   ├── entities/              # Photo (with ExifData), Album — plain interfaces
│   └── repositories/          # PhotoRepository, AlbumRepository interfaces
├── application/               # EMPTY (.gitkeep) — logic lives in API routes + infra services
├── infrastructure/
│   ├── auth/                  # JWT (jose HS256, 8h), bcrypt, rate limiter, DAL
│   ├── config/                # Zod-validated env vars (crash on startup if invalid)
│   ├── database/dynamodb/     # DynamoDB repositories, tables, client
│   ├── jobs/                  # SQS enqueue + Lambda handler
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
| Modify Lambda handler | `src/infrastructure/jobs/lambdaHandler.ts` — SQS event handler                                       |
| Environment config    | `src/infrastructure/config/env.ts` — Zod schema, crash on invalid                                    |

## CODE STYLE

### TypeScript

- **Strict mode** (`strict: true` in tsconfig)
- Path aliases: `@/*` → `./src/*`, `@/domain/*`, `@/infrastructure/*`, `@/presentation/*`, `@/application/*`
- Domain entities are **plain interfaces** — no classes, no methods
- Use `type` imports for type-only: `import type { Photo } from "@/domain/entities"`
- Validate inputs with **Zod 4** — use `z.object({...}).safeParse(body)` and `z.flattenError(result.error).fieldErrors` for error details (NOT v3's `result.error.flatten()`)
- UUIDs for all entity IDs (`crypto.randomUUID()`)
- Timestamps are **milliseconds** (not seconds)

### Formatting & Linting

- **Prettier** (default config) + **ESLint 9** flat config: `eslint-config-next/core-web-vitals` + `eslint-config-next/typescript` + `eslint-config-prettier`
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
- Styling: **Tailwind CSS v4** with `@tailwindcss/postcss` — no CSS-in-JS, no CSS modules
- **Never** use `middleware.ts` — project uses `proxy.ts` (Next.js 16 proxy pattern)

### API Routes

- Every admin route: `verifySession()` at top → 401 if null
- Validate params with `isValidUUID(id)` → 400 if invalid
- Validate body with Zod `safeParse` → 400 with `z.flattenError(result.error).fieldErrors`
- Wrap handler in try/catch → `logger.error(...)` → 500
- Return `NextResponse.json(...)` with appropriate status codes
- Repository instantiated at **module scope**: `const repo = new DynamoDBPhotoRepository()`

### Error Handling

- API routes: try/catch with structured logging (`logger.error("route description", { error: ... })`)
- Error serialization: `error instanceof Error ? { message: error.message, stack: error.stack } : error`
- No empty catch blocks
- Lambda/SQS failures: photo stays "processing", check CloudWatch logs and DLQ

### Testing

- **Vitest** with globals enabled, node environment (23 test files)
- Tests colocated: `__tests__/` directories next to source files
- Mock pattern: `vi.hoisted()` for shared mock refs + `vi.mock()` for module mocks
- Import `{ describe, it, expect }` from `"vitest"` explicitly (even with globals)
- Test env vars set in `vitest.config.ts`
- Coverage: V8 provider, covers `src/infrastructure/**/*.ts`

## ANTI-PATTERNS — NEVER DO

- **Never** remove `.rotate()` from Sharp pipelines — images render with wrong orientation
- **Never** remove `.withMetadata()` from Sharp — colors shift (loses sRGB ICC profile)
- **Never** access GPS/camera serial/software EXIF tags — privacy policy, only 11 fields allowed
- **Never** use `middleware.ts` — project uses `proxy.ts` (Next.js 16 proxy pattern)
- **Never** add `@ts-ignore`, `@ts-expect-error`, or `as any`
- **Never** delete failing tests to make the suite pass

## KNOWN TYPE WORKAROUNDS

These are the ONLY acceptable non-strict type patterns in the codebase:

- `session.ts:41` — `payload as unknown as SessionPayload` (jose untyped JWT payload)
- `env.ts:112,114` — `eslint-disable-next-line` for NodeJS namespace augmentation (`@typescript-eslint/no-namespace`, `@typescript-eslint/no-empty-object-type`)
- `rateLimiter.test.ts:12` — `as unknown as Record<string, unknown>` (mock class casting)
- `PhotoGrid.tsx:150`, `SortablePhotoCard.tsx:58`, `AlbumDetailClient.tsx:199` — `eslint-disable-next-line @next/next/no-img-element` (custom image serving via API, not `next/image`)
- `global-error.tsx:74` — `eslint-disable-next-line @next/next/no-html-link-for-pages` (root layout unavailable in global error boundary)

## WATCH OUT

- `tags` on Album is **comma-separated string**, not array or JSON
- `export const dynamic = "force-dynamic"` on homepage — random photos require no caching
- **Storage backend**: `STORAGE_BACKEND` env var switches between `filesystem` and `s3`; `getStorageAdapter()` is a singleton factory
- **DynamoDB**: Local dev via `dynamodb-local` in docker-compose (port 8000). Tables auto-created on first run.
- **Image API**: Falls back to largest available derivative if requested size doesn't exist
- **Test parallelism**: `fileParallelism: false` in vitest config — tests run sequentially (DynamoDB shared state)

## INFRASTRUCTURE

- **Docker**: Multi-stage Dockerfile + docker-compose (web, worker, redis, dynamodb-local). Output: standalone.
- **Upstash Redis**: Required for rate limiting (serverless-compatible).
- **S3 + CloudFront**: Optional storage backend; filesystem is the default.
- **Lambda + SQS**: Image processing queue for Vercel deployment. Lambda handler at `src/infrastructure/jobs/lambdaHandler.ts`.
- **CDK**: `photo-profile-cdk/` — AWS CDK stack (Lambda, SQS, DLQ, IAM). Jest for tests.
- **Admin password**: `npx tsx scripts/hash-password.ts <password>` → set `ADMIN_PASSWORD_HASH` env var.
