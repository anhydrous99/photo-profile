# Photo Portfolio

## What This Is

A self-hosted photography portfolio website where visitors browse random photos on the homepage, explore albums, and view individual photos in a full-screen lightbox. The owner manages content through a password-protected admin panel with drag-drop uploads and automatic image optimization.

## Core Value

Let the photos speak for themselves — a clean, distraction-free experience where the photography is the focus, not the interface.

## Requirements

### Validated

- Homepage displays random photos from all albums (changes on refresh) — v1.0
- Albums listing page showing all available albums — v1.0
- Album view displaying photos in a grid layout — v1.0
- Photo lightbox with next/previous navigation — v1.0
- Photo descriptions (manually added) — v1.0
- Admin panel with password authentication — v1.0
- Drag-drop photo upload interface — v1.0
- Automatic thumbnail generation for grid views — v1.0
- Optimized image versions for lightbox (not full 50MP) — v1.0
- Album management (create, rename, delete) — v1.0
- Minimalist, photo-focused design — v1.0
- Blur placeholders during image loading — v1.0
- Clean code following Robert C. Martin principles — v1.0

### Active

- [ ] EXIF metadata auto-extracted and displayed (camera, ISO, aperture, etc.)
- [ ] Smooth transitions between photos in lightbox
- [ ] Touch gestures (swipe) for mobile navigation
- [ ] Full-screen mode for lightbox
- [ ] Album cover image selection
- [ ] Drag to reorder photos within album
- [ ] Direct links to specific photos
- [ ] OpenGraph meta tags for social sharing

### Out of Scope

- Comments — not needed for portfolio viewing experience
- Likes/favorites — adds social complexity without core value
- Search/filtering — albums provide sufficient organization
- User accounts for viewers — site is fully public
- Social sharing buttons — visitors can share URLs directly
- OAuth/email login — simple password sufficient for single admin

## Context

Shipped v1.0 with 4,753 LOC TypeScript across 188 files.
Tech stack: Next.js 16, TypeScript, SQLite/Drizzle, Sharp, BullMQ/Redis, Tailwind CSS v4.
Architecture: Clean Architecture (domain/application/infrastructure/presentation).
Docker deployment configured but not yet tested locally.

Known tech debt:

- coverPhotoId FK constraint mismatch (schema SET NULL, DB NO ACTION)
- Stale comment in imageProcessor.ts (says JPEG, generates AVIF)
- Docker build untested (Docker not installed on dev machine)

## Constraints

- **Image Processing**: Must handle 50MP images efficiently — generate thumbnails and web-optimized versions on upload
- **Storage**: File-based storage at STORAGE_PATH for originals and processed derivatives
- **Performance**: Homepage random photos and album grids must load quickly despite large source images
- **Code Quality**: Follow Clean Code principles (Robert C. Martin) — meaningful names, small functions, single responsibility, etc.
- **Self-Hosted**: Must be deployable to a personal server (Docker-friendly preferred)

## Key Decisions

| Decision                       | Rationale                                              | Outcome     |
| ------------------------------ | ------------------------------------------------------ | ----------- |
| Simple password auth for admin | Single user, no need for full auth system              | Good        |
| Auto-extract EXIF metadata     | User wants camera info displayed automatically         | Deferred v2 |
| Generate thumbnails on upload  | 50MP images too large for grid/lightbox direct serving | Good        |
| SQLite + Drizzle ORM           | Simple, file-based, no external database server needed | Good        |
| BullMQ + Redis for job queue   | Async image processing, retry handling, concurrency    | Good        |
| Sharp for image processing     | WebP + AVIF at 4 sizes, high quality downscaling       | Good        |
| JWT sessions via jose          | Zero-dependency, Edge-compatible, no session store     | Good        |
| YARL for lightbox              | Feature-rich, accessible, maintained                   | Good        |
| LQIP blur placeholders         | ~130 byte base64, smooth CSS fade-in loading           | Good        |
| Standalone Next.js for Docker  | Self-contained output, no node_modules in production   | Good        |
| Clean Architecture layers      | Separation of concerns, testable, educational          | Good        |

---

_Last updated: 2026-02-05 after v1.0 milestone_
