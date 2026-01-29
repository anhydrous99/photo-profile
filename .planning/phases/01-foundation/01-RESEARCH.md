# Phase 1: Foundation - Research

**Researched:** 2026-01-27
**Domain:** Next.js scaffolding, Drizzle ORM with SQLite, Clean Architecture, Development tooling
**Confidence:** HIGH

## Summary

This phase establishes the core infrastructure for the photo portfolio application. Research confirms the standard approach involves Next.js 16 with App Router, Drizzle ORM with better-sqlite3, and a clean architecture folder structure inside `src/`. The decisions made in CONTEXT.md align well with current best practices.

Key findings:

- **Next.js 16** with `create-next-app` provides the ideal starting point with TypeScript, Tailwind, ESLint, and App Router enabled by default
- **Drizzle ORM** with better-sqlite3 is well-documented for SQLite, with clear patterns for many-to-many relationships via junction tables
- **Clean Architecture** layers inside `src/` work well with Next.js path aliases, enabling strict separation
- **Development tooling** (Husky + lint-staged + Zod env validation) has mature, well-documented patterns

**Primary recommendation:** Use `create-next-app@latest` with defaults, then restructure `src/` into clean architecture layers with path aliases pointing to each layer.

## Standard Stack

The established libraries/tools for this domain:

### Core

| Library        | Version | Purpose                    | Why Standard                                               |
| -------------- | ------- | -------------------------- | ---------------------------------------------------------- |
| Next.js        | ^16.0.0 | Full-stack React framework | App Router, Turbopack default, built-in image optimization |
| React          | ^19.2.0 | UI library                 | Ships with Next.js 16, React Compiler stable               |
| TypeScript     | ^5.5.0  | Type safety                | Required for Drizzle schema, strict mode recommended       |
| Drizzle ORM    | ^0.38.0 | Database ORM               | Code-first schema, SQL-like queries, zero dependencies     |
| better-sqlite3 | ^11.0.0 | SQLite driver              | Fastest synchronous driver, Drizzle recommended            |
| Zod            | ^3.23.0 | Schema validation          | Environment variable validation, runtime type safety       |

### Supporting

| Library                | Version | Purpose             | When to Use                           |
| ---------------------- | ------- | ------------------- | ------------------------------------- |
| drizzle-kit            | ^0.30.0 | Migration tooling   | Schema generation and database push   |
| @types/better-sqlite3  | ^7.6.0  | Type definitions    | TypeScript support for better-sqlite3 |
| ioredis                | ^5.4.0  | Redis client        | Connect to Redis in Docker for BullMQ |
| husky                  | ^9.0.0  | Git hooks           | Pre-commit hook management            |
| lint-staged            | ^15.0.0 | Staged file linting | Run linters on staged files only      |
| eslint-config-prettier | ^9.0.0  | ESLint + Prettier   | Prevent ESLint/Prettier conflicts     |

### Alternatives Considered

| Instead of     | Could Use          | Tradeoff                                                                |
| -------------- | ------------------ | ----------------------------------------------------------------------- |
| better-sqlite3 | libSQL             | libSQL adds Turso remote support but adds complexity for local-only use |
| Zod            | @t3-oss/env-nextjs | T3 env package is Zod-based but adds dependency; raw Zod is simpler     |
| Husky          | simple-git-hooks   | simple-git-hooks is lighter but Husky has better ecosystem support      |

**Installation:**

```bash
# After create-next-app
npm install drizzle-orm better-sqlite3 zod ioredis
npm install -D drizzle-kit @types/better-sqlite3 husky lint-staged eslint-config-prettier
```

## Architecture Patterns

### Recommended Project Structure

```
photo-profile/
├── app/                      # Next.js App Router (routes only)
│   ├── layout.tsx
│   ├── page.tsx
│   └── api/                  # API routes (thin handlers)
├── src/
│   ├── domain/               # Core business entities, no framework deps
│   │   ├── entities/         # Photo.ts, Album.ts
│   │   └── repositories/     # Repository interfaces (contracts)
│   ├── application/          # Use cases, orchestration
│   │   └── services/         # PhotoService.ts, AlbumService.ts
│   ├── infrastructure/       # External concerns implementation
│   │   ├── database/         # Drizzle schema, repository implementations
│   │   │   ├── schema.ts     # Drizzle table definitions
│   │   │   ├── client.ts     # Database connection
│   │   │   └── repositories/ # SQLitePhotoRepository.ts, etc.
│   │   ├── storage/          # File system operations
│   │   └── config/           # Environment validation
│   └── presentation/         # UI components, hooks
│       ├── components/       # Shared React components
│       └── hooks/            # Custom React hooks
├── storage/                  # File storage (gitignored except .gitkeep)
│   ├── originals/            # Original uploaded files
│   └── processed/            # Generated derivatives
├── drizzle/                  # Generated migrations (when using migrate)
├── public/                   # Static assets
├── drizzle.config.ts         # Drizzle Kit configuration
├── docker-compose.yml        # Local development services
└── .env.local                # Environment variables
```

### Pattern 1: Repository Interface in Domain

**What:** Define repository contracts in domain layer, implement in infrastructure
**When to use:** Always - this is core Clean Architecture
**Example:**

```typescript
// src/domain/repositories/PhotoRepository.ts
// Source: Clean Architecture (Robert C. Martin)
export interface PhotoRepository {
  findById(id: string): Promise<Photo | null>;
  findAll(): Promise<Photo[]>;
  findByAlbumId(albumId: string): Promise<Photo[]>;
  save(photo: Photo): Promise<void>;
  delete(id: string): Promise<void>;
}
```

### Pattern 2: Drizzle Schema with Many-to-Many

**What:** Junction table with proper indexing for photo-album relationships
**When to use:** For the PhotoAlbums many-to-many relationship
**Example:**

```typescript
// src/infrastructure/database/schema.ts
// Source: https://orm.drizzle.team/docs/relations-v2
import {
  sqliteTable,
  text,
  integer,
  index,
  primaryKey,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const photos = sqliteTable("photos", {
  id: text("id").primaryKey(),
  title: text("title"),
  description: text("description"),
  originalFilename: text("original_filename").notNull(),
  status: text("status", { enum: ["processing", "ready", "error"] })
    .notNull()
    .default("processing"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const albums = sqliteTable("albums", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  coverPhotoId: text("cover_photo_id").references(() => photos.id),
  sortOrder: integer("sort_order").notNull().default(0),
  isPublished: integer("is_published", { mode: "boolean" })
    .notNull()
    .default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const photoAlbums = sqliteTable(
  "photo_albums",
  {
    photoId: text("photo_id")
      .notNull()
      .references(() => photos.id, { onDelete: "cascade" }),
    albumId: text("album_id")
      .notNull()
      .references(() => albums.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.photoId, table.albumId] }),
    index("photo_albums_photo_idx").on(table.photoId),
    index("photo_albums_album_idx").on(table.albumId),
  ],
);
```

### Pattern 3: Environment Validation with Zod

**What:** Validate environment variables at startup with type inference
**When to use:** Always - fail fast on misconfiguration
**Example:**

```typescript
// src/infrastructure/config/env.ts
// Source: https://blog.stackademic.com/next-js-14-environment-variables-validation-using-zod
import { z } from "zod";

const envSchema = z.object({
  DATABASE_PATH: z.string().min(1, "DATABASE_PATH is required"),
  STORAGE_PATH: z.string().min(1, "STORAGE_PATH is required"),
  REDIS_URL: z.string().url().optional().default("redis://localhost:6379"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    "Invalid environment variables:",
    parsed.error.flatten().fieldErrors,
  );
  throw new Error("Invalid environment variables");
}

export const env = parsed.data;

// Extend NodeJS.ProcessEnv for TypeScript
declare global {
  namespace NodeJS {
    interface ProcessEnv extends z.infer<typeof envSchema> {}
  }
}
```

### Pattern 4: Path Aliases for Clean Architecture

**What:** Configure TypeScript path aliases to enforce layer imports
**When to use:** Always - makes imports clean and layer violations obvious
**Example:**

```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "baseUrl": ".",
    "paths": {
      "@/domain/*": ["src/domain/*"],
      "@/application/*": ["src/application/*"],
      "@/infrastructure/*": ["src/infrastructure/*"],
      "@/presentation/*": ["src/presentation/*"]
    }
  }
}
```

### Anti-Patterns to Avoid

- **Importing infrastructure in domain:** Domain layer must have zero external dependencies. Use interfaces and dependency injection.
- **Database calls in components:** Use services and repositories, never call Drizzle directly from React components.
- **Hardcoded configuration:** All configuration must come from validated environment variables.
- **Mixing route handlers with business logic:** Route handlers should be thin - validate input, call service, return response.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem                | Don't Build                         | Use Instead                            | Why                             |
| ---------------------- | ----------------------------------- | -------------------------------------- | ------------------------------- |
| ID generation          | Custom UUID function                | `crypto.randomUUID()` (Node.js native) | Native API, no dependencies     |
| Environment validation | Manual `if (!process.env.X)` checks | Zod schema validation                  | Type inference, detailed errors |
| Git hooks              | Manual `.git/hooks` scripts         | Husky                                  | Cross-platform, team-friendly   |
| Staged file linting    | Run lint on all files               | lint-staged                            | Fast, only checks changed files |
| SQLite timestamps      | String dates                        | `integer({ mode: 'timestamp_ms' })`    | Proper type coercion, indexable |
| Boolean storage        | Text 'true'/'false'                 | `integer({ mode: 'boolean' })`         | SQLite native pattern           |

**Key insight:** Foundation phase should use standard tooling exclusively. Custom solutions here create maintenance burden for all future phases.

## Common Pitfalls

### Pitfall 1: SQLite File Path Issues

**What goes wrong:** Database file created in wrong directory or permission errors
**Why it happens:** Relative paths resolve differently in development vs build
**How to avoid:** Use absolute paths resolved from project root
**Warning signs:** "SQLITE_CANTOPEN" errors, different behavior in dev vs production

```typescript
// Correct approach
import path from "path";
const dbPath = path.resolve(process.cwd(), process.env.DATABASE_PATH);
```

### Pitfall 2: Missing Drizzle Schema Export

**What goes wrong:** Relations not recognized, junction table queries fail
**Why it happens:** Schema files not exported from index or not included in drizzle.config
**How to avoid:** Create `src/infrastructure/database/schema/index.ts` that re-exports all tables
**Warning signs:** "Table not found" errors, empty relation results

### Pitfall 3: TypeScript Strict Mode Disabled

**What goes wrong:** Runtime null errors, implicit any types
**Why it happens:** Next.js defaults strict to false for easier onboarding
**How to avoid:** Explicitly set `"strict": true` in tsconfig.json after project creation
**Warning signs:** Missing type errors that should appear

### Pitfall 4: Pre-commit Hooks Not Running

**What goes wrong:** Commits bypass linting, bad code enters repository
**Why it happens:** Husky not installed properly or `.husky` directory missing
**How to avoid:** Run `npx husky install` after cloning, add to `prepare` script
**Warning signs:** Commits succeed immediately without lint output

### Pitfall 5: Environment Variables Not Loading

**What goes wrong:** Validation passes but values undefined at runtime
**Why it happens:** `.env.local` loaded after validation or not loaded in certain contexts
**How to avoid:** Call validation in `instrumentation.ts` or at module load time
**Warning signs:** Undefined values despite `.env.local` existing

### Pitfall 6: Drizzle Push Destroying Data

**What goes wrong:** Existing data lost during schema push
**Why it happens:** `drizzle-kit push` applies destructive changes without warning
**How to avoid:** Use `--strict` flag during development, use migrations for production
**Warning signs:** Data disappears after schema changes

## Code Examples

Verified patterns from official sources:

### Database Connection Setup

```typescript
// src/infrastructure/database/client.ts
// Source: https://orm.drizzle.team/docs/get-started-sqlite
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import path from "path";
import * as schema from "./schema";
import { env } from "@/infrastructure/config/env";

const dbPath = path.resolve(process.cwd(), env.DATABASE_PATH);
const sqlite = new Database(dbPath);
export const db = drizzle({ client: sqlite, schema });
```

### Repository Implementation

```typescript
// src/infrastructure/database/repositories/SQLitePhotoRepository.ts
import { eq } from "drizzle-orm";
import { db } from "../client";
import { photos } from "../schema";
import type { PhotoRepository } from "@/domain/repositories/PhotoRepository";
import type { Photo } from "@/domain/entities/Photo";

export class SQLitePhotoRepository implements PhotoRepository {
  async findById(id: string): Promise<Photo | null> {
    const result = await db
      .select()
      .from(photos)
      .where(eq(photos.id, id))
      .limit(1);
    return result[0] ?? null;
  }

  async findAll(): Promise<Photo[]> {
    return db.select().from(photos);
  }

  async save(photo: Photo): Promise<void> {
    await db
      .insert(photos)
      .values(photo)
      .onConflictDoUpdate({
        target: photos.id,
        set: { ...photo, updatedAt: Date.now() },
      });
  }

  async delete(id: string): Promise<void> {
    await db.delete(photos).where(eq(photos.id, id));
  }
}
```

### Drizzle Configuration

```typescript
// drizzle.config.ts
// Source: https://orm.drizzle.team/docs/drizzle-kit-push
import type { Config } from "drizzle-kit";

export default {
  schema: "./src/infrastructure/database/schema/index.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DATABASE_PATH || "./data/portfolio.db",
  },
} satisfies Config;
```

### Docker Compose for Development

```yaml
# docker-compose.yml
version: "3.8"

services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  redis_data:
```

### Husky and lint-staged Configuration

```json
// package.json (partial)
{
  "scripts": {
    "prepare": "husky install",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write .",
    "typecheck": "tsc --noEmit"
  },
  "lint-staged": {
    "*.{js,jsx,ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{json,md,yml,yaml}": ["prettier --write"]
  }
}
```

```bash
# .husky/pre-commit
npx lint-staged
```

## State of the Art

| Old Approach                       | Current Approach                    | When Changed | Impact                                      |
| ---------------------------------- | ----------------------------------- | ------------ | ------------------------------------------- |
| Drizzle relations v1               | relations v2 with `defineRelations` | 2025         | Cleaner many-to-many syntax with `through`  |
| `drizzle-kit generate` + `migrate` | `drizzle-kit push` for dev          | 2024         | Faster iteration, no migration files in dev |
| ESLint flat config optional        | ESLint flat config default          | 2025         | `eslint.config.mjs` instead of `.eslintrc`  |
| Husky v4 (package.json config)     | Husky v9 (file-based hooks)         | 2024         | `.husky/` directory with hook scripts       |

**Deprecated/outdated:**

- `next.config.js` → Use `next.config.ts` (TypeScript support native in Next.js 16)
- `.eslintrc.json` → Use `eslint.config.mjs` (flat config is now default)
- Manual `process.env` checks → Use Zod validation with type inference

## Open Questions

Things that couldn't be fully resolved:

1. **Shared utilities organization**
   - What we know: Clean architecture suggests utilities should live in the layer that uses them
   - What's unclear: Whether a dedicated `src/shared/` folder is better than per-layer organization
   - Recommendation: Start with per-layer organization; create shared folder only if duplication emerges

2. **Drizzle relations v2 adoption status**
   - What we know: v2 syntax with `defineRelations` exists in docs
   - What's unclear: Whether v2 is fully stable or still in beta
   - Recommendation: Use v2 syntax if available; fall back to v1 if issues arise

3. **Next.js instrumentation.ts for env validation**
   - What we know: `instrumentation.ts` runs at server startup
   - What's unclear: Exact timing relative to other module loads in Next.js 16
   - Recommendation: Import env config module at top of files that need it; validation runs on first import

## Sources

### Primary (HIGH confidence)

- [Drizzle ORM SQLite Guide](https://orm.drizzle.team/docs/get-started-sqlite) - Connection setup, schema definition
- [Drizzle Relations v2](https://orm.drizzle.team/docs/relations-v2) - Many-to-many with junction tables
- [Drizzle SQLite Column Types](https://orm.drizzle.team/docs/column-types/sqlite) - Integer modes, timestamps
- [Drizzle Kit Push](https://orm.drizzle.team/docs/drizzle-kit-push) - Push vs migrate workflow
- [Next.js Project Structure](https://nextjs.org/docs/app/getting-started/project-structure) - App Router conventions
- [Next.js Installation](https://nextjs.org/docs/app/getting-started/installation) - create-next-app options
- [Next.js TypeScript Config](https://nextjs.org/docs/app/api-reference/config/typescript) - Strict mode

### Secondary (MEDIUM confidence)

- [Zod Environment Validation](https://blog.stackademic.com/next-js-14-environment-variables-validation-using-zod) - Pattern for env validation
- [Husky + lint-staged Guide](https://betterstack.com/community/guides/scaling-nodejs/husky-and-lint-staged/) - Pre-commit setup
- [Clean Architecture TypeScript GitHub](https://github.com/Melzar/clean-architecture-nextjs-react-boilerplate) - Folder structure reference
- [Clean Architecture with Next.js](https://medium.com/@heinhtoo/clean-architecture-with-next-js-insights-from-lazar-nikolov-developer-advocate-at-sentry-abe1cb4c7ef3) - Layer organization

### Tertiary (LOW confidence)

- [Docker Compose Redis Next.js](https://github.com/JacobGrisham/Next.js-Docker-Redis-Sessions-JWT) - Docker setup reference (may need verification for Next.js 16)

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - All libraries verified in official documentation
- Architecture: HIGH - Clean Architecture is well-established; Next.js integration verified
- Drizzle patterns: HIGH - Official documentation consulted for all examples
- Tooling (Husky/lint-staged): MEDIUM - Community guides, but well-established patterns
- Docker Compose: MEDIUM - Standard Redis setup, but not Next.js 16 specific

**Research date:** 2026-01-27
**Valid until:** 60 days (stable technologies, Next.js 16 recently released)
