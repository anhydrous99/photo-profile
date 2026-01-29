# Research Summary: Photography Portfolio

**Project:** Photo Portfolio
**Research Completed:** 2026-01-25

## Key Findings

### Stack Recommendation

**Next.js 16 + SQLite + Sharp** is the recommended stack:

- **Next.js 16** — Built-in image optimization, React Server Components, self-hostable
- **SQLite + Drizzle ORM** — Single-file database, simple backups, code-first TypeScript schemas
- **Sharp** — 4-5x faster than ImageMagick, handles 50MP images via streaming
- **exifr** — Fastest EXIF extraction (~1ms per file)
- **Auth.js** — Simple admin authentication with JWT sessions
- **Tailwind CSS** — Utility-first CSS, no runtime overhead
- **yet-another-react-lightbox** — React 19 compatible, keyboard/touch navigation

### Table Stakes Features

Must have for any photography portfolio:

1. **Photo grid with thumbnails** — Fast loading gallery display
2. **Lightbox with navigation** — View larger photos, prev/next navigation
3. **Album organization** — Group photos into collections
4. **EXIF metadata display** — Camera, lens, ISO, aperture, shutter speed
5. **Responsive design** — Works on mobile and desktop
6. **Fast load times** — Thumbnails within 1-2 seconds

### Architecture Pattern

**Clean Architecture with async processing pipeline:**

```
Presentation → Application → Domain → Infrastructure
                                ↓
                        Job Queue → Workers
```

- **Separation of concerns** — Domain logic isolated from infrastructure
- **Async image processing** — Accept upload immediately, process in background
- **Multiple image sizes** — 300px, 600px, 1200px, 2400px + blur placeholder
- **Multiple formats** — JPEG, WebP, AVIF with browser fallbacks
- **Never modify originals** — Store separately, generate derivatives

### Critical Pitfalls to Avoid

| Pitfall                   | Prevention                               |
| ------------------------- | ---------------------------------------- |
| Serving 50MP originals    | Generate thumbnails in multiple sizes    |
| Sync processing on upload | Use job queue (BullMQ/Redis)             |
| Memory exhaustion         | Use Sharp streaming, not buffer-based    |
| Missing EXIF rotation     | Sharp auto-rotates based on EXIF         |
| EXIF privacy exposure     | Whitelist displayed fields, hide GPS     |
| Logic in route handlers   | Repository pattern, dependency injection |

### Build Order

1. **Phase 1: Foundation** — Domain entities, database schema, file storage
2. **Phase 2: Image Pipeline** — Job queue, thumbnail generation, EXIF extraction
3. **Phase 3: Public Gallery** — Gallery pages, lightbox, responsive images
4. **Phase 4: Admin Panel** — Authentication, upload interface, album management
5. **Phase 5: Polish** — Performance optimization, blur placeholders, deployment

## Technology Decisions

| Category         | Choice                     | Rationale                                          |
| ---------------- | -------------------------- | -------------------------------------------------- |
| Framework        | Next.js 16                 | Built-in image optimization, SSR, self-hostable    |
| Database         | SQLite + Drizzle           | Simple, single-file, code-first schemas            |
| Image Processing | Sharp                      | Fastest, streaming (low memory), WebP/AVIF support |
| EXIF             | exifr                      | Pure JS, zero dependencies, fast                   |
| Auth             | Auth.js                    | Single admin, JWT sessions, no extra DB tables     |
| Styling          | Tailwind CSS               | No runtime overhead, good photo gallery utilities  |
| Lightbox         | yet-another-react-lightbox | React 19 compatible, responsive, accessible        |
| Job Queue        | BullMQ + Redis             | Production-proven for async processing             |

## File Organization (Clean Architecture)

```
src/
  domain/           # Pure business logic (no framework deps)
    entities/       # Photo, Album types
    repositories/   # Repository interfaces

  application/      # Use cases and services
    services/       # PhotoService, GalleryService, UploadService
    jobs/           # Processing job definitions

  infrastructure/   # External concerns
    database/       # Drizzle schema, repository implementations
    storage/        # Sharp processing, file operations
    queue/          # BullMQ adapter

  presentation/     # UI layer
    app/            # Next.js pages
    components/     # React components
```

## Out of Scope (Deliberately)

- Comments/likes — Social complexity, not core to portfolio
- User accounts for viewers — Fully public site
- Search/filtering — Albums provide sufficient organization
- OAuth — Simple password sufficient for single admin
- Cloud services — Self-hosted requirement

## Open Questions for Phase Planning

1. Exact thumbnail dimensions for optimal viewport coverage
2. Blurhash vs CSS blur for placeholders
3. Drag-drop library for album reordering (@hello-pangea/dnd vs dnd-kit)
4. Which EXIF fields to display publicly (privacy filtering)

---

_Research synthesized from STACK.md, ARCHITECTURE.md, FEATURES.md, PITFALLS.md_
