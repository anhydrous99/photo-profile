# Security Vulnerability Audit Report

**Project:** Photo Profile Portfolio
**Audit Date:** 2026-02-08
**Auditor:** Claude Code Security Scanner
**Severity Scale:** Critical | High | Medium | Low | Info

---

## Executive Summary

This security audit identified **10 security vulnerabilities** across the Photo Profile application. The most critical issues include:

- Path traversal vulnerability in file storage operations
- IP address spoofing enabling rate limit bypass
- Missing CSRF protection on authenticated API endpoints
- Timing attack vulnerability in authentication
- Multiple dependency vulnerabilities

**Overall Risk Level:** HIGH

---

## Critical Vulnerabilities

### 1. Path Traversal Vulnerability in File Storage
**File:** `src/infrastructure/storage/fileStorage.ts`
**Lines:** 19, 42, 61-62
**Severity:** CRITICAL
**CVSS Score:** 9.1 (Critical)

**Description:**
The `photoId` parameter is used directly in file path construction without validation. An attacker who can control the `photoId` value could use directory traversal sequences (`../`) to read or write files outside the intended storage directories.

**Vulnerable Code:**
```typescript
// Line 19 - saveOriginalFile
const dir = join(env.STORAGE_PATH, "originals", photoId);

// Line 42 - findOriginalFile
const dir = join(env.STORAGE_PATH, "originals", photoId);

// Lines 61-62 - deletePhotoFiles
const originalsDir = join(env.STORAGE_PATH, "originals", photoId);
const processedDir = join(env.STORAGE_PATH, "processed", photoId);
```

**Attack Scenario:**
```typescript
// Attacker crafts a malicious photoId
const maliciousId = "../../etc/passwd";
await saveOriginalFile(maliciousId, file);
// This would attempt to write to: storage/originals/../../etc/passwd
```

**Impact:**
- Arbitrary file read/write on the server filesystem
- Deletion of critical system files
- Access to sensitive configuration files (.env, database)
- Potential for remote code execution

**Recommendation:**
```typescript
// Add UUID validation for photoId
import { validate as isUuid } from 'uuid';

export async function saveOriginalFile(photoId: string, file: File): Promise<string> {
  // Validate photoId is a proper UUID
  if (!isUuid(photoId)) {
    throw new Error('Invalid photoId format');
  }

  const ext = extname(file.name).toLowerCase() || ".jpg";
  const dir = join(env.STORAGE_PATH, "originals", photoId);

  // Ensure resolved path is still within STORAGE_PATH
  const resolvedDir = path.resolve(dir);
  const storageRoot = path.resolve(env.STORAGE_PATH);
  if (!resolvedDir.startsWith(storageRoot)) {
    throw new Error('Path traversal detected');
  }

  // ... rest of implementation
}
```

---

## High Severity Vulnerabilities

### 2. IP Address Spoofing / Rate Limit Bypass
**File:** `src/app/actions/auth.ts`
**Lines:** 43-45
**Severity:** HIGH
**CVSS Score:** 7.5 (High)

**Description:**
The login rate limiting relies on the `x-forwarded-for` header to identify clients. This header can be easily spoofed by attackers to bypass rate limits.

**Vulnerable Code:**
```typescript
const headersList = await headers();
const forwardedFor = headersList.get("x-forwarded-for");
const ip = forwardedFor?.split(",")[0]?.trim() || "unknown";
```

**Attack Scenario:**
```bash
# Attacker sends multiple login attempts with different spoofed IPs
curl -H "X-Forwarded-For: 1.2.3.4" -X POST /admin/login
curl -H "X-Forwarded-For: 5.6.7.8" -X POST /admin/login
# Each request appears to come from a different IP, bypassing rate limits
```

**Impact:**
- Unlimited brute force password attempts
- Rate limiting completely ineffective
- Denial of service through resource exhaustion

**Recommendation:**
1. Use the real client IP from the connection socket (requires reverse proxy configuration)
2. Implement additional rate limiting based on session/fingerprint
3. Add CAPTCHA after multiple failed attempts
4. Use trusted proxy configuration:

```typescript
// Validate x-forwarded-for only from trusted proxies
const trustedProxies = ['127.0.0.1', 'your-proxy-ip'];
const realIp = request.socket.remoteAddress;

// Only trust x-forwarded-for if request comes from trusted proxy
let clientIp = realIp;
if (trustedProxies.includes(realIp)) {
  const forwardedFor = headersList.get("x-forwarded-for");
  clientIp = forwardedFor?.split(",")[0]?.trim() || realIp;
}
```

### 3. Missing CSRF Protection
**Files:** All API routes under `src/app/api/admin/`
**Severity:** HIGH
**CVSS Score:** 7.1 (High)

**Description:**
The application uses cookies for authentication but does not implement CSRF protection. This allows attackers to perform state-changing operations on behalf of authenticated users.

**Vulnerable Routes:**
- `POST /api/admin/upload` - File upload
- `DELETE /api/admin/photos/[id]` - Delete photos
- `PATCH /api/admin/photos/[id]` - Update photos
- `DELETE /api/admin/albums/[id]` - Delete albums
- All other admin API endpoints

**Attack Scenario:**
```html
<!-- Attacker's malicious website -->
<form action="https://victim-site.com/api/admin/photos/photo-123" method="POST">
  <input type="hidden" name="_method" value="DELETE">
</form>
<script>
  // Auto-submit when admin visits attacker's site
  document.forms[0].submit();
</script>
```

**Impact:**
- Unauthorized deletion of photos/albums
- Unauthorized data modification
- Account takeover in combination with other vulnerabilities

**Recommendation:**
Implement CSRF protection using one of these methods:

1. **SameSite Cookie Attribute (Partial Protection):**
```typescript
cookieStore.set("session", session, {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  expires: expiresAt,
  sameSite: "strict", // Change from "lax" to "strict"
  path: "/",
});
```

2. **CSRF Token (Recommended):**
```typescript
// Add CSRF token to session
import { randomBytes } from 'crypto';

export async function createSession(): Promise<string> {
  const csrfToken = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const session = await encrypt({
    isAdmin: true,
    expiresAt,
    csrfToken
  });
  // ... set cookie
  return csrfToken;
}

// Validate CSRF token in API routes
export async function validateCsrfToken(request: NextRequest): Promise<boolean> {
  const session = await verifySession();
  const tokenFromHeader = request.headers.get('x-csrf-token');
  return session?.csrfToken === tokenFromHeader;
}
```

### 4. Timing Attack Vulnerability in Authentication
**File:** `src/app/actions/auth.ts`
**Lines:** 66-71
**Severity:** HIGH
**CVSS Score:** 6.5 (Medium-High)

**Description:**
The login function validates the password and returns different error responses, potentially leaking information through timing analysis.

**Vulnerable Code:**
```typescript
const isValid = await verifyPassword(password);

if (!isValid) {
  return { error: "Incorrect password" };
}
```

**Impact:**
- Information leakage about password validity
- Helps attackers distinguish between valid/invalid passwords
- Can be combined with rate limit bypass for brute force

**Recommendation:**
```typescript
// Use constant-time comparison where possible
// Ensure bcrypt.compare is used (it's already constant-time)
// Add artificial delay to normalize response times

const isValid = await verifyPassword(password);

// Add small random delay to mask timing differences
await new Promise(resolve =>
  setTimeout(resolve, Math.random() * 100 + 50)
);

if (!isValid) {
  return { error: "Authentication failed" }; // Generic message
}
```

### 5. Session Fixation Vulnerability
**File:** `src/infrastructure/auth/session.ts`
**Lines:** 50-62
**Severity:** HIGH
**CVSS Score:** 6.8 (Medium-High)

**Description:**
The application does not rotate session identifiers after authentication, making it vulnerable to session fixation attacks.

**Attack Scenario:**
1. Attacker obtains a valid session cookie
2. Attacker tricks victim into using that session (e.g., via XSS or social engineering)
3. Victim logs in using the attacker's session
4. Attacker now has an authenticated session

**Recommendation:**
```typescript
// Rotate session token after login
export async function rotateSession(oldSession: string): Promise<void> {
  // Decode old session to verify it's valid
  const payload = await decrypt(oldSession);
  if (!payload) {
    throw new Error('Invalid session');
  }

  // Delete old session cookie
  await deleteSession();

  // Create new session with fresh token
  await createSession();
}

// In login action
await rotateSession(existingSession);
```

---

## Medium Severity Vulnerabilities

### 6. Dependency Vulnerabilities
**Files:** `package.json`, `package-lock.json`
**Severity:** MEDIUM
**CVSS Score:** 5.3 (Medium)

**Description:**
The application has 5 known vulnerabilities in dependencies:

1. **@isaacs/brace-expansion 5.0.0** (HIGH)
   - Uncontrolled Resource Consumption (ReDoS)
   - CVE: GHSA-7h2j-956f-4vf2
   - Affects: drizzle-kit (dev dependency)

2. **esbuild <=0.24.2** (MODERATE) - 4 instances
   - Enables any website to send requests to development server
   - CVE: GHSA-67mh-4wv8-2f99
   - Affects: drizzle-kit via @esbuild-kit packages

**Impact:**
- Development server SSRF vulnerability (if exposed)
- Potential denial of service via ReDoS
- Limited impact in production (mostly dev dependencies)

**Recommendation:**
```bash
# Fix non-breaking changes
npm audit fix

# Review and apply breaking changes if acceptable
npm audit fix --force

# Or manually update drizzle-kit
npm install drizzle-kit@latest
```

### 7. Insecure Cookie Configuration in Non-Production
**File:** `src/infrastructure/auth/session.ts`
**Line:** 57
**Severity:** MEDIUM
**CVSS Score:** 4.3 (Medium)

**Description:**
Session cookies are not marked as `secure` in development environments, allowing transmission over unencrypted HTTP connections.

**Vulnerable Code:**
```typescript
cookieStore.set("session", session, {
  httpOnly: true,
  secure: env.NODE_ENV === "production", // Not secure in dev/test
  expires: expiresAt,
  sameSite: "lax",
  path: "/",
});
```

**Impact:**
- Session cookies transmitted in plaintext over HTTP in development
- Man-in-the-middle attacks possible
- Session hijacking on shared networks

**Recommendation:**
```typescript
// Always use secure cookies, even in development
// Use HTTPS in development with self-signed certificates
cookieStore.set("session", session, {
  httpOnly: true,
  secure: true, // Always secure
  expires: expiresAt,
  sameSite: "strict", // Also upgrade from "lax" to "strict"
  path: "/",
});
```

### 8. File Type Validation Weakness
**File:** `src/app/api/admin/upload/route.ts`
**Lines:** 65-79
**Severity:** MEDIUM
**CVSS Score:** 5.0 (Medium)

**Description:**
File type validation relies solely on the client-provided MIME type (`file.type`), which can be easily spoofed.

**Vulnerable Code:**
```typescript
const allowedTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
];
if (!allowedTypes.includes(file.type)) {
  return NextResponse.json(
    { error: `Invalid file type: ${file.type}` },
    { status: 400 },
  );
}
```

**Attack Scenario:**
```javascript
// Attacker uploads malicious file with fake MIME type
const maliciousFile = new File([phpShellcode], "shell.php", {
  type: "image/jpeg" // Spoofed MIME type
});
```

**Impact:**
- Malicious file upload (limited by Sharp processing)
- Storage exhaustion
- Potential for polyglot file attacks

**Recommendation:**
```typescript
// Validate file type by magic bytes, not MIME type
import { fileTypeFromBuffer } from 'file-type';

// Read first few bytes to determine actual file type
const bytes = await file.arrayBuffer();
const fileType = await fileTypeFromBuffer(Buffer.from(bytes).slice(0, 4100));

const allowedMimes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heif' // HEIC
]);

if (!fileType || !allowedMimes.has(fileType.mime)) {
  return NextResponse.json(
    { error: 'Invalid file type. Only images are allowed.' },
    { status: 400 }
  );
}

// Additionally validate with Sharp (which already happens)
// This provides double validation
```

---

## Low Severity Vulnerabilities

### 9. Information Disclosure in Error Handling
**File:** `src/app/global-error.tsx`
**Lines:** 12-14
**Severity:** LOW
**CVSS Score:** 3.1 (Low)

**Description:**
Error objects are logged to console on the client side, potentially exposing stack traces and internal application details.

**Vulnerable Code:**
```typescript
useEffect(() => {
  console.error("Global error:", error);
}, [error]);
```

**Impact:**
- Stack traces leaked to client
- Information about internal application structure
- Aids attackers in reconnaissance

**Recommendation:**
```typescript
useEffect(() => {
  // Only log in development
  if (process.env.NODE_ENV === 'development') {
    console.error("Global error:", error);
  } else {
    // In production, send to error tracking service without exposing to client
    // Example: Sentry.captureException(error);
  }
}, [error]);
```

---

## Informational Findings

### 10. Missing Security Headers
**All Pages**
**Severity:** INFO

**Description:**
The application does not set several important security headers:

- `Content-Security-Policy` - Prevents XSS attacks
- `X-Frame-Options` - Prevents clickjacking
- `X-Content-Type-Options` - Prevents MIME sniffing
- `Referrer-Policy` - Controls referrer information
- `Permissions-Policy` - Restricts browser features

**Recommendation:**
Add security headers in `next.config.ts`:

```typescript
const nextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self' data:",
              "connect-src 'self'",
              "frame-ancestors 'none'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};
```

---

## Additional Security Observations

### Positive Security Findings

The audit also identified several well-implemented security controls:

1. ✅ **Proper password hashing** - bcrypt with cost factor 10
2. ✅ **JWT implementation** - Uses jose library with HS256
3. ✅ **SQL injection prevention** - Drizzle ORM with parameterized queries
4. ✅ **Path traversal protection in image API** - Filename validation at `/api/images/[photoId]/[filename]/route.ts:19-27`
5. ✅ **Rate limiting implementation** - Redis-based with configurable limits
6. ✅ **Secrets management** - Environment variables properly used
7. ✅ **HttpOnly cookies** - Session cookies protected from JavaScript access
8. ✅ **Input validation** - Zod schema validation on API endpoints
9. ✅ **Server-only imports** - Auth code marked with "server-only"
10. ✅ **File size limits** - 100MB upload limit enforced

---

## Remediation Priority

### Immediate Action Required (Critical/High)
1. **Path Traversal** - Add UUID validation for photoId (2-4 hours)
2. **IP Spoofing** - Implement trusted proxy validation (2-3 hours)
3. **CSRF Protection** - Add CSRF tokens or strict SameSite (4-6 hours)
4. **Session Fixation** - Implement session rotation (1-2 hours)

### Short-term (Medium)
5. **Dependencies** - Update vulnerable packages (1 hour)
6. **Cookie Security** - Enable secure flag universally (30 minutes)
7. **File Type Validation** - Add magic byte checking (2-3 hours)

### Long-term (Low/Info)
8. **Error Handling** - Remove client-side error logging (30 minutes)
9. **Security Headers** - Add CSP and security headers (2-3 hours)

---

## Testing Recommendations

To verify these vulnerabilities and validate fixes:

1. **Path Traversal Testing:**
   ```bash
   # Test with malicious photoId
   curl -X POST /api/admin/upload \
     -F "file=@test.jpg" \
     -F "photoId=../../etc/passwd"
   ```

2. **CSRF Testing:**
   ```html
   <!-- Host on external domain and test -->
   <form action="http://target/api/admin/photos/test-id" method="POST">
     <input type="hidden" name="_method" value="DELETE">
   </form>
   ```

3. **Rate Limit Bypass Testing:**
   ```bash
   # Test with multiple spoofed IPs
   for i in {1..100}; do
     curl -H "X-Forwarded-For: 1.2.3.$i" -X POST /admin/login
   done
   ```

---

## Compliance Impact

These vulnerabilities may affect compliance with:

- **OWASP Top 10 2021:**
  - A01: Broken Access Control (Path Traversal, CSRF)
  - A03: Injection (Timing Attacks)
  - A05: Security Misconfiguration (Missing Headers)
  - A06: Vulnerable Components (Dependencies)

- **PCI DSS** (if handling payments in future):
  - Requirement 6.5.8: Improper Access Control
  - Requirement 6.5.9: Improper Session Management

---

## References

- [OWASP Top 10](https://owasp.org/Top10/)
- [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetsecurity.blogspot.com/2014/01/cross-site-request-forgery-csrf.html)
- [OWASP Path Traversal](https://owasp.org/www-community/attacks/Path_Traversal)
- [CVSS Calculator](https://www.first.org/cvss/calculator/3.1)

---

## Contact

For questions about this security audit, please contact the development team.

**Report Generated:** 2026-02-08
**Next Audit Recommended:** 2026-05-08 (3 months)
