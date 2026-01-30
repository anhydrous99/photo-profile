# Phase 3: Admin Auth - Research

**Researched:** 2026-01-29
**Domain:** Authentication, Session Management, Route Protection (Next.js 16)
**Confidence:** HIGH

## Summary

Researched authentication patterns for single-admin password protection in Next.js 16 App Router. The standard approach uses stateless JWT sessions stored in HTTP-only cookies, with the jose library for signing/verification and bcrypt for password hashing. Rate limiting leverages the existing Redis infrastructure via rate-limiter-flexible.

Next.js 16 introduces `proxy.ts` (renamed from middleware.ts) for route protection, but official guidance recommends keeping proxy logic lightweight - only checking cookie existence for redirects, with full session verification in Server Components or Server Actions via a Data Access Layer (DAL) pattern. For the decision to show 404 to unauthenticated users, proxy.ts can return `new NextResponse('Not found', { status: 404 })` directly.

**Primary recommendation:** Use jose + bcrypt + rate-limiter-flexible with stateless JWT sessions in HTTP-only cookies, verified via a DAL pattern in Server Components.

## Standard Stack

The established libraries/tools for this domain:

### Core

| Library               | Version | Purpose                      | Why Standard                                                                  |
| --------------------- | ------- | ---------------------------- | ----------------------------------------------------------------------------- |
| jose                  | ^6.x    | JWT signing/verification     | Zero-dependency, universal ESM, works in all runtimes including proxy.ts      |
| bcrypt                | ^5.x    | Password hashing             | Native bindings for performance, widely audited, async support                |
| rate-limiter-flexible | ^5.x    | Rate limiting login attempts | Works with existing ioredis, atomic operations, brute-force patterns built-in |

### Supporting

| Library                | Version         | Purpose                                   | When to Use                     |
| ---------------------- | --------------- | ----------------------------------------- | ------------------------------- |
| server-only            | (built-in)      | Ensure session code runs only server-side | Import in session/auth modules  |
| next/headers cookies() | (built-in)      | Cookie management                         | Setting/reading session cookies |
| zod                    | ^4.x (existing) | Form validation                           | Validate login form inputs      |

### Alternatives Considered

| Instead of            | Could Use          | Tradeoff                                                                                |
| --------------------- | ------------------ | --------------------------------------------------------------------------------------- |
| jose                  | jsonwebtoken       | jsonwebtoken has more dependencies, jose is lighter and universal                       |
| bcrypt                | bcryptjs           | bcryptjs is pure JS (30% slower), bcrypt uses native bindings                           |
| rate-limiter-flexible | @upstash/ratelimit | Upstash requires their Redis service; rate-limiter-flexible works with existing ioredis |

**Installation:**

```bash
npm install jose bcrypt rate-limiter-flexible
npm install -D @types/bcrypt
```

## Architecture Patterns

### Recommended Project Structure

```
src/
├── app/
│   ├── admin/
│   │   ├── login/
│   │   │   └── page.tsx          # Login page component
│   │   └── (protected)/          # Route group for protected admin pages
│   │       └── layout.tsx        # Verifies session, renders children or redirects
│   └── actions/
│       └── auth.ts               # Server Actions for login
├── infrastructure/
│   ├── auth/
│   │   ├── session.ts            # JWT encrypt/decrypt, cookie management
│   │   ├── password.ts           # bcrypt hash/compare utilities
│   │   └── rateLimiter.ts        # Rate limiting configuration
│   └── config/
│       └── env.ts                # Add AUTH_SECRET, ADMIN_PASSWORD_HASH
└── proxy.ts                      # Route protection (show 404 for unauthenticated)
```

### Pattern 1: Stateless JWT Session

**What:** Store encrypted JWT in HTTP-only cookie, verify on each request
**When to use:** Single-user admin auth with no need for session revocation
**Example:**

```typescript
// Source: Next.js official authentication guide
// src/infrastructure/auth/session.ts
import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const secretKey = process.env.AUTH_SECRET;
const encodedKey = new TextEncoder().encode(secretKey);

interface SessionPayload {
  isAdmin: true;
  expiresAt: Date;
}

export async function encrypt(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h") // 8 hour session per user decision
    .sign(encodedKey);
}

export async function decrypt(session: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(session, encodedKey, {
      algorithms: ["HS256"],
    });
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

export async function createSession(): Promise<void> {
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const session = await encrypt({ isAdmin: true, expiresAt });
  const cookieStore = await cookies();

  cookieStore.set("session", session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    sameSite: "lax",
    path: "/",
  });
}
```

### Pattern 2: Data Access Layer (DAL) for Session Verification

**What:** Centralized server-side session verification with React cache()
**When to use:** Server Components and Server Actions needing auth state
**Example:**

```typescript
// Source: Next.js official authentication guide
// src/infrastructure/auth/dal.ts
import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { redirect } from "next/navigation";
import { decrypt } from "./session";

export const verifySession = cache(
  async (): Promise<{ isAuth: true } | null> => {
    const cookieStore = await cookies();
    const session = cookieStore.get("session")?.value;

    if (!session) {
      return null;
    }

    const payload = await decrypt(session);
    if (!payload) {
      return null;
    }

    return { isAuth: true };
  },
);

export async function requireAuth(): Promise<void> {
  const session = await verifySession();
  if (!session) {
    redirect("/admin/login");
  }
}
```

### Pattern 3: proxy.ts for 404 on Unauthenticated Access

**What:** Return 404 to hide admin existence from unauthenticated users
**When to use:** Per user decision - unauthenticated access shows 404
**Example:**

```typescript
// Source: Next.js proxy.ts API reference
// proxy.ts (project root or src/)
import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Only apply to /admin/* routes (except login)
  if (path.startsWith("/admin") && !path.startsWith("/admin/login")) {
    const session = request.cookies.get("session")?.value;

    // No session cookie = 404 (hide admin existence)
    if (!session) {
      return new NextResponse("Not found", { status: 404 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
```

### Pattern 4: Rate Limiting Login Attempts

**What:** Limit login attempts per IP to prevent brute force
**When to use:** Login endpoint protection (5 attempts per 15 minutes per decision)
**Example:**

```typescript
// Source: rate-limiter-flexible documentation
// src/infrastructure/auth/rateLimiter.ts
import { RateLimiterRedis } from "rate-limiter-flexible";
import IORedis from "ioredis";
import { env } from "@/infrastructure/config/env";

const redisClient = new IORedis(env.REDIS_URL, {
  enableOfflineQueue: false,
});

// 5 attempts per 15 minutes per user decision
export const loginRateLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: "login_fail_ip",
  points: 5, // 5 attempts allowed
  duration: 60 * 15, // Per 15 minutes
  blockDuration: 60 * 15, // Block for remaining time
});

export async function checkRateLimit(ip: string): Promise<{
  allowed: boolean;
  retryAfter?: number;
}> {
  try {
    await loginRateLimiter.consume(ip);
    return { allowed: true };
  } catch (rateLimiterRes) {
    if (rateLimiterRes instanceof Error) throw rateLimiterRes;
    return {
      allowed: false,
      retryAfter: Math.ceil(rateLimiterRes.msBeforeNext / 1000),
    };
  }
}
```

### Anti-Patterns to Avoid

- **Heavy logic in proxy.ts:** Don't verify JWT signatures or make DB calls in proxy - it runs on every request. Use proxy only for cookie existence checks.
- **Sync bcrypt in request path:** Always use async bcrypt.hash/compare - sync blocks the event loop.
- **Storing password in JWT:** JWT is signed, not encrypted. Store only `isAdmin: true` flag.
- **Client-side session checks only:** Always verify sessions server-side in Server Components/Actions.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem                  | Don't Build       | Use Instead            | Why                                               |
| ------------------------ | ----------------- | ---------------------- | ------------------------------------------------- |
| JWT signing/verification | Manual crypto     | jose library           | Timing attacks, algorithm confusion, key handling |
| Password hashing         | SHA-256 + salt    | bcrypt                 | bcrypt has cost factor, resistant to GPU attacks  |
| Rate limiting            | In-memory counter | rate-limiter-flexible  | Distributed apps, atomic operations, persistence  |
| Cookie security          | Manual Set-Cookie | next/headers cookies() | HttpOnly, Secure, SameSite defaults               |
| Session expiry           | setTimeout        | JWT exp claim          | Stateless, verifiable, no server state            |

**Key insight:** Authentication has decades of research into attacks. Every hand-rolled solution misses edge cases that libraries handle (timing attacks, rainbow tables, race conditions in rate limiting).

## Common Pitfalls

### Pitfall 1: JWT Verification in proxy.ts

**What goes wrong:** Slow responses, blocked requests on cold starts
**Why it happens:** proxy.ts runs on EVERY request; JWT verification adds latency
**How to avoid:** Only check cookie existence in proxy.ts, verify JWT in Server Components/Actions
**Warning signs:** Slow page loads, middleware timeouts

### Pitfall 2: Sync bcrypt Blocking Event Loop

**What goes wrong:** Server becomes unresponsive during password verification
**Why it happens:** bcrypt.hashSync/compareSync are CPU-intensive, block Node.js
**How to avoid:** Always use async versions: `await bcrypt.hash()`, `await bcrypt.compare()`
**Warning signs:** High latency on concurrent login attempts

### Pitfall 3: Rate Limit Reset on Success

**What goes wrong:** Attacker can try forever if they get occasional valid-looking responses
**Why it happens:** Resetting rate limit counter after successful login
**How to avoid:** Only reset after SUCCESSFUL login with correct password
**Warning signs:** Rate limiting doesn't slow down persistent attackers

### Pitfall 4: Leaking Admin Existence via Timing

**What goes wrong:** Different response times reveal whether password is checked
**Why it happens:** Short-circuit returns when rate limited vs. when checking password
**How to avoid:** Return same 404 response for all failures in proxy.ts; do password check only in Server Action
**Warning signs:** Timing analysis reveals protected routes

### Pitfall 5: Missing CSRF Protection

**What goes wrong:** Cross-site form submission can trigger login
**Why it happens:** Relying only on SameSite cookie without form token
**How to avoid:** SameSite=lax is sufficient for login forms (only sent on top-level GET navigations from external sites, not POST)
**Warning signs:** N/A - SameSite=lax handles this for POST-based login

## Code Examples

Verified patterns from official sources:

### Login Server Action

```typescript
// Source: Next.js authentication guide patterns
// src/app/actions/auth.ts
"use server";

import { z } from "zod";
import bcrypt from "bcrypt";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createSession } from "@/infrastructure/auth/session";
import {
  checkRateLimit,
  resetRateLimit,
} from "@/infrastructure/auth/rateLimiter";
import { env } from "@/infrastructure/config/env";

const loginSchema = z.object({
  password: z.string().min(1, "Password is required"),
});

export type LoginState = {
  error?: string;
  rateLimited?: boolean;
  retryAfter?: number;
};

export async function login(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  // Get IP for rate limiting
  const headersList = await headers();
  const ip = headersList.get("x-forwarded-for")?.split(",")[0] ?? "unknown";

  // Check rate limit first
  const rateCheck = await checkRateLimit(ip);
  if (!rateCheck.allowed) {
    return {
      rateLimited: true,
      retryAfter: rateCheck.retryAfter,
    };
  }

  // Validate input
  const result = loginSchema.safeParse({
    password: formData.get("password"),
  });

  if (!result.success) {
    return { error: "Password is required" };
  }

  // Verify password
  const isValid = await bcrypt.compare(
    result.data.password,
    env.ADMIN_PASSWORD_HASH,
  );

  if (!isValid) {
    return { error: "Incorrect password" };
  }

  // Success - create session and reset rate limit
  await createSession();
  await resetRateLimit(ip);

  // Redirect to admin home (or could store return URL)
  redirect("/admin");
}
```

### Login Page with useActionState

```typescript
// Source: Next.js authentication guide patterns
// src/app/admin/login/page.tsx
'use client'

import { useActionState } from 'react'
import { login, type LoginState } from '@/app/actions/auth'

export default function LoginPage() {
  const [state, action, pending] = useActionState<LoginState, FormData>(
    login,
    {}
  )

  return (
    <div className="min-h-screen flex items-center justify-center">
      <form action={action} className="w-full max-w-sm space-y-4">
        <div>
          <label htmlFor="password" className="sr-only">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            placeholder="Password"
            className="w-full px-4 py-2 border rounded"
            disabled={pending}
          />
        </div>

        {state.error && (
          <p className="text-red-600 text-sm">{state.error}</p>
        )}

        {state.rateLimited && (
          <p className="text-red-600 text-sm">
            Too many attempts. Try again in {state.retryAfter} seconds.
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full py-2 bg-black text-white rounded disabled:opacity-50"
        >
          {pending ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
    </div>
  )
}
```

### Protected Layout Pattern

```typescript
// Source: Next.js authentication guide patterns
// src/app/admin/(protected)/layout.tsx
import { verifySession } from '@/infrastructure/auth/dal'
import { redirect } from 'next/navigation'

export default async function ProtectedAdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await verifySession()

  if (!session) {
    redirect('/admin/login')
  }

  return <>{children}</>
}
```

### Password Hash Generation (one-time setup)

```typescript
// scripts/hash-password.ts - Run once to generate hash for env
import bcrypt from "bcrypt";

const password = process.argv[2];
if (!password) {
  console.error("Usage: npx tsx scripts/hash-password.ts <password>");
  process.exit(1);
}

const hash = await bcrypt.hash(password, 10);
console.log("Add to .env:");
console.log(`ADMIN_PASSWORD_HASH=${hash}`);
```

## State of the Art

| Old Approach       | Current Approach           | When Changed           | Impact                                       |
| ------------------ | -------------------------- | ---------------------- | -------------------------------------------- |
| middleware.ts      | proxy.ts                   | Next.js 16 (Dec 2025)  | Renamed file, same API, clearer purpose      |
| getServerSession   | Direct cookie verification | Next.js 13+ App Router | No NextAuth.js dependency for simple auth    |
| Express middleware | Server Actions + DAL       | Next.js 13+ App Router | Native form handling, no API routes needed   |
| jsonwebtoken       | jose                       | ~2023                  | Zero dependencies, universal runtime support |

**Deprecated/outdated:**

- `middleware.ts`: Renamed to `proxy.ts` in Next.js 16. Codemod available for migration.
- `getSession()` client-side: Replaced by server-side verification for security.
- Storing sessions in database: Unnecessary for single-user admin; JWT is simpler.

## Open Questions

Things that couldn't be fully resolved:

1. **Post-login redirect strategy (Claude's discretion)**
   - What we know: Both admin home and return-to-origin are valid patterns
   - What's unclear: Which provides better UX for this specific app
   - Recommendation: Start with redirect to `/admin` (simpler); add return-to-origin later if needed using searchParams `?returnTo=/admin/photos`

2. **Session expiry UX (Claude's discretion)**
   - What we know: Decision says auto-redirect with "Session expired" message
   - What's unclear: How to detect expiry client-side for immediate redirect
   - Recommendation: Server Components naturally handle this - expired JWT causes redirect on next navigation. For true "immediate" redirect, would need client-side polling or websocket (overkill for admin panel).

## Sources

### Primary (HIGH confidence)

- [Next.js Authentication Guide](https://nextjs.org/docs/app/building-your-application/authentication) - Session management, Server Actions, DAL pattern
- [Next.js proxy.ts API Reference](https://nextjs.org/docs/app/api-reference/file-conventions/proxy) - Route protection, matcher config, NextResponse API
- [jose GitHub](https://github.com/panva/jose) - JWT signing/verification API
- [bcrypt GitHub](https://github.com/kelektiv/node.bcrypt.js) - Password hashing API
- [rate-limiter-flexible GitHub](https://github.com/animir/node-rate-limiter-flexible) - Login protection patterns

### Secondary (MEDIUM confidence)

- [Next.js 16 proxy.ts migration guide](https://auth0.com/blog/whats-new-nextjs-16/) - middleware.ts to proxy.ts changes
- [rate-limiter-flexible wiki](https://github.com/animir/node-rate-limiter-flexible/wiki/Overall-example) - Login endpoint protection examples

### Tertiary (LOW confidence)

- WebSearch results for 2026 authentication best practices - General patterns verified against official docs

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - jose, bcrypt, rate-limiter-flexible all well-documented with official examples
- Architecture: HIGH - Patterns from official Next.js authentication guide, verified for v16
- Pitfalls: MEDIUM - Based on official recommendations + established security practices
- proxy.ts specifics: HIGH - Verified against Next.js 16 official documentation

**Research date:** 2026-01-29
**Valid until:** 2026-02-28 (30 days - Next.js stable, auth patterns well-established)
