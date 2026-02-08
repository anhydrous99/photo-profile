# Applied Performance Optimizations

**Date:** 2026-02-08
**Phase:** 19-03 (Performance & Production)
**Informed by:** Bundle analysis baseline, image serving architecture review

## Optimization 1: SQLite WAL Mode

### What

Enabled Write-Ahead Logging (WAL) journal mode on the SQLite database connection by adding `sqlite.pragma("journal_mode = WAL")` immediately after the `Database()` constructor call.

### File

`src/infrastructure/database/client.ts` (line 11)

### Justification

- **Baseline context:** The application uses SQLite with the default journal mode (`delete`), which serializes all reads and writes through exclusive file locks. The BullMQ worker process writes photo processing results while the Next.js server reads for page rendering and API responses.
- **WAL advantage:** WAL mode allows concurrent readers and a single writer without blocking each other. Readers see a consistent snapshot while writes proceed independently. This directly addresses the read/write contention between the web server and worker process.
- **SQLite documentation states:** "WAL provides more concurrency as readers do not block writers and a writer does not block readers. Reading and writing can proceed concurrently."
- **Trade-off:** WAL uses slightly more disk space (WAL file + shared memory file) and has marginally slower write commits. For a photography portfolio with many more reads than writes, this is a favorable trade-off.
- **Note:** `synchronous = normal` was intentionally NOT applied. While it improves write performance, it introduces a small risk of database corruption on power loss. The default `synchronous = full` is safer and the write performance difference is negligible for this workload.

### Verification

```bash
# Verify WAL mode is active (requires the app to have started at least once)
sqlite3 data/portfolio.db "PRAGMA journal_mode;"
# Expected output: wal

# Verify WAL files exist after first connection
ls data/portfolio.db-wal data/portfolio.db-shm
```

### Impact

- Eliminates read blocking during worker writes (photo processing status updates)
- Improves page load consistency when worker is actively processing uploads
- No code changes required beyond the single pragma call

---

## Optimization 2: ETag/304 Conditional Responses for Image Serving

### What

Added ETag header generation and HTTP 304 Not Modified conditional response support to the image serving API route (`/api/images/[photoId]/[filename]`).

### File

`src/app/api/images/[photoId]/[filename]/route.ts`

### Justification

- **Baseline context:** The image route serves processed derivatives (WebP/AVIF at 300, 600, 1200, 2400 widths) with `Cache-Control: public, max-age=31536000, immutable`. While immutable caching is effective for fresh browsers, several scenarios still cause unnecessary full-body responses:
  - Browser cache cleared or expired
  - CDN/proxy revalidation requests
  - User hard-refresh (sends `If-None-Match` if ETag present)
  - Multiple devices/browsers for the same user
- **ETag generation:** Uses MD5 hash of `{mtimeMs}-{size}` (file modification time + file size). This is cheap to compute (no file read required -- uses `stat()` only) and correctly changes when the file is reprocessed.
- **304 response:** When the client sends `If-None-Match` matching the current ETag, the server returns a 304 with no body, saving the full image transfer. For a 2400w AVIF derivative (typically 200-500KB), this eliminates significant bandwidth.
- **Layered caching:** ETag works alongside `Cache-Control: immutable` -- the immutable directive prevents revalidation in normal browsing, while ETag provides efficient revalidation when forced or when the cache has been evicted.

### Verification

```bash
# Start the production server
npm run build && npm start

# Request an image and observe the ETag header
curl -v http://localhost:3000/api/images/{photoId}/300w.webp 2>&1 | grep -i etag
# Expected: ETag: "abcdef1234567890"

# Send a conditional request with the ETag value
curl -v -H 'If-None-Match: "abcdef1234567890"' http://localhost:3000/api/images/{photoId}/300w.webp 2>&1 | grep "HTTP/"
# Expected: HTTP/1.1 304 Not Modified

# Verify no body is sent with 304
curl -o /dev/null -w "%{size_download}" -H 'If-None-Match: "abcdef1234567890"' http://localhost:3000/api/images/{photoId}/300w.webp
# Expected: 0
```

### Impact

- Eliminates redundant image transfers for repeat/revalidation requests
- Reduces server bandwidth usage (304 response is ~200 bytes vs 200-500KB per image)
- Minimal CPU overhead: `stat()` syscall + MD5 of a short string is negligible
- Compatible with CDN and proxy caching layers

---

## Summary

| Optimization    | Target              | Mechanism                  | Key Benefit                               |
| --------------- | ------------------- | -------------------------- | ----------------------------------------- |
| SQLite WAL mode | Database throughput | Concurrent read/write      | No read blocking during worker writes     |
| ETag/304 images | Image serving       | Conditional HTTP responses | Eliminates redundant image data transfers |

Both optimizations are low-risk, well-established patterns that address specific bottlenecks identified during the baseline measurement phase. They require no additional dependencies or infrastructure changes.
