# Phase 16: Error Boundaries & API Hardening - Research

**Researched:** 2026-02-07
**Domain:** Next.js App Router error handling, Zod validation, API hardening
**Confidence:** HIGH

## Summary

This phase adds the missing error-handling infrastructure to the photo-profile app. Currently, the codebase has zero error.tsx, global-error.tsx, not-found.tsx, or loading.tsx files. API routes have inconsistent error handling: some use Zod (albums routes) while others use raw type assertions (photos PATCH, photos/albums POST/DELETE). The upload route silently swallows Redis/queue failures with an empty catch block and does not enforce a file size limit before reading the file into memory. There is exactly one `JSON.parse` call in a repository `toDomain()` method (exifData in SQLitePhotoRepository) that is unwrapped.

The work is straightforward because Next.js App Router has well-defined file conventions for all error states. No new libraries are needed -- the project already has Zod v4 (`^4.3.6`) for validation and Tailwind CSS v4 for styling. The main technical nuance is that `.flatten()` on ZodError is deprecated in Zod v4 and should be migrated to `z.flattenError()` during this phase.

**Primary recommendation:** Create error boundary files at strategic route segments, standardize all API routes to use Zod validation with consistent try/catch + error response shape, and fix the upload route's silent failure and missing size guard.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- Oversized file rejection: show a toast notification with the rejection reason (e.g., "File exceeds 25MB limit"), upload area resets
- Multi-file uploads with partial failures: upload the valid files, show a summary of what failed and why (don't reject the entire batch)

### Claude's Discretion

- Error page design: visual style, tone, retry button placement, navigation options for error.tsx, global-error.tsx, not-found.tsx
- Loading state approach: skeletons vs spinners vs shimmer for loading.tsx route segments
- API error response shape: status code conventions, detail level, Zod validation message formatting
- Job failure notification: how admin discovers failed processing jobs (error badge, toast, or other pattern -- fit existing admin UI)
- Queue unavailability during upload: whether to reject the upload or save the file and warn (fit existing graceful degradation patterns)

### Deferred Ideas (OUT OF SCOPE)

None -- discussion stayed within phase scope

</user_constraints>

## Standard Stack

### Core

| Library      | Version | Purpose                                                                  | Why Standard                                        |
| ------------ | ------- | ------------------------------------------------------------------------ | --------------------------------------------------- |
| Next.js      | 16.1.6  | error.tsx, global-error.tsx, not-found.tsx, loading.tsx file conventions | Built-in App Router support, no alternatives needed |
| Zod          | ^4.3.6  | API route input validation                                               | Already used in 4 routes; standardize to all routes |
| Tailwind CSS | v4      | Error page styling                                                       | Already the project's styling approach              |
| React        | 19.2.3  | useEffect for error logging in error boundaries                          | Required for Client Components                      |

### Supporting

| Library        | Version | Purpose                                  | When to Use                                |
| -------------- | ------- | ---------------------------------------- | ------------------------------------------ |
| react-dropzone | ^14.4.0 | Already handles file rejection callbacks | Used for client-side file size enforcement |

### Alternatives Considered

| Instead of                  | Could Use               | Tradeoff                                                       |
| --------------------------- | ----------------------- | -------------------------------------------------------------- |
| Custom error shapes         | tRPC / next-safe-action | Overkill for 8 API routes with simple REST patterns            |
| Skeleton components library | react-loading-skeleton  | Unnecessary dependency for simple loading states with Tailwind |

**Installation:**

```bash
# No new packages needed -- all tools are already in the project
```

## Architecture Patterns

### Error File Placement Map

```
src/app/
  error.tsx              # ERR-01: Root error boundary (public pages)
  global-error.tsx       # ERR-02: Root layout error fallback (own html/body)
  not-found.tsx          # ERR-05: Styled 404 page
  loading.tsx            # ERR-06: Root loading state
  albums/
    [id]/
      error.tsx          # ERR-03: Album detail error boundary
      loading.tsx        # ERR-06: Album detail loading
  admin/
    (protected)/
      error.tsx          # ERR-04: Admin error boundary
      loading.tsx        # ERR-06: Admin loading state
```

### Pattern 1: Error Boundary (Client Component)

**What:** Next.js error.tsx must be a Client Component that receives `error` and `reset` props
**When to use:** Every route segment that should catch rendering errors

```typescript
// Source: https://nextjs.org/docs/app/building-your-application/routing/error-handling
"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div>
      <h2>Something went wrong</h2>
      <button onClick={() => reset()}>Try again</button>
    </div>
  );
}
```

### Pattern 2: Global Error (requires own html/body)

**What:** global-error.tsx catches errors in the root layout itself. It MUST provide its own `<html>` and `<body>` tags since it replaces the root layout entirely.
**When to use:** Only at `src/app/global-error.tsx`

```typescript
// Source: https://nextjs.org/docs/app/building-your-application/routing/error-handling
"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body>
        <h2>Something went wrong</h2>
        <button onClick={() => reset()}>Try again</button>
      </body>
    </html>
  );
}
```

### Pattern 3: Not Found (Server Component by default)

**What:** not-found.tsx is a Server Component that renders when `notFound()` is called or when no route matches
**When to use:** At `src/app/not-found.tsx` for app-wide 404

```typescript
// Source: https://nextjs.org/docs/app/api-reference/file-conventions/not-found
import Link from "next/link";

export default function NotFound() {
  return (
    <div>
      <h2>Not Found</h2>
      <p>Could not find the requested resource</p>
      <Link href="/">Return Home</Link>
    </div>
  );
}
```

### Pattern 4: Loading State (Server Component)

**What:** loading.tsx automatically wraps the page.tsx and children in a `<Suspense>` boundary
**When to use:** Route segments with data fetching that could cause navigation delay

```typescript
// Source: https://nextjs.org/docs/app/building-your-application/routing/loading-ui-and-streaming
export default function Loading() {
  return <LoadingSkeleton />;
}
```

### Pattern 5: Consistent API Error Response

**What:** Standard try/catch pattern for all API routes with consistent error shape
**When to use:** Every API route handler

```typescript
// Recommended standard pattern for all API routes
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  field: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const result = schema.safeParse(body);

    if (!result.success) {
      // Use z.flattenError() instead of deprecated .flatten()
      const flat = z.flattenError(result.error);
      return NextResponse.json(
        { error: "Validation failed", details: flat.fieldErrors },
        { status: 400 },
      );
    }

    // ... business logic ...

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error("[API] POST /api/route-name:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
```

### Anti-Patterns to Avoid

- **Using `as` type assertions instead of Zod:** Three routes currently do this (photos PATCH body, photos/albums POST body, photos/albums DELETE body). Replace with Zod schemas.
- **Empty catch blocks:** The upload route swallows Redis errors silently (`catch (error) { // Redis unavailable }`). Always log errors.
- **Inconsistent error response shapes:** Some routes return `{ error: string }`, some return `{ error: string, details: ... }`, the image route returns plain text. Standardize to JSON.
- **Exposing raw error messages to clients:** Never send `error.message` or stack traces in API responses. Log internally, return generic message.

## Don't Hand-Roll

| Problem                 | Don't Build                       | Use Instead                                         | Why                                                                             |
| ----------------------- | --------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------- |
| Input validation        | Manual type checks with `typeof`  | Zod schemas with `safeParse`                        | Type-safe, consistent error messages, handles edge cases                        |
| Error boundary wrapping | Custom React error boundary class | Next.js error.tsx convention                        | Handles SSR, streaming, and RSC integration automatically                       |
| Suspense boundaries     | Manual Suspense wrappers per page | Next.js loading.tsx convention                      | Auto-wraps page.tsx, handles prefetching and streaming                          |
| 404 pages               | Manual redirect logic             | Next.js not-found.tsx + `notFound()` function       | Proper HTTP status codes, automatic for unmatched URLs                          |
| Form data size checking | Streaming parsers (busboy/multer) | Content-Length header check + File.size after parse | formData() already buffers; check Content-Length early, File.size as validation |

**Key insight:** Next.js App Router's file conventions (error.tsx, loading.tsx, not-found.tsx, global-error.tsx) handle all the complexity of React error boundaries, Suspense, and SSR integration. Use the conventions, not custom solutions.

## Common Pitfalls

### Pitfall 1: Forgetting `"use client"` on error.tsx

**What goes wrong:** error.tsx and global-error.tsx silently fail or cause build errors without the Client Component directive.
**Why it happens:** error boundaries need `useEffect` and event handlers (reset button).
**How to avoid:** Always add `"use client"` as the first line of error.tsx and global-error.tsx.
**Warning signs:** Build error mentioning "Server Component" constraints, or error boundary not catching errors.

### Pitfall 2: global-error.tsx without html/body tags

**What goes wrong:** When root layout throws, global-error.tsx replaces it entirely. Without its own `<html>` and `<body>` tags, the page renders broken HTML.
**Why it happens:** Root error.tsx does not catch root layout errors -- only global-error.tsx does, and it must be self-contained.
**How to avoid:** Always include `<html>` and `<body>` in global-error.tsx. Duplicate font/theme setup if needed.
**Warning signs:** Unstyled error page, missing CSS, broken layout when root layout fails.

### Pitfall 3: Zod v4 `.flatten()` deprecation

**What goes wrong:** The existing code uses `result.error.flatten()` which is deprecated in Zod v4. It still works currently but may be removed.
**Why it happens:** The codebase was written targeting Zod v3 API patterns.
**How to avoid:** Replace `result.error.flatten()` with `z.flattenError(result.error)` in all 4 existing usages plus new routes.
**Warning signs:** Deprecation warnings in console or linting output.

### Pitfall 4: Content-Length is not reliable for multipart/form-data

**What goes wrong:** Checking `Content-Length` header for file size validation can be inaccurate for multipart form data because the header includes boundary overhead, field names, and other metadata -- not just the file bytes.
**Why it happens:** The Content-Length represents the entire request body, not the file size alone.
**How to avoid:** Use a two-phase approach: (1) check Content-Length as a rough early reject (if body is > MAX + reasonable overhead like 1MB, reject immediately), (2) after `formData()` parsing, check `file.size` for exact validation. The DropZone component already has `maxSize` prop (currently 100MB) which provides client-side pre-filtering.
**Warning signs:** Legitimate uploads being rejected, or oversized files still being parsed.

### Pitfall 5: Silent queue failures hide operational issues

**What goes wrong:** The current upload route catches Redis/queue errors with an empty catch block. Photos remain stuck in "processing" status with no indication of why.
**Why it happens:** Graceful degradation was implemented without logging.
**How to avoid:** Log the error with `console.error` and include the photoId for debugging. The photo record is already saved, so the upload succeeds -- the queue failure should be logged but not block the response.
**Warning signs:** Photos stuck in "processing" status indefinitely.

### Pitfall 6: Error boundaries don't catch event handlers or async errors

**What goes wrong:** error.tsx only catches errors during React rendering. Errors in `onClick`, `fetch`, or `useEffect` callbacks are not caught.
**Why it happens:** React error boundaries (which error.tsx wraps) only catch rendering errors in the component tree below them.
**How to avoid:** API route errors need try/catch in the route handler itself. Client-side event handler errors need their own try/catch with state-based error display.
**Warning signs:** Unhandled promise rejections in console, white screen despite having error.tsx.

## Code Examples

Verified patterns from official sources and codebase analysis:

### Root error.tsx (ERR-01) - Recommended Implementation

```typescript
// src/app/error.tsx
// Source: https://nextjs.org/docs/app/building-your-application/routing/error-handling
"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
      <h2 className="mb-2 text-xl font-semibold text-text-primary">
        Something went wrong
      </h2>
      <p className="mb-6 text-text-secondary">
        An unexpected error occurred. Please try again.
      </p>
      <div className="flex gap-3">
        <button
          onClick={() => reset()}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-primary hover:bg-surface-hover"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
```

### Upload Size Check (ERR-10) - Content-Length + File.size

```typescript
// In upload route handler, before formData() for rough early reject:
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
const MULTIPART_OVERHEAD = 1 * 1024 * 1024; // 1MB for form boundaries/metadata

const contentLength = parseInt(
  request.headers.get("content-length") || "0",
  10,
);
if (contentLength > MAX_FILE_SIZE + MULTIPART_OVERHEAD) {
  return NextResponse.json(
    { error: `File exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit` },
    { status: 413 },
  );
}

// After formData() parsing, exact check:
const formData = await request.formData();
const file = formData.get("file") as File | null;
if (file && file.size > MAX_FILE_SIZE) {
  return NextResponse.json(
    { error: `File exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit` },
    { status: 413 },
  );
}
```

### Zod Migration: flatten() to z.flattenError()

```typescript
// BEFORE (deprecated in Zod v4):
if (!result.success) {
  return NextResponse.json(
    { error: "Invalid data", details: result.error.flatten() },
    { status: 400 },
  );
}

// AFTER (Zod v4 recommended):
if (!result.success) {
  const flat = z.flattenError(result.error);
  return NextResponse.json(
    { error: "Validation failed", details: flat.fieldErrors },
    { status: 400 },
  );
}
```

### JSON.parse safety in toDomain() (ERR-07)

```typescript
// Current (unsafe):
exifData: row.exifData ? JSON.parse(row.exifData) : null,

// Safe version:
exifData: row.exifData ? this.safeParseJson(row.exifData) : null,

// Helper method:
private safeParseJson(json: string): ExifData | null {
  try {
    return JSON.parse(json) as ExifData;
  } catch {
    console.error("[SQLitePhotoRepository] Failed to parse exifData JSON");
    return null;
  }
}
```

### Queue failure logging (ERR-11)

```typescript
// Current (silent):
try {
  await Promise.race([
    enqueueImageProcessing(photoId, filePath),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Job enqueue timeout")), 2000),
    ),
  ]);
} catch (error) {
  // Redis unavailable - photo will remain in "processing" status
}

// Fixed (logged):
try {
  await Promise.race([
    enqueueImageProcessing(photoId, filePath),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Job enqueue timeout")), 2000),
    ),
  ]);
} catch (error) {
  console.error(
    `[Upload] Failed to enqueue processing for photo ${photoId}:`,
    error instanceof Error ? error.message : error,
  );
  // Photo saved with "processing" status - will need manual requeue
}
```

## Inventory of Changes Needed

### API Routes Needing Zod Addition (ERR-08)

These 3 route handlers currently use raw `as` type assertions instead of Zod:

| Route                           | Method | Current Validation                               | Fix                                  |
| ------------------------------- | ------ | ------------------------------------------------ | ------------------------------------ |
| `/api/admin/photos/[id]`        | PATCH  | `body as { description: string \| null }`        | Add Zod schema for description field |
| `/api/admin/photos/[id]/albums` | POST   | `body as { albumId?: string }` then manual check | Add Zod schema for albumId field     |
| `/api/admin/photos/[id]/albums` | DELETE | `body as { albumId?: string }` then manual check | Add Zod schema for albumId field     |

### API Routes Needing try/catch (ERR-09)

Currently NO API route has a top-level try/catch. All 8 route files (containing ~14 handlers) need wrapping:

| Route File                              | Handlers          | Has try/catch                             |
| --------------------------------------- | ----------------- | ----------------------------------------- |
| `/api/admin/upload`                     | POST              | Partial (only around enqueue)             |
| `/api/admin/photos/[id]`                | PATCH, DELETE     | None                                      |
| `/api/admin/photos/[id]/albums`         | GET, POST, DELETE | None                                      |
| `/api/admin/albums`                     | GET, POST         | None                                      |
| `/api/admin/albums/[id]`                | PATCH, DELETE     | None                                      |
| `/api/admin/albums/reorder`             | POST              | None                                      |
| `/api/admin/albums/[id]/photos/reorder` | POST              | None                                      |
| `/api/images/[photoId]/[filename]`      | GET               | Partial (around file read, but re-throws) |

### Routes Already Using Zod (need flatten migration)

| Route                                        | Schemas             | Uses `.flatten()`              |
| -------------------------------------------- | ------------------- | ------------------------------ |
| `/api/admin/albums` POST                     | `createAlbumSchema` | Yes                            |
| `/api/admin/albums/[id]` PATCH               | `updateAlbumSchema` | Yes                            |
| `/api/admin/albums/reorder` POST             | `reorderSchema`     | Yes                            |
| `/api/admin/albums/[id]/photos/reorder` POST | `reorderSchema`     | Yes                            |
| `infrastructure/config/env.ts`               | `envSchema`         | Yes (`.flatten().fieldErrors`) |

### Error/Loading Files to Create

| File                                    | Type             | Requirement |
| --------------------------------------- | ---------------- | ----------- |
| `src/app/error.tsx`                     | Client Component | ERR-01      |
| `src/app/global-error.tsx`              | Client Component | ERR-02      |
| `src/app/albums/[id]/error.tsx`         | Client Component | ERR-03      |
| `src/app/admin/(protected)/error.tsx`   | Client Component | ERR-04      |
| `src/app/not-found.tsx`                 | Server Component | ERR-05      |
| `src/app/loading.tsx`                   | Server Component | ERR-06      |
| `src/app/albums/[id]/loading.tsx`       | Server Component | ERR-06      |
| `src/app/admin/(protected)/loading.tsx` | Server Component | ERR-06      |

## Discretionary Recommendations

### Error Page Design

**Recommendation:** Minimal, centered layout using existing design tokens. Use the project's `text-text-primary`, `text-text-secondary`, `bg-accent` tokens. Include both a "Try again" button (calls `reset()`) and a "Go home" link. No illustrations or icons -- keep it consistent with the photography portfolio's clean aesthetic.

### Loading State Approach

**Recommendation:** Use skeleton loading with subtle pulse animation. For the gallery pages, render placeholder gray boxes matching the expected photo grid layout. For admin pages, a simple centered spinner is sufficient since admin UI is utilitarian. Use Tailwind's `animate-pulse` on gray `bg-surface-secondary` blocks.

### API Error Response Shape

**Recommendation:** Standardize on `{ error: string }` for all errors. For validation failures, extend to `{ error: string, details: Record<string, string[]> }`. Use HTTP status codes: 400 (validation), 401 (unauthorized), 404 (not found), 413 (payload too large), 500 (server error). Never expose stack traces or internal details.

### Job Failure Notification

**Recommendation:** Photos with `status: "error"` already exist in the data model. Display a red badge/indicator on the admin dashboard for photos with error status. The admin dashboard already shows all photos -- simply add a visual error state indicator to `AdminDashboardClient` for photos where `status === "error"`. No new toast or notification system needed.

### Queue Unavailability During Upload

**Recommendation:** Keep the existing graceful degradation pattern -- save the file and photo record, warn in the console log. This matches the current behavior (the app degrades gracefully if Redis is unavailable per CLAUDE.md). Add logging as required by ERR-11, but don't reject the upload. The photo will have "processing" status until manually requeued or Redis becomes available.

## State of the Art

| Old Approach                        | Current Approach                           | When Changed             | Impact                                    |
| ----------------------------------- | ------------------------------------------ | ------------------------ | ----------------------------------------- |
| `ZodError.flatten()`                | `z.flattenError(error)`                    | Zod v4 (2025)            | Must migrate 5 call sites                 |
| `z.string().email()`                | `z.email()`                                | Zod v4 (2025)            | Not used in this project, no impact       |
| `ZodError.format()`                 | `z.treeifyError(error)`                    | Zod v4 (2025)            | Not used in this project                  |
| Pages Router `bodyParser.sizeLimit` | No equivalent in App Router Route Handlers | Next.js 13+ (App Router) | Must check Content-Length header manually |

**Deprecated/outdated:**

- `ZodError.flatten()`: Deprecated in Zod v4, use `z.flattenError()` instead. Still works but should be migrated.
- `ZodError.format()`: Deprecated in Zod v4, use `z.treeifyError()` instead. Not used in this project.

## Open Questions

1. **DropZone maxSize mismatch with server limit**
   - What we know: DropZone currently has `maxSize = 100 * 1024 * 1024` (100MB) but the user decision says to reject at 25MB with a toast
   - What's unclear: Should the DropZone maxSize be reduced to 25MB to match the server limit, or should the server limit be 100MB?
   - Recommendation: Align both client (DropZone maxSize) and server to 25MB as per user decision. The DropZone already has a `maxSize` prop and `onFilesRejected` callback for this.

2. **Image API route error response format**
   - What we know: The `/api/images/[photoId]/[filename]` route currently returns plain text errors ("Invalid filename", "Image not found") instead of JSON
   - What's unclear: Should this public-facing image endpoint also return JSON errors for consistency?
   - Recommendation: Keep plain text for the image route since its consumers are `<img>` tags and Next.js Image component, not JavaScript clients expecting JSON. The error format does not matter for image requests.

## Sources

### Primary (HIGH confidence)

- Next.js official docs - [Error Handling](https://nextjs.org/docs/app/building-your-application/routing/error-handling) - error.tsx, global-error.tsx signatures and requirements
- Next.js official docs - [Loading UI and Streaming](https://nextjs.org/docs/app/building-your-application/routing/loading-ui-and-streaming) - loading.tsx convention
- Next.js official docs - [not-found.js](https://nextjs.org/docs/app/api-reference/file-conventions/not-found) - not-found.tsx convention
- Zod official docs - [Error Formatting](https://zod.dev/error-formatting) - z.flattenError, z.treeifyError
- Zod official docs - [Migration Guide](https://zod.dev/v4/changelog) - .flatten() deprecation
- Codebase analysis - direct reading of all 8 API route files, 2 repository files, upload components

### Secondary (MEDIUM confidence)

- Next.js docs - [proxyClientMaxBodySize](https://nextjs.org/docs/app/api-reference/config/next-config-js/proxyClientMaxBodySize) - default 10MB proxy buffering
- GitHub issue [#57501](https://github.com/vercel/next.js/issues/57501) - confirming no per-route body size limit in App Router

### Tertiary (LOW confidence)

- None

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - no new libraries, all tools already in project
- Architecture: HIGH - Next.js file conventions are well-documented and stable
- Pitfalls: HIGH - verified through direct codebase analysis and official docs
- API hardening patterns: HIGH - based on direct reading of all 8 route files

**Research date:** 2026-02-07
**Valid until:** 2026-03-07 (30 days - stable domain, no rapid changes expected)
