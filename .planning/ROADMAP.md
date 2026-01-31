# Roadmap: Photo Portfolio

## Overview

This roadmap delivers a personal photography portfolio website where visitors browse random photos on the homepage, explore albums, and view photos in a lightbox. The admin manages content through a password-protected panel with drag-drop uploads. The build order prioritizes infrastructure (database, image processing) before user-facing features, ensuring each phase produces verifiable, working functionality.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - Domain entities, database schema, file storage infrastructure
- [x] **Phase 2: Image Pipeline** - Async job queue, thumbnail generation, format conversion
- [x] **Phase 3: Admin Auth** - Password authentication for admin panel access
- [x] **Phase 4: Photo Upload** - Drag-drop interface with batch upload and progress
- [x] **Phase 5: Photo Management** - Descriptions, album assignment, deletion
- [ ] **Phase 6: Album Management** - Create, rename, delete albums
- [ ] **Phase 7: Public Gallery** - Album listing and photo grid with responsive design
- [ ] **Phase 8: Lightbox** - Full photo viewing with navigation and keyboard controls
- [ ] **Phase 9: Homepage** - Random photo display from all albums
- [ ] **Phase 10: Polish** - Blur placeholders and performance optimization

## Phase Details

### Phase 1: Foundation

**Goal**: Establish the core infrastructure for storing photos and albums
**Depends on**: Nothing (first phase)
**Requirements**: None directly (infrastructure enables all other requirements)
**Success Criteria** (what must be TRUE):

1. Next.js project scaffolded with clean architecture folder structure
2. SQLite database created with Photo and Album tables via Drizzle ORM
3. File storage directory structure exists for originals and derivatives
4. Repository pattern implemented for Photo and Album entities
5. Development server runs without errors
   **Plans**: 3 plans

Plans:

- [x] 01-01-PLAN.md — Project scaffolding and clean architecture setup
- [x] 01-02-PLAN.md — Domain entities, repository interfaces, and Drizzle schema
- [x] 01-03-PLAN.md — Repository implementations and development tooling

### Phase 2: Image Pipeline

**Goal**: Enable automatic thumbnail and optimized image generation
**Depends on**: Phase 1
**Requirements**: UPLD-04, UPLD-05
**Success Criteria** (what must be TRUE):

1. Uploading an image triggers async job for processing (deferred to Phase 4)
2. Multiple thumbnail sizes generated (300px, 600px, 1200px, 2400px)
3. WebP format generated alongside AVIF
4. Original image preserved separately from derivatives
5. Processing completes within reasonable time for 50MP images
   **Plans**: 4 plans

Plans:

- [x] 02-01-PLAN.md — Dependencies and BullMQ queue configuration
- [x] 02-02-PLAN.md — Sharp image processing service
- [x] 02-03-PLAN.md — Worker implementation and startup script
- [x] 02-04-PLAN.md — Gap closure: AVIF format instead of JPEG

### Phase 3: Admin Auth

**Goal**: Protect admin features with password authentication
**Depends on**: Phase 1
**Requirements**: AUTH-01, AUTH-02
**Success Criteria** (what must be TRUE):

1. Admin login page exists at /admin/login
2. Incorrect password shows error message
3. Correct password creates authenticated session
4. Authenticated session persists across page navigation
5. Unauthenticated access to /admin/\* returns 404 (hides admin existence)
   **Plans**: 3 plans

Plans:

- [x] 03-01-PLAN.md — Auth infrastructure (session, password, rate limiting, DAL)
- [x] 03-02-PLAN.md — Login page and Server Action
- [x] 03-03-PLAN.md — Route protection (proxy.ts and protected layout)

### Phase 4: Photo Upload

**Goal**: Admin can upload photos through intuitive drag-drop interface
**Depends on**: Phase 2, Phase 3
**Requirements**: UPLD-01, UPLD-02, UPLD-03
**Success Criteria** (what must be TRUE):

1. Drag-drop zone accepts image files
2. Multiple files can be dropped at once
3. Upload progress shown for each file
4. Uploaded photos appear in admin photo list
5. Image pipeline processes uploads automatically
   **Plans**: 3 plans

Plans:

- [x] 04-01-PLAN.md — Upload infrastructure (Route Handler and file storage)
- [x] 04-02-PLAN.md — Client components (DropZone and upload function)
- [x] 04-03-PLAN.md — Upload page with batch state and admin photo list

### Phase 5: Photo Management

**Goal**: Admin can manage photo metadata and organization
**Depends on**: Phase 4
**Requirements**: MGMT-01, MGMT-02, MGMT-03
**Success Criteria** (what must be TRUE):

1. Admin can add/edit description for any photo
2. Admin can assign photo to one or more albums
3. Admin can delete photos (with confirmation)
4. Deleted photos remove all associated files (originals + derivatives)
   **Plans**: 4 plans

Plans:

- [x] 05-01-PLAN.md — Photo API and file cleanup (PATCH/DELETE endpoints)
- [x] 05-02-PLAN.md — Album assignment API (photo-album relationships)
- [x] 05-03-PLAN.md — Photo detail page with auto-save and album selector
- [x] 05-04-PLAN.md — Batch selection and operations in grid

### Phase 6: Album Management

**Goal**: Admin can organize photos into albums with drag-drop ordering and category tags
**Depends on**: Phase 5
**Requirements**: ALBM-03, ALBM-04, ALBM-05
**Success Criteria** (what must be TRUE):

1. Admin can create new albums with names, descriptions, and tags
2. Admin can rename existing albums
3. Admin can delete albums (photos remain, just unassigned) OR delete album with all photos
4. Album list shows photo count per album
5. Admin can drag-drop albums to reorder them
   **Plans**: 2 plans

Plans:

- [ ] 06-01-PLAN.md — Album API infrastructure (CRUD endpoints, photo counts, reorder, cascade delete)
- [ ] 06-02-PLAN.md — Album list UI with drag-drop ordering and CRUD modals

### Phase 7: Public Gallery

**Goal**: Visitors can browse albums and view photo grids
**Depends on**: Phase 6
**Requirements**: GLRY-01, GLRY-02, GLRY-04, ALBM-01, ALBM-02
**Success Criteria** (what must be TRUE):

1. Album listing page shows all albums with cover thumbnails
2. Clicking album displays responsive grid of photos
3. Thumbnails load quickly (optimized sizes served)
4. Gallery works on mobile and desktop viewports
5. Minimalist design keeps focus on photos
   **Plans**: TBD

Plans:

- [ ] 07-01: Album listing page
- [ ] 07-02: Photo grid component with responsive layout
- [ ] 07-03: Responsive image serving (srcset)

### Phase 8: Lightbox

**Goal**: Visitors can view photos in immersive full-size display
**Depends on**: Phase 7
**Requirements**: VIEW-01, VIEW-02, VIEW-03, VIEW-04
**Success Criteria** (what must be TRUE):

1. Clicking photo opens larger view in lightbox overlay
2. Previous/next buttons navigate between photos
3. Arrow keys navigate, Escape closes lightbox
4. Photo description displayed when viewing
5. Lightbox works on mobile and desktop
   **Plans**: TBD

Plans:

- [ ] 08-01: Lightbox component integration
- [ ] 08-02: Keyboard navigation
- [ ] 08-03: Photo description display

### Phase 9: Homepage

**Goal**: Visitors see curated random selection on landing page
**Depends on**: Phase 7
**Requirements**: HOME-01, HOME-02
**Success Criteria** (what must be TRUE):

1. Homepage displays photos from across all albums
2. Photo selection randomizes on page refresh
3. Clicking homepage photo opens lightbox
4. Design is clean and photo-focused
   **Plans**: TBD

Plans:

- [ ] 09-01: Random photo selection service
- [ ] 09-02: Homepage layout and design

### Phase 10: Polish

**Goal**: Final optimizations for production-quality experience
**Depends on**: Phase 8, Phase 9
**Requirements**: GLRY-03
**Success Criteria** (what must be TRUE):

1. Blur placeholder shown while full images load
2. Page load performance acceptable (thumbnails < 2 seconds)
3. No visual layout shift when images load
4. Production build works in Docker container
   **Plans**: TBD

Plans:

- [ ] 10-01: Blur placeholder generation and display
- [ ] 10-02: Performance optimization audit
- [ ] 10-03: Docker deployment configuration

## Progress

**Execution Order:**
Phases execute in numeric order: 1 - 2 - 3 - 4 - 5 - 6 - 7 - 8 - 9 - 10

| Phase               | Plans Complete | Status      | Completed  |
| ------------------- | -------------- | ----------- | ---------- |
| 1. Foundation       | 3/3            | Complete    | 2026-01-29 |
| 2. Image Pipeline   | 4/4            | Complete    | 2026-01-30 |
| 3. Admin Auth       | 3/3            | Complete    | 2026-01-30 |
| 4. Photo Upload     | 3/3            | Complete    | 2026-01-30 |
| 5. Photo Management | 4/4            | Complete    | 2026-01-31 |
| 6. Album Management | 0/2            | Planned     | -          |
| 7. Public Gallery   | 0/3            | Not started | -          |
| 8. Lightbox         | 0/3            | Not started | -          |
| 9. Homepage         | 0/2            | Not started | -          |
| 10. Polish          | 0/3            | Not started | -          |

**Total Plans:** 30
**Completed:** 17/30 (57%)
