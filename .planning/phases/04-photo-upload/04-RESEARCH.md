# Phase 4: Photo Upload - Research

**Researched:** 2026-01-30
**Domain:** File upload (drag-drop UI, progress tracking, server handling)
**Confidence:** HIGH

## Summary

This phase implements an admin drag-drop photo upload interface that integrates with the existing Phase 2 image processing pipeline (BullMQ + Sharp). Research focused on three areas: (1) drag-drop UI libraries, (2) upload progress tracking, and (3) server-side file handling in Next.js 16.

The standard approach is to use **react-dropzone** for drag-drop UI (mature, hook-based, React 19 compatible since v14.3.6), **XMLHttpRequest** for upload progress tracking (fetch API still lacks native upload progress), and **Next.js Route Handler** with the standard `request.formData()` API for receiving files. For very large files (50MP+ photos), streaming with busboy is an option but likely unnecessary for this use case since the existing Sharp pipeline already handles large images.

**Primary recommendation:** Use react-dropzone v14.4.0 for drag-drop UI, XMLHttpRequest (or axios) for progress tracking to a Route Handler endpoint, save files to `storage/originals/{photoId}/`, then enqueue to existing BullMQ pipeline.

## Standard Stack

The established libraries/tools for this domain:

### Core

| Library        | Version | Purpose                  | Why Standard                                                                            |
| -------------- | ------- | ------------------------ | --------------------------------------------------------------------------------------- |
| react-dropzone | 14.4.0  | Drag-drop file zone      | De facto standard (11k GitHub stars), hook-based API, React 19 compatible since v14.3.6 |
| XMLHttpRequest | native  | Upload progress tracking | Only browser API with upload progress events; fetch lacks this                          |

### Supporting

| Library   | Version | Purpose                   | When to Use                                             |
| --------- | ------- | ------------------------- | ------------------------------------------------------- |
| axios     | latest  | HTTP client with progress | Alternative to raw XHR; cleaner API for progress events |
| file-type | 22+     | Magic byte validation     | Server-side file type verification (ESM-only)           |

### Existing Infrastructure (from Phase 2)

| Module                                                         | Purpose            | Integration Point                                                 |
| -------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------- |
| `@/infrastructure/jobs/queues`                                 | BullMQ image queue | Call `enqueueImageProcessing(photoId, originalPath)` after upload |
| `@/infrastructure/services/imageService`                       | Sharp processing   | Already handles derivatives (WebP/AVIF at 300/600/1200/2400w)     |
| `@/infrastructure/database/repositories/SQLitePhotoRepository` | Photo storage      | Call `save()` to create photo record before enqueueing            |

### Alternatives Considered

| Instead of     | Could Use               | Tradeoff                                                                |
| -------------- | ----------------------- | ----------------------------------------------------------------------- |
| react-dropzone | Native HTML5 DnD        | More control but more boilerplate; DnD API has browser inconsistencies  |
| XMLHttpRequest | fetch + ReadableStream  | Experimental, Interop 2026 proposal still pending; not production-ready |
| axios          | XMLHttpRequest directly | axios adds ~10KB but cleaner API; XHR is zero-dependency                |
| file-type      | Sharp metadata          | Sharp can detect format but file-type catches more edge cases           |

**Installation:**

```bash
npm install react-dropzone
# Optional: npm install axios (if preferring over raw XHR)
```

## Architecture Patterns

### Recommended Project Structure

```
src/
├── app/
│   ├── admin/(protected)/
│   │   └── upload/
│   │       └── page.tsx           # Upload page with DropZone
│   └── api/
│       └── admin/
│           └── upload/
│               └── route.ts       # Route Handler for file upload
├── presentation/
│   └── components/
│       └── DropZone.tsx           # Reusable drop zone component
└── infrastructure/
    └── storage/
        └── fileStorage.ts         # File write utilities
```

### Pattern 1: Route Handler for Upload (not Server Actions)

**What:** Use a Next.js Route Handler (`/api/admin/upload`) instead of Server Actions for file uploads requiring progress tracking.

**Why:** Server Actions use fetch internally and don't expose upload progress events. Route Handlers work with XMLHttpRequest which has `upload.onprogress`.

**When to use:** Any upload requiring progress feedback.

**Example:**

```typescript
// src/app/api/admin/upload/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/infrastructure/auth";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { env } from "@/infrastructure/config/env";
import { enqueueImageProcessing } from "@/infrastructure/jobs";

export async function POST(request: NextRequest) {
  // Verify session (reuse existing auth)
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  // Generate photo ID (UUID v4)
  const photoId = crypto.randomUUID();

  // Save to storage/originals/{photoId}/original.{ext}
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const dir = join(env.STORAGE_PATH, "originals", photoId);
  const filePath = join(dir, `original.${ext}`);

  await mkdir(dir, { recursive: true });
  const bytes = await file.arrayBuffer();
  await writeFile(filePath, Buffer.from(bytes));

  // Enqueue for processing (existing pipeline)
  await enqueueImageProcessing(photoId, filePath);

  return NextResponse.json({ photoId, status: "processing" });
}
```

### Pattern 2: Client-Side Upload with Progress

**What:** Use XMLHttpRequest for upload with progress events to the Route Handler.

**Example:**

```typescript
// Client component upload function
function uploadFile(
  file: File,
  onProgress: (percent: number) => void,
): Promise<{ photoId: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append("file", file);

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        onProgress(percent);
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        reject(new Error(`Upload failed: ${xhr.status}`));
      }
    });

    xhr.addEventListener("error", () => reject(new Error("Network error")));

    xhr.open("POST", "/api/admin/upload");
    xhr.send(formData);
  });
}
```

### Pattern 3: Batch Upload with Individual Progress

**What:** Track progress for each file independently when uploading multiple files.

**When to use:** When user drops multiple files at once.

**Example:**

```typescript
interface UploadState {
  file: File;
  progress: number;
  status: "pending" | "uploading" | "complete" | "error";
  photoId?: string;
  error?: string;
}

// Upload files sequentially or in parallel with individual tracking
async function uploadBatch(files: File[]): Promise<void> {
  const uploads: UploadState[] = files.map((file) => ({
    file,
    progress: 0,
    status: "pending",
  }));

  // Process concurrently (e.g., 3 at a time) or sequentially
  for (const upload of uploads) {
    upload.status = "uploading";
    try {
      const result = await uploadFile(upload.file, (percent) => {
        upload.progress = percent;
      });
      upload.photoId = result.photoId;
      upload.status = "complete";
    } catch (err) {
      upload.status = "error";
      upload.error = err.message;
    }
  }
}
```

### Anti-Patterns to Avoid

- **Server Actions for uploads with progress:** Server Actions can't report upload progress; use Route Handler + XHR instead.
- **Loading entire file into memory for large files:** For 50MP images (15-30MB), `file.arrayBuffer()` is acceptable but consider streaming for files >100MB.
- **Trusting client MIME type:** Always validate on server; Content-Type header can be spoofed.
- **Storing files in public directory:** Never store uploads in `public/`; use `storage/` outside web root.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem             | Don't Build                    | Use Instead                | Why                                                                     |
| ------------------- | ------------------------------ | -------------------------- | ----------------------------------------------------------------------- |
| Drag-drop zone      | Custom HTML5 DnD events        | react-dropzone             | Browser inconsistencies, accessibility, edge cases                      |
| File type detection | Extension check or MIME header | file-type + Sharp metadata | Magic bytes are unforgeable; extensions/MIME headers are spoofable      |
| Upload progress     | Fetch with ReadableStream hack | XMLHttpRequest             | XHR is stable and universally supported; fetch progress is experimental |
| UUID generation     | Custom ID generation           | crypto.randomUUID()        | Native, 3x faster than uuid package, cryptographically secure           |
| Image processing    | Custom resize/format logic     | Existing Phase 2 pipeline  | BullMQ + Sharp already handles retries, formats, sizes                  |

**Key insight:** File uploads appear simple but have many edge cases (browser differences, network failures, large files, malicious content). Using established libraries prevents reinventing battle-tested solutions.

## Common Pitfalls

### Pitfall 1: Memory Exhaustion with Large Files

**What goes wrong:** Using `file.arrayBuffer()` for very large files loads entire file into memory, causing Node.js to run out of heap space.

**Why it happens:** ArrayBuffer creates a copy of the entire file in memory.

**How to avoid:** For files under 50MB, `arrayBuffer()` is fine. For larger files, use streaming with busboy or chunks. Since this is for photos (typically 10-30MB for 50MP RAW), the simple approach should work. Monitor memory during testing.

**Warning signs:** Node.js heap out of memory errors, slow server response during upload.

### Pitfall 2: Trusting Client-Provided File Type

**What goes wrong:** Accepting file extension or MIME type from client allows malicious file upload.

**Why it happens:** Browser sets Content-Type from file extension; attackers can rename `malware.exe` to `photo.jpg`.

**How to avoid:** Validate with magic bytes on server. For images, Sharp's `metadata()` will fail on non-images which provides implicit validation. Optionally use file-type library for explicit checks.

**Warning signs:** Files that don't process correctly, unexpected file formats in storage.

### Pitfall 3: Not Handling Partial Uploads

**What goes wrong:** Network interruption leaves orphaned partial files and database records.

**Why it happens:** File write completes but client disconnects before acknowledgment, or vice versa.

**How to avoid:**

1. Write file first, database record second
2. Use `status: 'processing'` initially
3. Worker marks `status: 'ready'` or `status: 'error'` after processing
4. Periodically clean orphaned files without matching DB records

**Warning signs:** Files in `storage/originals/` without DB records, or DB records with `status: 'processing'` forever.

### Pitfall 4: Blocking UI During Multi-File Upload

**What goes wrong:** Uploading 10 files makes UI unresponsive.

**Why it happens:** Sequential uploads or too many concurrent requests.

**How to avoid:** Use controlled concurrency (2-3 parallel uploads). Show individual progress per file. Allow user to continue interacting with page.

**Warning signs:** Browser tab freezes, "Page Unresponsive" warnings.

### Pitfall 5: Security - Unauthenticated Upload Endpoint

**What goes wrong:** Malicious users upload files without being logged in.

**Why it happens:** Forgetting to add auth check to API route.

**How to avoid:** Always verify session at start of Route Handler. The existing `verifySession()` DAL function works perfectly for this.

**Warning signs:** Files appearing from unknown sources, disk space filling unexpectedly.

## Code Examples

Verified patterns from official sources:

### react-dropzone Basic Usage

```typescript
// Source: https://github.com/react-dropzone/react-dropzone
'use client';

import { useCallback } from 'react';
import { useDropzone, FileRejection } from 'react-dropzone';

interface Props {
  onFilesAccepted: (files: File[]) => void;
  maxFiles?: number;
}

export function DropZone({ onFilesAccepted, maxFiles = 10 }: Props) {
  const onDrop = useCallback((acceptedFiles: File[], rejections: FileRejection[]) => {
    if (rejections.length > 0) {
      // Handle rejected files (wrong type, too large, etc.)
      console.warn('Some files were rejected:', rejections);
    }
    if (acceptedFiles.length > 0) {
      onFilesAccepted(acceptedFiles);
    }
  }, [onFilesAccepted]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
      'image/heic': ['.heic'],
    },
    maxFiles,
    maxSize: 100 * 1024 * 1024, // 100MB
  });

  return (
    <div
      {...getRootProps()}
      className={`
        border-2 border-dashed rounded-lg p-12 text-center cursor-pointer
        transition-colors duration-200
        ${isDragActive
          ? 'border-blue-500 bg-blue-50'
          : 'border-gray-300 hover:border-gray-400'
        }
      `}
    >
      <input {...getInputProps()} />
      {isDragActive ? (
        <p className="text-lg text-blue-600">Drop photos here...</p>
      ) : (
        <p className="text-lg text-gray-600">
          Drag and drop photos here, or click to select
        </p>
      )}
    </div>
  );
}
```

### Server-Side File Type Validation with Sharp

```typescript
// Source: Sharp documentation + existing imageService.ts pattern
import sharp from "sharp";

async function validateImageFile(filePath: string): Promise<{
  valid: boolean;
  width?: number;
  height?: number;
  format?: string;
  error?: string;
}> {
  try {
    const metadata = await sharp(filePath).metadata();

    if (!metadata.format || !metadata.width || !metadata.height) {
      return { valid: false, error: "Not a valid image file" };
    }

    const allowedFormats = ["jpeg", "png", "webp", "heif", "raw"];
    if (!allowedFormats.includes(metadata.format)) {
      return { valid: false, error: `Unsupported format: ${metadata.format}` };
    }

    return {
      valid: true,
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
    };
  } catch (err) {
    return { valid: false, error: "Failed to read image metadata" };
  }
}
```

### XHR Upload with Abort Capability

```typescript
// For allowing user to cancel an upload in progress
interface UploadController {
  abort: () => void;
  promise: Promise<{ photoId: string }>;
}

function uploadFileWithAbort(
  file: File,
  onProgress: (p: number) => void,
): UploadController {
  const xhr = new XMLHttpRequest();

  const promise = new Promise<{ photoId: string }>((resolve, reject) => {
    const formData = new FormData();
    formData.append("file", file);

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        reject(new Error(`Upload failed: ${xhr.status}`));
      }
    });

    xhr.addEventListener("error", () => reject(new Error("Network error")));
    xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")));

    xhr.open("POST", "/api/admin/upload");
    xhr.send(formData);
  });

  return {
    abort: () => xhr.abort(),
    promise,
  };
}
```

## State of the Art

| Old Approach                    | Current Approach            | When Changed   | Impact                                                |
| ------------------------------- | --------------------------- | -------------- | ----------------------------------------------------- |
| formidable/multer in API routes | `request.formData()` native | Next.js 13+    | No external parsing library needed for simple uploads |
| uuid package for IDs            | `crypto.randomUUID()`       | Node.js 14.17+ | Zero dependencies, 3x faster                          |
| Server Actions for everything   | Route Handler for uploads   | Next.js 14+    | Server Actions lack upload progress support           |

**Deprecated/outdated:**

- **busboy/multer for small files:** The native `formData()` API handles typical uploads without external dependencies. Reserve streaming for very large files (>100MB).
- **React 18-specific dropzone patterns:** react-dropzone v14.3.6+ fixed React 19 type compatibility; no workarounds needed.

## Open Questions

Things that couldn't be fully resolved:

1. **Streaming for 50MP photos**
   - What we know: 50MP photos are 10-30MB; `arrayBuffer()` handles this fine
   - What's unclear: Whether streaming is needed for batch uploads of many large photos
   - Recommendation: Start with `arrayBuffer()`, add streaming if memory issues arise

2. **fetch upload progress API**
   - What we know: Interop 2026 proposal exists for fetch progress events
   - What's unclear: Timeline for browser adoption
   - Recommendation: Stick with XHR for now; it's stable and well-supported

## Sources

### Primary (HIGH confidence)

- [react-dropzone GitHub](https://github.com/react-dropzone/react-dropzone) - Releases, React 19 compatibility (v14.3.6+)
- [MDN XMLHttpRequest.upload](https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/upload) - Upload progress events

### Secondary (MEDIUM confidence)

- [Next.js GitHub Discussion #50358](https://github.com/vercel/next.js/discussions/50358) - File uploads with formData
- [DEV.to Streaming Guide](https://dev.to/grimshinigami/how-to-handle-large-filefiles-streams-in-nextjs-13-using-busboymulter-25gb) - Busboy streaming pattern
- [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html) - Security best practices

### Tertiary (LOW confidence)

- [Jake Archibald on fetch streams](https://jakearchibald.com/2025/fetch-streams-not-for-progress/) - Fetch progress limitations
- Various Medium articles on drag-drop patterns

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - react-dropzone is well-documented, XHR progress is stable API
- Architecture: HIGH - Route Handler pattern verified in Next.js docs, integrates cleanly with existing Phase 2 pipeline
- Pitfalls: MEDIUM - Based on community patterns and security best practices; some may be overkill for admin-only upload

**Research date:** 2026-01-30
**Valid until:** 60 days (stable domain, react-dropzone actively maintained)
