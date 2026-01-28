# Phase 1: Foundation - Context

**Gathered:** 2026-01-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Establish the core infrastructure for the photo portfolio application: Next.js project scaffolding with clean architecture, SQLite database with Photo/Album tables via Drizzle ORM, file storage structure for image assets, and repository pattern implementation. This phase delivers the technical foundation that all subsequent phases build upon.

</domain>

<decisions>
## Implementation Decisions

### Project Structure
- Clean architecture with strict layer separation
- Layers inside src/: src/domain/, src/application/, src/infrastructure/, src/presentation/
- Next.js app/ directory at project root
- Path aliases using @ prefix: @/domain/..., @/application/..., @/infrastructure/..., @/presentation/...

### Database Approach
- Many-to-many relationship via PhotoAlbums junction table (photos can belong to multiple albums)
- File paths and metadata handling left to Claude's discretion (will be practical and maintainable)
- Migration strategy left to Claude's discretion (appropriate for Drizzle workflow)

### Development Setup
- Docker Compose with Redis service for local development
- Environment variable validation with Zod (fail fast on misconfiguration)
- Full tooling: ESLint, Prettier, TypeScript strict mode, pre-commit hooks (Husky)
- Storage directory structure committed to repo with .gitkeep files

### Claude's Discretion
- Shared utilities and types organization (dedicated shared/ folder vs per-layer organization)
- Database metadata tracking approach (timestamps, audit fields)
- File path storage strategy (relative paths, JSON structure, or multiple columns)
- Database migration tooling (manual migrations vs Drizzle Kit push)

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches within the architectural decisions above.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-01-27*
