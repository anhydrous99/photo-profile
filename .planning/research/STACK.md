# Technology Stack

**Project:** Photography Portfolio Website
**Researched:** 2026-01-24
**Overall Confidence:** HIGH

## Executive Summary

This stack prioritizes clean code architecture (Robert C. Martin principles), educational value, and self-hosted simplicity. Next.js 16 provides the foundation with its built-in image optimization (critical for 50MP images), while Sharp handles server-side thumbnail generation. SQLite via Drizzle ORM keeps deployment simple with a single-file database. The architecture follows clean architecture patterns with clear domain boundaries.

---

## Recommended Stack

### Core Framework

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **Next.js** | ^16.0.0 | Full-stack React framework | Built-in image optimization critical for photography sites. Turbopack default bundler (2-5x faster builds). App Router with React Server Components for clean architecture separation. Self-hostable via `next start` or standalone output. | HIGH |
| **React** | ^19.2.0 | UI library | Ships with Next.js 16. React Compiler (stable) provides automatic memoization. View Transitions for smooth lightbox animations. | HIGH |
| **TypeScript** | ^5.5.0 | Type safety | Enables clean architecture with strong contracts between layers. Required for Drizzle ORM schema definitions. Next.js 16 requires >=5.1. | HIGH |

**Source:** [Next.js 16 Release Blog](https://nextjs.org/blog/next-16), [Next.js 15 Blog](https://nextjs.org/blog/next-15)

### Database

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **SQLite** | ^3.45.0 | Relational database | Perfect for single-user, self-hosted portfolios. Single-file database = simple backups. Zero configuration. Handles thousands of images easily. | HIGH |
| **better-sqlite3** | ^11.0.0 | SQLite driver | Fastest synchronous SQLite driver for Node.js. Type-safe with TypeScript. Drizzle ORM's recommended SQLite driver. | HIGH |
| **Drizzle ORM** | ^0.38.0 | Database ORM | Code-first schema in TypeScript = clean architecture alignment. Zero dependencies, 31KB. SQL-like queries (educational). Serverless-ready. Automatic migrations via Drizzle Kit. | HIGH |

**Rationale for SQLite over PostgreSQL:**
- Personal portfolio = single-user admin, low concurrent writes
- Self-hosted simplicity (no separate database server)
- Backup = copy one file
- Performance excellent for read-heavy photo browsing
- Thousands of image metadata records is trivial for SQLite

**Source:** [Drizzle ORM Docs](https://orm.drizzle.team/docs/overview), [SQLite vs PostgreSQL Comparison](https://www.selecthub.com/relational-database-solutions/postgresql-vs-sqlite/)

### Image Processing

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **Sharp** | ^0.34.5 | Thumbnail generation, format conversion | 4-5x faster than ImageMagick. Handles 50MP images efficiently via streaming (small memory footprint). Outputs WebP/AVIF. libvips-based. Automatically bundled with Next.js 15+. | HIGH |
| **exifr** | ^7.1.3 | EXIF metadata extraction | Fastest EXIF library (~1ms per file). Supports JPEG, HEIC, AVIF, PNG. Extracts GPS, camera settings, lens info. Zero dependencies. | HIGH |

**Thumbnail Strategy:**
- Generate on upload (not on-demand) for 50MP source files
- Create: 400px (thumbnail), 1200px (gallery), 2400px (lightbox)
- Output: WebP with JPEG fallback
- Store originals in separate `/originals/` directory (not publicly served)

**Source:** [Sharp Documentation](https://sharp.pixelplumbing.com/), [exifr GitHub](https://github.com/MikeKovarik/exifr)

### Authentication

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **Auth.js (NextAuth v5)** | ^5.0.0-beta | Admin authentication | Works seamlessly with Next.js App Router, Server Components, and middleware. JWT sessions = no extra database tables. Credentials provider sufficient for single-admin portfolio. | HIGH |

**Auth Strategy:**
- Single admin user (credentials provider with hashed password)
- JWT-based sessions (stateless, no session table needed)
- Middleware protects `/admin/*` routes
- Environment variables: `AUTH_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`

**Source:** [Auth.js Next.js Reference](https://authjs.dev/reference/nextjs), [Next.js Authentication Guide](https://nextjs.org/docs/app/guides/authentication)

### UI/Styling

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **Tailwind CSS** | ^4.0.0 | Utility-first CSS | Better performance than CSS-in-JS (no runtime overhead). PurgeCSS removes unused styles. Teams report 15+ point Lighthouse score improvements vs styled-components. | HIGH |
| **yet-another-react-lightbox** | ^3.21.0 | Photo lightbox/viewer | React 19 compatible. Responsive images with automatic srcset. Keyboard/touch navigation. Plugin architecture (zoom, thumbnails, video). 4.7KB lite version available. | HIGH |
| **react-dropzone** | ^14.3.0 | Admin drag-drop uploads | Battle-tested. Hook-based API (`useDropzone`). TypeScript support. No external dependencies for file handling. | MEDIUM |

**Source:** [Tailwind vs styled-components](https://seekandhit.com/engineering/optimising-style-for-speed-our-journey-from-styled-components-to-tailwind-css/), [yet-another-react-lightbox](https://yet-another-react-lightbox.com/), [react-dropzone GitHub](https://github.com/react-dropzone/react-dropzone)

### State Management

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **Zustand** | ^5.0.0 | Client state | Minimal API, 3KB bundle. No providers needed. Perfect for photo viewer state (current photo, zoom level, lightbox open). DevTools support. | MEDIUM |

**Rationale:** Photo portfolio has minimal client state. React Server Components handle most data. Zustand only for UI state (lightbox, admin form state). Could also work with just React `useState` if simpler.

**Source:** [Zustand Comparison](https://zustand.docs.pmnd.rs/getting-started/comparison), [State Management 2025](https://dev.to/hijazi313/state-management-in-2025-when-to-use-context-redux-zustand-or-jotai-2d2k)

### File Upload Handling

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **busboy** | ^1.6.0 | Streaming file uploads | Memory-efficient for large 50MP files. Streams to disk instead of loading entire file into memory. Works with Next.js API routes. | MEDIUM |

**Upload Configuration Required:**
```javascript
// next.config.ts
export default {
  experimental: {
    serverActions: {
      bodySizeLimit: '100mb', // For 50MP JPEGs
    },
  },
};
```

**Source:** [Next.js Large File Uploads](https://dev.to/grimshinigami/how-to-handle-large-filefiles-streams-in-nextjs-13-using-busboymulter-25gb)

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not Alternative |
|----------|-------------|-------------|---------------------|
| **Framework** | Next.js 16 | Astro | Astro better for static sites. Photo portfolio benefits from Next.js API routes for uploads, dynamic albums, server components. |
| **Framework** | Next.js 16 | Remix | Less mature image optimization. Smaller ecosystem. Next.js has more photography portfolio examples. |
| **Database** | SQLite + Drizzle | PostgreSQL + Prisma | Over-engineered for single-user portfolio. Adds deployment complexity. PostgreSQL better when concurrent admin access needed. |
| **ORM** | Drizzle | Prisma | Drizzle's code-first approach aligns with clean architecture (schema IS TypeScript code). Smaller bundle. No code generation step. Educational: see SQL being generated. |
| **ORM** | Drizzle | TypeORM | TypeORM is decorator-based, harder to test. Less TypeScript-native. Drizzle more modern. |
| **Image Processing** | Sharp | Jimp | Jimp 20x slower in benchmarks. Sharp handles 50MP images efficiently via streaming. |
| **Image Processing** | Sharp | ImageMagick | Sharp 4-5x faster. Native Node.js binding. No external binary dependency. |
| **EXIF** | exifr | exiftool-vendored | exiftool-vendored requires ExifTool binary. exifr is pure JS, faster for read-only use case. |
| **EXIF** | exifr | ExifReader | Both excellent. exifr slightly faster, smaller. Either would work. |
| **Lightbox** | yet-another-react-lightbox | lightgallery | lightgallery is paid for commercial use. YARL is MIT licensed, React-native, excellent responsive image support. |
| **Lightbox** | yet-another-react-lightbox | PhotoSwipe | PhotoSwipe excellent but more complex. YARL simpler for React integration. |
| **Styling** | Tailwind CSS | styled-components | Runtime CSS-in-JS adds 10-15ms render time. Tailwind compiles to static CSS. |
| **Styling** | Tailwind CSS | CSS Modules | Either works. Tailwind has better ecosystem for photo galleries (aspect-ratio, grid utilities). |
| **Auth** | Auth.js | Clerk | Clerk is excellent but external service. Self-hosted requirement favors Auth.js. |
| **Auth** | Auth.js | Custom JWT | Auth.js handles edge cases (CSRF, token rotation). Don't reinvent auth. |
| **State** | Zustand | Redux | Redux overkill for photo viewer state. Zustand simpler, smaller. |
| **State** | Zustand | Jotai | Either works. Zustand slightly better for global store pattern. Jotai better for highly granular state. |

---

## What NOT to Use

| Technology | Why Avoid |
|------------|-----------|
| **React Image Lightbox** | Deprecated. Unmaintained since 2022. |
| **Simple React Lightbox** | Deprecated. Use yet-another-react-lightbox instead. |
| **Multer** | Memory-based by default. Use busboy with streams for 50MP files. |
| **next/legacy/image** | Deprecated in Next.js 16. Use `next/image`. |
| **node-exif** | Older, less maintained. exifr faster and more format support. |
| **express-fileupload** | Loads entire file to memory. Bad for 50MP images. |
| **MongoDB** | Wrong tool for relational photo/album data. Use SQLite. |
| **Firebase** | External dependency. Self-hosted requirement. |
| **Cloudinary/Imgix** | External services. Self-hosted requirement for image processing. |

---

## Clean Architecture Alignment

This stack supports Robert C. Martin's Clean Architecture principles:

### Layer Separation

```
src/
  domain/           # Entities, business rules (no framework dependencies)
    entities/       # Photo, Album, User types
    repositories/   # Repository interfaces
    usecases/       # Application business rules

  infrastructure/   # External concerns (frameworks, DB, file system)
    database/       # Drizzle schema, repository implementations
    storage/        # Sharp image processing, file operations
    auth/           # Auth.js configuration

  presentation/     # UI layer (React components, Next.js routes)
    app/            # Next.js App Router pages
    components/     # React components
    hooks/          # Custom hooks
```

### Why This Stack Supports Clean Architecture

1. **Drizzle ORM:** Schema-as-TypeScript means domain types can be derived from database schema, or vice versa. No magic decorators obscuring the domain model.

2. **TypeScript:** Enforces contracts between layers. Interfaces define repository boundaries. Domain doesn't import infrastructure.

3. **Next.js API Routes:** Use cases called from route handlers. Presentation layer thin, just wiring.

4. **Sharp/exifr:** Infrastructure services easily mockable. Define `ImageProcessor` interface, implement with Sharp.

5. **SQLite:** Simple enough to reason about. No ORM magic hiding SQL. Educational: see actual queries.

---

## Installation

```bash
# Initialize project
npx create-next-app@latest photo-portfolio --typescript --tailwind --app --turbopack

# Core dependencies
npm install drizzle-orm better-sqlite3 sharp exifr next-auth@beta zustand yet-another-react-lightbox react-dropzone busboy

# Dev dependencies
npm install -D drizzle-kit @types/better-sqlite3 @types/busboy

# Tailwind CSS (already installed by create-next-app)
```

### Environment Variables

```bash
# .env.local

# Auth
AUTH_SECRET="generate-with-openssl-rand-base64-32"
ADMIN_USERNAME="admin"
ADMIN_PASSWORD_HASH="bcrypt-hash-of-password"

# Database
DATABASE_PATH="./data/portfolio.db"

# Storage
UPLOAD_DIR="./uploads"
ORIGINALS_DIR="./originals"
THUMBNAILS_DIR="./public/images"

# Site
NEXT_PUBLIC_SITE_URL="https://photos.example.com"
```

### Database Setup

```bash
# Generate migration from schema
npx drizzle-kit generate

# Apply migration
npx drizzle-kit migrate

# Or for development: push schema directly
npx drizzle-kit push
```

---

## Version Compatibility Matrix

| Package | Minimum Node.js | Minimum TypeScript | Notes |
|---------|-----------------|-------------------|-------|
| Next.js 16 | 20.9.0 | 5.1.0 | Node 18 no longer supported |
| Sharp 0.34 | 18.17.0 | - | Works with Node 20+ |
| Drizzle ORM | 18.0.0 | 5.0.0 | |
| better-sqlite3 | 18.0.0 | - | |
| Auth.js v5 | 18.0.0 | 5.0.0 | |

**Recommended Node.js:** 22.x LTS (for best performance with Turbopack)

---

## Confidence Assessment

| Component | Confidence | Reasoning |
|-----------|------------|-----------|
| Next.js 16 | HIGH | Official docs verified, release notes reviewed |
| Sharp | HIGH | Official docs verified, v0.34.5 confirmed |
| Drizzle + SQLite | HIGH | Official docs verified, well-documented pattern |
| exifr | HIGH | GitHub README verified, npm package confirmed |
| Auth.js | HIGH | Official docs verified, Next.js recommended |
| Tailwind CSS | HIGH | Standard practice, well-documented |
| yet-another-react-lightbox | MEDIUM | Popular but version/maintenance less verified |
| react-dropzone | MEDIUM | Actively maintained, but didn't verify exact version |
| Zustand | MEDIUM | Standard choice, but minimal state needs might not require it |
| busboy | MEDIUM | Standard for streaming uploads, but patterns less verified |

---

## Sources

### Official Documentation (HIGH confidence)
- [Next.js 16 Blog](https://nextjs.org/blog/next-16)
- [Next.js 15 Blog](https://nextjs.org/blog/next-15)
- [Next.js Image Optimization](https://nextjs.org/docs/app/getting-started/images)
- [Next.js Authentication Guide](https://nextjs.org/docs/app/guides/authentication)
- [Sharp Documentation](https://sharp.pixelplumbing.com/)
- [Drizzle ORM Overview](https://orm.drizzle.team/docs/overview)
- [Drizzle SQLite Guide](https://orm.drizzle.team/docs/get-started-sqlite)
- [Auth.js Next.js Reference](https://authjs.dev/reference/nextjs)
- [exifr GitHub](https://github.com/MikeKovarik/exifr)

### Comparison Articles (MEDIUM confidence)
- [Prisma vs Drizzle 2026](https://medium.com/@thebelcoder/prisma-vs-drizzle-orm-in-2026-what-you-really-need-to-know-9598cf4eaa7c)
- [SQLite vs PostgreSQL](https://www.selecthub.com/relational-database-solutions/postgresql-vs-sqlite/)
- [Styled-components to Tailwind Migration](https://seekandhit.com/engineering/optimising-style-for-speed-our-journey-from-styled-components-to-tailwind-css/)
- [Zustand vs Jotai](https://zustand.docs.pmnd.rs/getting-started/comparison)
- [Top Authentication Solutions 2026](https://workos.com/blog/top-authentication-solutions-nextjs-2026)

### Community Resources (MEDIUM confidence)
- [yet-another-react-lightbox](https://yet-another-react-lightbox.com/)
- [react-dropzone GitHub](https://github.com/react-dropzone/react-dropzone)
- [React Lightbox Comparison](https://blog.logrocket.com/comparing-the-top-3-react-lightbox-libraries/)
- [Clean Architecture Node.js](https://dev.to/evangunawan/clean-architecture-in-nodejs-an-approach-with-typescript-and-dependency-injection-16o)
- [Next.js Large File Uploads](https://dev.to/grimshinigami/how-to-handle-large-filefiles-streams-in-nextjs-13-using-busboymulter-25gb)

---

## Open Questions for Phase Research

1. **Thumbnail sizing:** What exact dimensions optimize for common viewport sizes while minimizing storage?
2. **Blurhash integration:** Should placeholders use blurhash or CSS blur? Need to verify Next.js 16 blur placeholder behavior.
3. **Album ordering:** Drag-drop reordering in admin - is `@hello-pangea/dnd` or `dnd-kit` better for this?
4. **EXIF privacy:** Which fields to display publicly vs. hide (GPS coordinates)?
