# Architecture Patterns

**Domain:** Photography Portfolio Website (Self-Hosted)
**Researched:** 2026-01-24
**Confidence:** MEDIUM-HIGH (based on established patterns from multiple authoritative sources)

## Executive Summary

A photography portfolio system handling thousands of 50MP images requires a clear separation between the fast user-facing web layer and the slow image processing pipeline. The architecture follows Clean Architecture / Hexagonal principles to ensure maintainability and educational value, with an asynchronous job queue decoupling uploads from processing.

## Recommended Architecture

```
+------------------------------------------------------------------+
|                        PRESENTATION LAYER                         |
|  +------------------+  +------------------+  +------------------+ |
|  |  Public Gallery  |  |   Admin Panel    |  |    REST API      | |
|  |    (SSR/SSG)     |  |   (Protected)    |  |   (Internal)     | |
|  +--------+---------+  +--------+---------+  +--------+---------+ |
+-----------|--------------------|----------------------|-----------+
            |                    |                      |
            v                    v                      v
+------------------------------------------------------------------+
|                        APPLICATION LAYER                          |
|  +------------------+  +------------------+  +------------------+ |
|  | Gallery Service  |  |  Upload Service  |  |  Photo Service   | |
|  | (read-optimized) |  | (queue dispatch) |  |  (CRUD ops)      | |
|  +--------+---------+  +--------+---------+  +--------+---------+ |
+-----------|--------------------|----------------------|-----------+
            |                    |                      |
            v                    v                      v
+------------------------------------------------------------------+
|                         DOMAIN LAYER                              |
|  +------------------+  +------------------+  +------------------+ |
|  |  Photo Entity    |  |  Album Entity    |  | Gallery Entity   | |
|  |  - metadata      |  |  - photos[]      |  | - albums[]       | |
|  |  - variants      |  |  - cover         |  | - settings       | |
|  +------------------+  +------------------+  +------------------+ |
+------------------------------------------------------------------+
            |                    |                      |
            v                    v                      v
+------------------------------------------------------------------+
|                      INFRASTRUCTURE LAYER                         |
|  +---------------+  +---------------+  +------------------------+ |
|  | File Storage  |  |   Database    |  |    Job Queue           | |
|  | (filesystem)  |  |   (SQLite)    |  |    (BullMQ/Redis)      | |
|  +---------------+  +---------------+  +------------------------+ |
+------------------------------------------------------------------+

+------------------------------------------------------------------+
|                   BACKGROUND PROCESSING                           |
|  +------------------+  +------------------+  +------------------+ |
|  | Thumbnail Gen    |  | EXIF Extraction  |  | Format Convert   | |
|  | (Sharp)          |  | (exiftool/exiv2) |  | (WebP/AVIF)      | |
|  +------------------+  +------------------+  +------------------+ |
+------------------------------------------------------------------+
```

## Component Boundaries

| Component | Responsibility | Communicates With | Build Phase |
|-----------|---------------|-------------------|-------------|
| **Public Gallery** | Display photos to visitors, lazy loading, responsive images | Gallery Service, CDN/File Storage | Phase 3 |
| **Admin Panel** | Upload photos, manage albums, edit metadata | Upload Service, Photo Service | Phase 2 |
| **REST API** | Internal API for admin operations | Application Services | Phase 2 |
| **Gallery Service** | Fetch optimized photo data for display | Domain Layer, Database | Phase 3 |
| **Upload Service** | Accept uploads, dispatch to job queue | Job Queue, File Storage | Phase 2 |
| **Photo Service** | CRUD operations on photo metadata | Domain Layer, Database | Phase 1 |
| **Photo Entity** | Core domain model with business rules | None (pure domain) | Phase 1 |
| **Album Entity** | Collection of photos with ordering | Photo Entity | Phase 1 |
| **File Storage** | Store original and processed images | Filesystem | Phase 1 |
| **Database** | Persist metadata, albums, settings | None (infrastructure) | Phase 1 |
| **Job Queue** | Async processing coordination | Workers | Phase 2 |
| **Thumbnail Generator** | Create multiple image sizes | Sharp, File Storage | Phase 2 |
| **EXIF Extractor** | Parse camera/lens/GPS metadata | ExifTool/Sharp, Database | Phase 2 |
| **Format Converter** | Generate WebP/AVIF variants | Sharp, File Storage | Phase 2 |

## Data Flow

### Upload Flow (Admin -> Storage)

```
1. Admin uploads 50MP RAW/JPEG via Admin Panel
                    |
                    v
2. Upload Service receives file
   - Validates file type/size
   - Generates unique ID
   - Stores ORIGINAL to filesystem (never modified)
   - Creates Photo record in database (status: "processing")
   - Dispatches job to queue
   - Returns immediately to admin (async)
                    |
                    v
3. Job Queue (Redis/BullMQ)
   - Orchestrates processing pipeline
   - Handles retries on failure
   - Tracks progress
                    |
                    v
4. Processing Workers (parallel where possible)
   |
   +-> EXIF Extraction Worker
   |   - Reads metadata from original
   |   - Updates Photo record with camera, lens, ISO, etc.
   |   - Extracts GPS if available
   |
   +-> Thumbnail Generation Worker
   |   - Creates multiple sizes: 2400px, 1200px, 600px, 300px, 80px (blur placeholder)
   |   - Saves to filesystem with predictable naming
   |   - Updates Photo record with variant paths
   |
   +-> Format Conversion Worker
       - Generates WebP versions of each size
       - Generates AVIF versions of each size
       - Updates Photo record with format variants
                    |
                    v
5. Photo record updated (status: "ready")
```

### Display Flow (Visitor -> Gallery)

```
1. Visitor requests gallery page
                    |
                    v
2. Gallery Service queries database
   - Fetches "ready" photos only
   - Includes variant paths and metadata
   - Supports pagination/cursor
                    |
                    v
3. SSR/SSG renders HTML with responsive images
   - <picture> element with AVIF -> WebP -> JPEG fallback
   - srcset with multiple sizes
   - Blur placeholder for progressive loading
   - loading="lazy" for below-fold images
                    |
                    v
4. Browser requests images
   - Selects best format (AVIF if supported)
   - Selects best size based on viewport
   - Images served from filesystem (or CDN if configured)
```

## Patterns to Follow

### Pattern 1: Dependency Inversion (Clean Architecture Core)

**What:** High-level modules (domain, application) do not depend on low-level modules (infrastructure). Both depend on abstractions (interfaces/ports).

**Why:** This is the pillar of Clean Architecture per Robert Martin. It enables testing domain logic without databases, swapping storage backends, and maintaining a clean, educational codebase.

**Example:**
```typescript
// Domain layer - no dependencies on infrastructure
interface PhotoRepository {
  save(photo: Photo): Promise<void>;
  findById(id: string): Promise<Photo | null>;
  findByAlbum(albumId: string): Promise<Photo[]>;
}

// Application layer - depends on abstraction
class PhotoService {
  constructor(private photoRepo: PhotoRepository) {}

  async getPhoto(id: string): Promise<Photo | null> {
    return this.photoRepo.findById(id);
  }
}

// Infrastructure layer - implements abstraction
class SQLitePhotoRepository implements PhotoRepository {
  async save(photo: Photo): Promise<void> {
    // SQLite-specific implementation
  }
}
```

**Confidence:** HIGH - Core Clean Architecture principle from Robert Martin's book.

### Pattern 2: Job Queue for Heavy Processing

**What:** Decouple upload API from image processing using a message queue. Web process accepts upload and returns immediately; worker processes handle thumbnails/conversion.

**Why:** 50MP images take seconds to minutes to process. Blocking the web request creates timeouts and poor UX. Queue-based architecture handles spikes and allows retries.

**Example:**
```typescript
// Upload endpoint - fast return
async function uploadPhoto(file: Buffer, metadata: PhotoMetadata) {
  const id = generateId();
  await fileStorage.saveOriginal(id, file);
  await photoRepo.create({ id, status: 'processing', ...metadata });

  // Dispatch to queue - returns immediately
  await jobQueue.add('process-photo', { photoId: id });

  return { id, status: 'processing' };
}

// Worker - runs in background
async function processPhotoJob(job: Job<{ photoId: string }>) {
  const { photoId } = job.data;

  // These can run in parallel
  await Promise.all([
    extractExif(photoId),
    generateThumbnails(photoId),
    convertFormats(photoId),
  ]);

  await photoRepo.update(photoId, { status: 'ready' });
}
```

**Confidence:** HIGH - Well-established pattern documented by Heroku, Azure, and multiple production systems (Immich, Shopify).

### Pattern 3: Responsive Images with Modern Formats

**What:** Serve images in multiple sizes and formats using `<picture>` and `srcset`. Browser selects optimal variant based on viewport and format support.

**Why:** A 50MP original is ~25MB. Nobody needs that on a phone. Proper responsive images reduce bandwidth 90%+ while maintaining quality.

**Example:**
```html
<picture>
  <!-- AVIF: Best compression, ~30% smaller than WebP -->
  <source
    type="image/avif"
    srcset="
      /photos/abc123/300.avif 300w,
      /photos/abc123/600.avif 600w,
      /photos/abc123/1200.avif 1200w,
      /photos/abc123/2400.avif 2400w"
    sizes="(max-width: 600px) 100vw, 50vw">

  <!-- WebP: Good compression, wider support -->
  <source
    type="image/webp"
    srcset="
      /photos/abc123/300.webp 300w,
      /photos/abc123/600.webp 600w,
      /photos/abc123/1200.webp 1200w,
      /photos/abc123/2400.webp 2400w"
    sizes="(max-width: 600px) 100vw, 50vw">

  <!-- JPEG: Universal fallback -->
  <img
    src="/photos/abc123/1200.jpg"
    srcset="
      /photos/abc123/300.jpg 300w,
      /photos/abc123/600.jpg 600w,
      /photos/abc123/1200.jpg 1200w,
      /photos/abc123/2400.jpg 2400w"
    sizes="(max-width: 600px) 100vw, 50vw"
    alt="Photo description"
    loading="lazy"
    width="1200"
    height="800">
</picture>
```

**Confidence:** HIGH - MDN documentation, DebugBear, and Request Metrics all recommend this approach.

### Pattern 4: Lazy Loading with Blur Placeholders

**What:** Load images only when they enter viewport. Show a tiny blur placeholder immediately for perceived performance.

**Why:** Gallery pages may have 50+ images. Loading all at once wastes bandwidth and delays interactivity.

**Example:**
```typescript
// Generate tiny blur placeholder during processing
const blurPlaceholder = await sharp(original)
  .resize(20, null, { withoutEnlargement: true })
  .blur(10)
  .toBuffer();

const blurDataUri = `data:image/jpeg;base64,${blurPlaceholder.toString('base64')}`;

// In HTML
<img
  src={photo.variants.medium}
  style={{ backgroundImage: `url(${photo.blurPlaceholder})`, backgroundSize: 'cover' }}
  loading="lazy"
/>
```

**Confidence:** HIGH - Widely used pattern (Next.js Image, BlurHash, Immich all use similar approaches).

### Pattern 5: Single Responsibility Modules

**What:** Each module has one reason to change. Separate concerns into distinct files/classes.

**Example directory structure:**
```
src/
  domain/
    entities/
      Photo.ts        # Photo entity with validation
      Album.ts        # Album entity
    repositories/
      PhotoRepository.ts   # Interface only
      AlbumRepository.ts   # Interface only

  application/
    services/
      PhotoService.ts      # Photo CRUD orchestration
      GalleryService.ts    # Read-optimized gallery queries
      UploadService.ts     # Upload and queue dispatch
    jobs/
      ExifExtractionJob.ts
      ThumbnailGenerationJob.ts
      FormatConversionJob.ts

  infrastructure/
    persistence/
      SQLitePhotoRepository.ts
      SQLiteAlbumRepository.ts
    storage/
      FileSystemStorage.ts
    queue/
      BullMQAdapter.ts

  presentation/
    api/
      routes/
        photos.ts
        albums.ts
    admin/
      pages/
        upload.tsx
        albums.tsx
    gallery/
      pages/
        index.tsx
        [albumId].tsx
```

**Confidence:** HIGH - Core Clean Code principle from Robert Martin.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Synchronous Image Processing

**What:** Processing images in the web request handler, blocking until complete.

**Why bad:**
- 50MP images take 5-30 seconds to process
- HTTP timeouts kill the request
- Server becomes unresponsive during uploads
- No retry capability on failure

**Instead:** Use job queue pattern. Accept upload, return immediately, process in background.

### Anti-Pattern 2: Storing Images in Database

**What:** Saving image binary data as BLOBs in SQLite/Postgres.

**Why bad:**
- Database becomes enormous (50MP = ~25MB per image)
- Backups become slow and expensive
- Cannot leverage filesystem caching
- Cannot use CDN without extraction layer

**Instead:** Store images on filesystem (or object storage). Store only metadata and paths in database.

### Anti-Pattern 3: Single Image Size

**What:** Serving original 50MP images (or one downsized version) to all devices.

**Why bad:**
- 25MB images on mobile = terrible UX
- Bandwidth costs explode
- Core Web Vitals tank
- Users leave before images load

**Instead:** Generate multiple sizes (300px, 600px, 1200px, 2400px) and multiple formats (JPEG, WebP, AVIF). Let browser choose.

### Anti-Pattern 4: Tight Coupling to Infrastructure

**What:** Importing SQLite directly in service classes. Hardcoding file paths. Mixing business logic with I/O.

**Why bad:**
- Cannot test business logic without real database
- Cannot swap storage backends
- Violates Clean Architecture principles
- Makes codebase harder to understand

**Instead:** Use repository interfaces. Inject dependencies. Keep domain layer pure.

### Anti-Pattern 5: Processing Original Files

**What:** Modifying the uploaded original image (stripping EXIF, resizing in place).

**Why bad:**
- Loss of original quality forever
- EXIF data lost (camera info, GPS, copyright)
- Cannot regenerate better thumbnails later
- Photographers value originals

**Instead:** Never modify originals. Generate derivatives. Store originals in separate "originals" directory.

## Scalability Considerations

| Concern | Personal Scale (Now) | Growth Path |
|---------|---------------------|-------------|
| **Storage** | Local filesystem, ~500GB for 10K photos | Add object storage (MinIO) if exceeding local capacity |
| **Processing** | Single worker process | Add workers, Redis persists queue |
| **Serving** | Direct filesystem serving | Add CDN (Cloudflare) for edge caching |
| **Database** | SQLite, single file | Migrate to Postgres if concurrent writes become issue |
| **Memory** | Sharp streams, low memory | Already optimized via libvips |

For a personal portfolio with single admin, the "Personal Scale" column is sufficient. The architecture supports growth without rewrites.

## File Storage Layout

```
storage/
  originals/           # Never modified, never served directly
    {photo-id}.{ext}   # e.g., abc123.jpg, def456.arw

  processed/           # Generated variants, served to users
    {photo-id}/
      2400.jpg         # Large display
      2400.webp
      2400.avif
      1200.jpg         # Medium display
      1200.webp
      1200.avif
      600.jpg          # Small display
      600.webp
      600.avif
      300.jpg          # Thumbnail
      300.webp
      300.avif
      blur.txt         # Base64 blur placeholder
```

## Database Schema (Conceptual)

```sql
-- Core photo metadata
CREATE TABLE photos (
  id TEXT PRIMARY KEY,
  title TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'processing', -- processing, ready, error

  -- Original file info
  original_filename TEXT NOT NULL,
  original_format TEXT NOT NULL,
  original_width INTEGER,
  original_height INTEGER,
  file_size_bytes INTEGER,

  -- EXIF metadata
  camera_make TEXT,
  camera_model TEXT,
  lens TEXT,
  focal_length TEXT,
  aperture TEXT,
  shutter_speed TEXT,
  iso INTEGER,
  taken_at TIMESTAMP,
  gps_latitude REAL,
  gps_longitude REAL,

  -- System timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Albums/collections
CREATE TABLE albums (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  cover_photo_id TEXT REFERENCES photos(id),
  sort_order INTEGER DEFAULT 0,
  is_published BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Photo-album relationship (many-to-many)
CREATE TABLE album_photos (
  album_id TEXT REFERENCES albums(id) ON DELETE CASCADE,
  photo_id TEXT REFERENCES photos(id) ON DELETE CASCADE,
  sort_order INTEGER DEFAULT 0,
  PRIMARY KEY (album_id, photo_id)
);
```

## Build Order (Dependencies)

Based on component dependencies, the recommended build order is:

```
Phase 1: Foundation
  |
  +-> Domain entities (Photo, Album) - no dependencies
  +-> Repository interfaces - depends on entities
  +-> Database setup (SQLite) - infrastructure
  +-> File storage setup - infrastructure

Phase 2: Core Pipeline
  |
  +-> Repository implementations - depends on Phase 1
  +-> Photo Service (CRUD) - depends on repositories
  +-> Job queue setup (Redis/BullMQ) - infrastructure
  +-> Processing workers (Sharp, EXIF) - depends on storage
  +-> Upload Service - depends on queue, storage
  +-> Admin API routes - depends on services
  +-> Admin UI (upload, manage) - depends on API

Phase 3: Public Gallery
  |
  +-> Gallery Service (read-optimized queries) - depends on Phase 2
  +-> Public gallery pages (SSR/SSG) - depends on Gallery Service
  +-> Responsive image components - depends on processed files
  +-> Lazy loading implementation - depends on gallery pages

Phase 4: Polish (Post-MVP)
  |
  +-> CDN integration (optional)
  +-> Full-text search (optional)
  +-> Lightbox viewer
  +-> EXIF display panel
```

## Technology Recommendations

| Component | Recommended | Rationale |
|-----------|-------------|-----------|
| **Image Processing** | Sharp (Node.js) | 4-5x faster than ImageMagick, native AVIF/WebP, low memory via libvips |
| **EXIF Extraction** | Sharp metadata API + ExifTool fallback | Sharp handles common cases; ExifTool for RAW/advanced |
| **Job Queue** | BullMQ + Redis | Production-proven, retries, progress tracking, persistence |
| **Database** | SQLite | Zero config, single file, sufficient for single-admin portfolio |
| **File Storage** | Local filesystem | Simplest for self-hosted, direct serving, easy backup |
| **Web Framework** | Next.js or Astro | SSR/SSG support, image optimization built-in, TypeScript |

## Sources

### Authoritative Sources (HIGH confidence)
- [Sharp Documentation](https://sharp.pixelplumbing.com/) - Image processing library
- [MDN - Responsive Images](https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Performance/Multimedia)
- [AWS Hexagonal Architecture](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/hexagonal-architecture.html)
- [Azure Background Jobs Guidance](https://learn.microsoft.com/en-us/azure/architecture/best-practices/background-jobs)

### Community Sources (MEDIUM confidence)
- [DebugBear - Responsive Images Guide](https://www.debugbear.com/blog/responsive-images)
- [Request Metrics - Image Optimization 2026](https://requestmetrics.com/web-performance/high-performance-images/)
- [BullMQ Documentation](https://bullmq.io/)
- [Immich Asset Processing Pipeline](https://deepwiki.com/immich-app/immich/3.1-asset-management)
- [ExifTool](https://exiftool.org/)

### Reference Implementations (MEDIUM confidence)
- [Photoview](https://github.com/photoview/photoview) - Self-hosted photo gallery
- [HomeGallery](https://home-gallery.org/) - Self-hosted gallery with similar architecture
- [Lychee](https://lychee.electerious.com/) - Self-hosted photo management

### Clean Architecture (HIGH confidence)
- Robert C. Martin, "Clean Architecture: A Craftsman's Guide to Software Structure and Design" (2017)
- [Clean Architecture Summary](https://gist.github.com/ygrenzinger/14812a56b9221c9feca0b3621518635b)
