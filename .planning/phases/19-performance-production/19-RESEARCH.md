# Phase 19: Performance & Production - Research

**Researched:** 2026-02-08
**Domain:** Performance measurement, bundle analysis, health checks, structured logging, targeted optimization
**Confidence:** HIGH

## Summary

Phase 19 covers five requirements spanning performance measurement (PERF-01, PERF-02), production infrastructure (PERF-03, PERF-04), and data-driven optimization (PERF-05). The codebase is a Next.js 16.1.6 App Router application with SQLite/better-sqlite3 for data and Sharp for image processing. No performance baselines, bundle analysis, health check, or structured logging currently exist.

The project has 50 `console.log/warn/error` calls across 22 files. There is no WAL mode on SQLite, no ETag/304 support on the image serving route (though immutable Cache-Control is set), and three public pages use `force-dynamic`. These represent concrete optimization targets once baselines are measured.

**Primary recommendation:** Use Lighthouse CLI for page-level baselines, `@next/bundle-analyzer` for bundle analysis, a lightweight custom logger (not pino -- too heavy for this single-user self-hosted app), and WAL mode + ETag as the first targeted optimization.

## Standard Stack

### Core

| Library                 | Version       | Purpose                                               | Why Standard                                         |
| ----------------------- | ------------- | ----------------------------------------------------- | ---------------------------------------------------- |
| `@next/bundle-analyzer` | 16.1.6        | Bundle size visualization via webpack-bundle-analyzer | Official Next.js package, matches Next.js version    |
| `lighthouse`            | latest (12.x) | Programmatic Lighthouse audits via CLI                | Official Google tool, industry standard for web perf |

### Supporting

| Library       | Version | Purpose                                  | When to Use                                         |
| ------------- | ------- | ---------------------------------------- | --------------------------------------------------- |
| `pino`        | 10.2.0  | High-performance structured JSON logging | Large-scale production apps needing log aggregation |
| `pino-pretty` | 13.x    | Dev-mode human-readable pino output      | Only if using pino                                  |

### Alternatives Considered

| Instead of                        | Could Use                                   | Tradeoff                                                                                                                                                                                                                            |
| --------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pino` (full library)             | Custom lightweight logger (~50 lines)       | This is a single-admin self-hosted app; pino adds a dependency with worker threads and native stream handling. A simple custom logger with JSON output, log levels, and `console.*` underneath is sufficient and avoids complexity. |
| `@next/bundle-analyzer` (webpack) | `npx next experimental-analyze` (Turbopack) | The experimental analyzer is built into Next.js 16 but may not be stable yet. `@next/bundle-analyzer` is proven and well-documented. Use it as primary, note experimental option.                                                   |
| `lighthouse` CLI                  | Chrome DevTools manual run                  | CLI enables reproducible scripted baselines; manual runs are not automatable or diffable.                                                                                                                                           |

**Installation:**

```bash
npm install --save-dev @next/bundle-analyzer
# lighthouse is run via npx, no install needed
# Custom logger: no additional dependencies
```

## Architecture Patterns

### Recommended Project Structure

```
src/
├── infrastructure/
│   ├── logging/
│   │   └── logger.ts           # Structured logger utility
│   └── database/
│       └── client.ts           # Add WAL mode pragma here
├── app/
│   └── api/
│       └── health/
│           └── route.ts        # Health check endpoint
├── scripts/
│   └── measure-performance.ts  # Lighthouse baseline script
```

### Pattern 1: Structured Logger Utility

**What:** A thin wrapper around `console.*` that outputs JSON in production and pretty text in development, with log levels (debug, info, warn, error).
**When to use:** Replace all `console.log/warn/error` calls throughout the codebase.
**Example:**

```typescript
// Source: Custom implementation following structured logging best practices
type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel = (process.env.LOG_LEVEL as LogLevel) || "info";

interface LogEntry {
  level: LogLevel;
  msg: string;
  timestamp: string;
  [key: string]: unknown;
}

function log(level: LogLevel, msg: string, data?: Record<string, unknown>) {
  if (LOG_LEVELS[level] < LOG_LEVELS[currentLevel]) return;

  const entry: LogEntry = {
    level,
    msg,
    timestamp: new Date().toISOString(),
    ...data,
  };

  if (process.env.NODE_ENV === "production") {
    const method =
      level === "error"
        ? console.error
        : level === "warn"
          ? console.warn
          : console.log;
    method(JSON.stringify(entry));
  } else {
    const prefix = `[${level.toUpperCase()}]`;
    const method =
      level === "error"
        ? console.error
        : level === "warn"
          ? console.warn
          : console.log;
    method(prefix, msg, data ? data : "");
  }
}

export const logger = {
  debug: (msg: string, data?: Record<string, unknown>) =>
    log("debug", msg, data),
  info: (msg: string, data?: Record<string, unknown>) => log("info", msg, data),
  warn: (msg: string, data?: Record<string, unknown>) => log("warn", msg, data),
  error: (msg: string, data?: Record<string, unknown>) =>
    log("error", msg, data),
};
```

### Pattern 2: Health Check Endpoint

**What:** `GET /api/health` that verifies DB connectivity (run a simple query) and storage access (check directory exists/writable).
**When to use:** Production readiness probes, container orchestration, monitoring.
**Example:**

```typescript
// Source: Health check best practices for Next.js API routes
import { NextResponse } from "next/server";

export async function GET() {
  const checks = {
    database: { status: "ok" as string },
    storage: { status: "ok" as string },
  };

  try {
    // DB check: run a simple query
    db.run(sql`SELECT 1`);
  } catch (e) {
    checks.database.status = "error";
  }

  try {
    // Storage check: verify directory accessible
    await access(env.STORAGE_PATH, constants.R_OK | constants.W_OK);
  } catch (e) {
    checks.storage.status = "error";
  }

  const allOk = Object.values(checks).every((c) => c.status === "ok");
  return NextResponse.json(
    { status: allOk ? "healthy" : "unhealthy", checks },
    { status: allOk ? 200 : 503 },
  );
}
```

### Pattern 3: SQLite WAL Mode

**What:** Enable Write-Ahead Logging for significantly better concurrent read/write performance.
**When to use:** Always for production SQLite. Must be set once after opening connection.
**Example:**

```typescript
// Source: better-sqlite3 docs + SQLite WAL documentation
const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
// Optionally: sqlite.pragma("synchronous = normal"); // safe with WAL
```

### Pattern 4: ETag/304 for Image Serving

**What:** Add ETag header based on file modification time + size, return 304 if client sends matching `If-None-Match`.
**When to use:** For the image serving API route (`/api/images/[photoId]/[filename]`), which already sets `Cache-Control: immutable` but does not support conditional requests.
**Example:**

```typescript
// Source: HTTP caching best practices + MDN ETag docs
import { createHash } from "crypto";

function generateETag(mtime: Date, size: number): string {
  const hash = createHash("md5")
    .update(`${mtime.getTime()}-${size}`)
    .digest("hex")
    .slice(0, 16);
  return `"${hash}"`;
}

// In the request handler:
const fileStat = await stat(filePath);
const etag = generateETag(fileStat.mtime, fileStat.size);

if (request.headers.get("if-none-match") === etag) {
  return new NextResponse(null, { status: 304 });
}

return new NextResponse(fileBuffer, {
  headers: {
    "Content-Type": mimeType,
    ETag: etag,
    "Cache-Control": "public, max-age=31536000, immutable",
  },
});
```

### Anti-Patterns to Avoid

- **Optimizing before measuring:** PERF-05 explicitly requires measurement-informed optimization. Never apply optimizations speculatively.
- **Replacing all console.\* calls at once without testing:** Migrate incrementally, file by file, to catch any issues.
- **Adding pino for a single-user app:** Pino pulls in worker threads and stream management. A custom ~50-line logger meets all requirements without the complexity.
- **Running Lighthouse in CI without a running server:** Lighthouse needs a live server to audit. Scripts must start/stop the dev or production server.

## Don't Hand-Roll

| Problem                   | Don't Build               | Use Instead                        | Why                                                                                         |
| ------------------------- | ------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------- |
| Bundle size visualization | Custom webpack plugin     | `@next/bundle-analyzer`            | Wraps webpack-bundle-analyzer, produces interactive treemap HTML                            |
| Lighthouse audits         | Manual browser DevTools   | `npx lighthouse` CLI               | Reproducible, scriptable, JSON output for diffing                                           |
| JSON structured logging   | Low-level stream handling | Thin console wrapper (shown above) | For this app's scale, console methods are sufficient; no need for transports/worker threads |

**Key insight:** This project is a self-hosted single-admin photography portfolio. The performance and logging needs are modest. Heavyweight observability tooling (pino transports, OpenTelemetry, etc.) would be over-engineering. Simple, testable utilities are the right choice.

## Common Pitfalls

### Pitfall 1: Lighthouse Scores Vary Between Runs

**What goes wrong:** Lighthouse scores can fluctuate by 5-10 points between runs due to CPU load, network conditions, and process scheduling.
**Why it happens:** Lighthouse runs in a real browser instance and is sensitive to system state.
**How to avoid:** Run multiple times (3-5) and take the median. Document the machine and conditions used. Run against a production build (`npm run build && npm start`), not dev mode.
**Warning signs:** Wildly different scores between runs on the same page.

### Pitfall 2: Bundle Analyzer Shows Development-Only Code

**What goes wrong:** Analyzing a development build inflates bundle sizes with source maps and dev-mode React code.
**Why it happens:** `ANALYZE=true npm run build` must use production mode. If `NODE_ENV` is not set to production, the analysis is misleading.
**How to avoid:** Always run `ANALYZE=true npm run build` which defaults to production mode.
**Warning signs:** React showing as ~3x larger than expected.

### Pitfall 3: WAL Mode Not Persisting

**What goes wrong:** WAL mode is set per-connection, not per-database (though once set, it does persist to the database file). However, if the database is re-created (e.g., in tests with `:memory:`), WAL mode must be set again.
**Why it happens:** In-memory databases reset all pragmas. The `pragma` call must happen on every connection open.
**How to avoid:** Set WAL mode immediately after `new Database(...)` in the client initialization code. For tests using `:memory:`, WAL mode is irrelevant (no file I/O).
**Warning signs:** `PRAGMA journal_mode` returning `delete` instead of `wal`.

### Pitfall 4: Health Check Creating Side Effects

**What goes wrong:** A health check endpoint that writes data, creates files, or has expensive queries can become a performance problem itself when polled frequently.
**Why it happens:** Over-eager health checks that do more than simple connectivity verification.
**How to avoid:** Use `SELECT 1` for DB, `fs.access()` for storage. Never write. Keep the endpoint fast (<50ms).
**Warning signs:** Health check showing up in performance profiles as significant overhead.

### Pitfall 5: Structured Logger Breaking Error Stack Traces

**What goes wrong:** When logging Error objects, `JSON.stringify` drops the `stack` property (it's not enumerable).
**Why it happens:** `Error.stack` and `Error.message` are not enumerable properties.
**How to avoid:** Explicitly extract `message` and `stack` from Error objects before logging. The logger should handle Error objects specially.
**Warning signs:** Error logs showing `{}` instead of the actual error information.

## Code Examples

### Lighthouse CLI Baseline Script

```typescript
// scripts/measure-performance.ts
// Run: npx lighthouse http://localhost:3000 --output=json --output-path=./baselines/home.json --chrome-flags="--headless=new"
// Public pages to audit: /, /albums, /albums/[id]
//
// Capture key metrics:
// - Performance score
// - First Contentful Paint (FCP)
// - Largest Contentful Paint (LCP)
// - Time to Interactive (TTI)
// - Cumulative Layout Shift (CLS)
// - Total Blocking Time (TBT)
```

### Bundle Analyzer Configuration (next.config.ts)

```typescript
// Source: @next/bundle-analyzer npm docs
import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
  openAnalyzer: true,
});

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    loader: "custom",
    loaderFile: "./src/lib/imageLoader.ts",
  },
};

export default withBundleAnalyzer(nextConfig);
```

### NPM Script for Analysis

```json
{
  "scripts": {
    "analyze": "ANALYZE=true next build"
  }
}
```

## Current Codebase State

### Console Usage Inventory (50 calls across 22 files)

| Area              | Files    | Calls    | Pattern                                             |
| ----------------- | -------- | -------- | --------------------------------------------------- |
| Worker/jobs       | 4 files  | 18 calls | `[Worker]`, `[ImageWorker]`, `[EnvLoader]` prefixes |
| API routes        | 10 files | 16 calls | `[API] METHOD /path:` prefix in catch blocks        |
| Database client   | 1 file   | 5 calls  | `[DB]` prefix for migrations/init                   |
| Auth/rate limiter | 1 file   | 2 calls  | `[Rate Limiter]` prefix                             |
| Error boundaries  | 3 files  | 3 calls  | `console.error` in useEffect                        |
| Config/env        | 1 file   | 1 call   | Validation error output                             |
| Repository        | 1 file   | 1 call   | JSON parse error                                    |
| Test fixtures     | 1 file   | 4 calls  | Generation output                                   |

### Current Caching State

- Image API route: `Cache-Control: public, max-age=31536000, immutable` (good, but no ETag/304)
- No WAL mode on SQLite
- Three pages use `export const dynamic = "force-dynamic"`: `/`, `/photo/[slug]`, admin dashboard
- Albums pages (`/albums`, `/albums/[id]`) have no explicit caching directive (default Next.js behavior)

### Database Client Initialization

- Located at `src/infrastructure/database/client.ts`
- Uses `better-sqlite3` directly with `drizzle` ORM
- `foreign_keys = ON` is set, but no `journal_mode` or `synchronous` pragmas
- Already exports the raw `sqlite` instance (not directly, but accessible)

## State of the Art

| Old Approach                  | Current Approach                                        | When Changed                     | Impact                                           |
| ----------------------------- | ------------------------------------------------------- | -------------------------------- | ------------------------------------------------ |
| `@next/bundle-analyzer` only  | Next.js 16 `experimental-analyze` (Turbopack)           | Next.js 16.1 (2025)              | Built-in alternative, but still experimental     |
| Manual Lighthouse in DevTools | `npx lighthouse` CLI with JSON output                   | Stable for years                 | Scriptable, diffable baselines                   |
| `pino` for all logging        | Lightweight custom loggers or `pino` depending on scale | Ongoing                          | Smaller apps benefit from simpler approach       |
| SQLite default journal mode   | WAL mode as default recommendation                      | SQLite community consensus 2020+ | 10-70x improvement in concurrent read/write perf |

**Deprecated/outdated:**

- `next-logger` (v5 uses Next.js instrumentation hooks, but adds unnecessary complexity for this project)
- `webpack-bundle-analyzer` directly (use `@next/bundle-analyzer` wrapper instead)

## Open Questions

1. **Lighthouse automation scope**
   - What we know: Lighthouse CLI can audit individual pages and output JSON. The project has 3 public page types (home, albums list, album detail, photo deep link).
   - What's unclear: Whether to run Lighthouse as part of a CI pipeline or as a manual baseline-only exercise.
   - Recommendation: Manual baseline-only for Phase 19. CI integration is a future phase concern. Document the commands and save the JSON reports in `.planning/baselines/`.

2. **LOG_LEVEL environment variable**
   - What we know: The logger needs a configurable log level. The env schema is validated with Zod in `src/infrastructure/config/env.ts`.
   - What's unclear: Whether to add LOG_LEVEL to the required env schema or make it optional with a sensible default.
   - Recommendation: Add as optional to env schema with default `"info"` in production and `"debug"` in development.

3. **Scope of console.log replacement**
   - What we know: 50 calls across 22 files. Some are in test fixtures, error boundaries (client-side), and the env validation module.
   - What's unclear: Whether to replace ALL calls including client-side error boundaries and test fixtures.
   - Recommendation: Replace server-side calls only (infrastructure, API routes, worker). Leave client-side error boundaries and test fixtures as-is since the structured logger is a server-side utility.

## Sources

### Primary (HIGH confidence)

- Codebase inspection - all file paths, patterns, and counts verified by direct reading
- [SQLite WAL mode documentation](https://sqlite.org/wal.html) - WAL mode behavior and benefits
- [better-sqlite3 performance docs](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/performance.md) - WAL recommendation for better-sqlite3
- [Next.js Bundle Analyzer docs](https://nextjs.org/docs/app/building-your-application/optimizing/bundle-analyzer) - Official setup instructions
- [@next/bundle-analyzer npm](https://www.npmjs.com/package/@next/bundle-analyzer) - v16.1.6, matches project's Next.js version

### Secondary (MEDIUM confidence)

- [Structured logging for Next.js (Arcjet blog)](https://blog.arcjet.com/structured-logging-in-json-for-next-js/) - Pino vs custom approaches
- [Pino npm](https://www.npmjs.com/package/pino) - v10.2.0 latest
- [Google Lighthouse overview](https://developer.chrome.com/docs/lighthouse/overview) - CLI usage
- [Health check best practices (Hyperping)](https://hyperping.com/blog/nextjs-health-check-endpoint) - Next.js health check patterns
- [SQLite performance tuning (phiresky)](https://phiresky.github.io/blog/2020/sqlite-performance-tuning/) - WAL + pragma recommendations

### Tertiary (LOW confidence)

- None - all findings verified with primary or secondary sources

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - @next/bundle-analyzer is the official solution; Lighthouse CLI is the industry standard; custom logger approach verified against project needs
- Architecture: HIGH - All patterns verified against the existing codebase structure; health check, logger, and WAL mode are straightforward additions
- Pitfalls: HIGH - Lighthouse variability, WAL persistence, Error serialization are well-documented issues with known mitigations

**Research date:** 2026-02-08
**Valid until:** 2026-03-10 (30 days - stable domain, no fast-moving dependencies)
