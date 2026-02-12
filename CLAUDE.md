# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Photo Profile is a self-hosted photography portfolio built with Next.js 16 (App Router), TypeScript, DynamoDB, and Sharp for image processing. Single admin user, public-facing gallery.

## Commands

| Command                | Purpose                                |
| ---------------------- | -------------------------------------- |
| `npm run dev`          | Dev server (port 3000)                 |
| `npm run build`        | Production build                       |
| `npm run lint`         | ESLint                                 |
| `npm run lint:fix`     | ESLint with auto-fix                   |
| `npm run format`       | Prettier format all files              |
| `npm run format:check` | Check Prettier formatting              |
| `npm run typecheck`    | TypeScript type check (`tsc --noEmit`) |
| `npm run worker`       | Start BullMQ image processing worker   |

Pre-commit hook runs `eslint --fix` + `prettier --write` on staged files via lint-staged.

## Architecture

The codebase follows Clean Architecture with four layers under `src/`:

- **`domain/`** — Entities (`Photo`, `Album`) and repository interfaces. No external dependencies.
- **`application/`** — Business logic services that orchestrate domain objects.
- **`infrastructure/`** — Concrete implementations: DynamoDB repositories, auth (JWT via jose, bcrypt), file storage, Sharp image processing, BullMQ job queue.
- **`presentation/`** — React components, hooks, and client-side utilities.
- **`app/`** — Next.js App Router pages, API routes, and server actions.

### Import Aliases

```
@/*                → ./src/*
@/domain/*         → ./src/domain/*
@/application/*    → ./src/application/*
@/infrastructure/* → ./src/infrastructure/*
@/presentation/*   → ./src/presentation/*
```

### Key Patterns

**Auth flow**: `proxy.ts` (Edge) checks cookie existence on `/admin/*` routes, returning 404 if missing (hides admin panel). The `(protected)/layout.tsx` Server Component performs full JWT verification.

**Image pipeline**: Upload saves original to `storage/originals/{photoId}/`, enqueues a BullMQ job. The worker (`npm run worker`) generates WebP + AVIF derivatives at [300, 600, 1200, 2400] widths using Sharp. Processed files go to `storage/processed/{photoId}/{width}w.{format}`. The image API route (`/api/images/[photoId]/[filename]`) serves them with immutable caching.

**Data access**: Repository pattern — domain interfaces in `domain/repositories/`, DynamoDB implementations in `infrastructure/database/dynamodb/repositories/`. Repositories are instantiated directly in server components and API routes.

**Database**: DynamoDB with tables for photos, albums, and photo-album relationships. UUIDs for IDs, timestamps as milliseconds.

**Routing**: Public pages (`/`, `/albums`, `/albums/[id]`) are Server Components. Admin pages under `/admin/(protected)/` use a route group with auth layout. Client components use `"use client"` directive.

**Styling**: Tailwind CSS v4 with PostCSS plugin. No CSS-in-JS.

### External Services

- **Redis** (docker-compose.yml) — Required for BullMQ job queue and rate limiting. App degrades gracefully if unavailable.
- **DynamoDB** — Cloud database service (AWS). Local testing uses DynamoDB Local.
- **File storage** — Local filesystem at `STORAGE_PATH` (default `./storage`).

## Environment Variables

See `.env.example`. Required: `STORAGE_PATH`, `AUTH_SECRET` (32+ chars), `ADMIN_PASSWORD_HASH` (generate with `npx tsx scripts/hash-password.ts <password>`). Optional: `DYNAMODB_ENDPOINT` (for local development with DynamoDB Local).
