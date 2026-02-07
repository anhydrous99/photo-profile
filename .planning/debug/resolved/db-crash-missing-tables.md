---
status: resolved
trigger: "App crashes when database is deleted - missing photos table causes RuntimeError"
created: 2026-01-31T00:00:00Z
updated: 2026-01-31T00:00:00Z
symptoms_prefilled: true
goal: find_and_fix
---

## Current Focus

hypothesis: No database migration/initialization runs at startup; client.ts only connects without creating tables
test: Add migrate() call in client.ts to initialize schema on startup
expecting: Tables will be created if missing, preventing crashes
next_action: Implement schema migration on database connection

## Symptoms

expected: App handles missing database gracefully - either auto-initializes or shows friendly message
actual: App crashes with RuntimeError "no such table: photos" when database.db is deleted
errors: |
no such table: photos
at SQLitePhotoRepository.findAll (src/infrastructure/database/repositories/SQLitePhotoRepository.ts:18:21)
at AdminDashboard (src/app/admin/(protected)/page.tsx:15:18)
reproduction: Delete database file at ./data/portfolio.db, then navigate to admin dashboard
started: After accidental database deletion; could happen on first setup

## Eliminated

## Evidence

- timestamp: 2026-01-31
  checked: Database client initialization in src/infrastructure/database/client.ts
  found: Client creates Database and drizzle instance but NO migration/initialization logic
  implication: Tables are only created via external drizzle-kit commands, never at runtime

- timestamp: 2026-01-31
  checked: Schema definitions in src/infrastructure/database/schema.ts
  found: Schema defines 3 tables (photos, albums, photo_albums) with complete definitions
  implication: Schema is ready to use, just needs to be instantiated in database

- timestamp: 2026-01-31
  checked: Admin dashboard in src/app/admin/(protected)/page.tsx
  found: Server component directly calls photoRepository.findAll() without try/catch
  implication: When tables don't exist, error propagates uncaught to user

- timestamp: 2026-01-31
  checked: SQLitePhotoRepository.findAll() in src/infrastructure/database/repositories/SQLitePhotoRepository.ts:18
  found: Direct db.select().from(photos) call with no error handling
  implication: SQLite error ("no such table") thrown directly from query

- timestamp: 2026-01-31
  checked: Package.json dependencies
  found: drizzle-orm@0.45.1 and drizzle-kit@0.31.8 installed; no migration scripts
  implication: App relies on manual migration, not automated initialization

## Resolution

root_cause: Database client initialization in client.ts only creates connection, never creates tables. When database file is deleted or doesn't exist, Drizzle doesn't auto-create schema. Admin dashboard calls findAll() which tries to query missing "photos" table, causing "no such table" SQLite error.

fix: Added initializeDatabase() function in client.ts that runs on module load using db.run(sql`CREATE TABLE IF NOT EXISTS...`). Creates all three tables (photos, albums, photo_albums) and indexes. Safe to call multiple times.

verification:

- Deleted portfolio.db file
- Ran npm run build (which loads database client module)
- Database file was automatically created with all three tables (photos, albums, photo_albums)
- Verified with sqlite3 that all tables exist and are queryable
- TypeScript compilation passed with no errors
- Build completed successfully

files_changed:

- src/infrastructure/database/client.ts: Added initializeDatabase() function and call on module load
