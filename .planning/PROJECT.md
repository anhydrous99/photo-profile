# Photo Portfolio

## What This Is

A personal photography portfolio website for sharing high-resolution photos with friends and the public. Visitors browse random photos on the homepage, explore albums, and view individual photos in a lightbox with EXIF metadata. The owner manages content through a password-protected admin panel with drag-drop uploads.

## Core Value

Let the photos speak for themselves — a clean, distraction-free experience where the photography is the focus, not the interface.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Homepage displays random photos from all albums (changes on refresh)
- [ ] Albums listing page showing all available albums
- [ ] Album view displaying photos in a grid layout
- [ ] Photo lightbox with next/previous navigation
- [ ] EXIF metadata auto-extracted and displayed (camera, ISO, aperture, etc.)
- [ ] Photo descriptions (manually added)
- [ ] Admin panel with password authentication
- [ ] Drag-drop photo upload interface
- [ ] Automatic thumbnail generation for grid views
- [ ] Optimized image versions for lightbox (not full 50MP)
- [ ] Album management (create, rename, delete)
- [ ] Minimalist, photo-focused design
- [ ] Clean code following Robert C. Martin principles

### Out of Scope

- Comments — not needed for portfolio viewing experience
- Likes/favorites — adds social complexity without core value
- Search/filtering — albums provide sufficient organization
- User accounts for viewers — site is fully public
- Social sharing buttons — visitors can share URLs directly
- OAuth/email login — simple password sufficient for single admin

## Context

- Will host thousands of photos, each at 50MP resolution
- Self-hosted on owner's server (not cloud platforms like Vercel/Netlify)
- Single admin user (no multi-user collaboration)
- No deadline — quality and learning take priority over speed
- Educational codebase — clean architecture matters as much as functionality

## Constraints

- **Image Processing**: Must handle 50MP images efficiently — generate thumbnails and web-optimized versions on upload
- **Storage**: Large photo library requires efficient storage strategy (file-based vs database TBD during research)
- **Performance**: Homepage random photos and album grids must load quickly despite large source images
- **Code Quality**: Follow Clean Code principles (Robert C. Martin) — meaningful names, small functions, single responsibility, etc.
- **Self-Hosted**: Must be deployable to a personal server (Docker-friendly preferred)

## Key Decisions

| Decision                       | Rationale                                              | Outcome   |
| ------------------------------ | ------------------------------------------------------ | --------- |
| Simple password auth for admin | Single user, no need for full auth system              | — Pending |
| Auto-extract EXIF metadata     | User wants camera info displayed automatically         | — Pending |
| Generate thumbnails on upload  | 50MP images too large for grid/lightbox direct serving | — Pending |

---

_Last updated: 2026-01-24 after initialization_
