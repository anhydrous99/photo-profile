# infrastructure/

All external integrations and technical implementations. 45+ files across 7 subdirectories.

## STRUCTURE

```
infrastructure/
├── auth/           # JWT sessions, bcrypt, rate limiting, timing-safe, IP extraction
├── config/         # Zod-validated environment variables
├── database/       # DynamoDB client, tables, repository implementations
├── jobs/           # SQS message enqueuing
├── logging/        # Structured logger (JSON prod, prefixed dev)
├── services/       # Image processing (Sharp) + EXIF extraction
├── storage/        # StorageAdapter interface + S3/filesystem implementations
├── validation/     # UUID validation
└── initialization.ts  # App startup — creates DynamoDB tables (idempotent)
```

## WHERE TO LOOK

| Task                     | Location                          | Key file                                                            |
| ------------------------ | --------------------------------- | ------------------------------------------------------------------- |
| Add DynamoDB query       | `database/dynamodb/repositories/` | DynamoDBPhotoRepository.ts (605 lines)                              |
| Change table schema      | `database/dynamodb/tables.ts`     | 3 tables: Photos, Albums, AlbumPhotos                               |
| Add storage operation    | `storage/index.ts`                | Barrel + `saveOriginalFile`, `findOriginalFile`, `deletePhotoFiles` |
| New storage backend      | `storage/`                        | Implement `StorageAdapter` from `types.ts`                          |
| Change image derivatives | `services/imageService.ts`        | THUMBNAIL_SIZES = [300, 600, 1200, 2400]                            |
| Change EXIF fields       | `services/exifService.ts`         | 11 safe fields — never add GPS/serial                               |
| Auth flow                | `auth/index.ts`                   | Barrel re-exports all auth modules                                  |
| Rate limit config        | `auth/rateLimiter.ts`             | 5 attempts / 15 min, Redis-backed                                   |
| Session config           | `auth/session.ts`                 | HS256 JWT, 8h expiry, httpOnly cookie                               |
| Add env var              | `config/env.ts`                   | Zod schema — add field + validation                                 |
| Enqueue job              | `jobs/queues.ts`                  | SQS SendMessageCommand                                              |

## KEY INTERFACES

**StorageAdapter** (`storage/types.ts`):

```
saveFile(key, data, contentType) · getFile(key) · getFileStream(key)
deleteFiles(prefix) · fileExists(key) · listFiles(prefix)
```

**PhotoRepository** (`domain/repositories/PhotoRepository.ts`):

```
findById · findAll · findPaginated · findByAlbumId · save · delete
getAlbumIds · addToAlbum · removeFromAlbum · updatePhotoSortOrders
findRandomFromPublishedAlbums · findBySlugPrefix · findByStatus · findStaleProcessing
```

## DATABASE CLIENT

- `database/dynamodb/client.ts` — exports `dynamodbClient`, `docClient`, `tableName()`
- Auto-detects local endpoint via `DYNAMODB_ENDPOINT` env var
- Prefix support via `DYNAMODB_TABLE_PREFIX` (e.g., `test_` in tests)

## ANTI-PATTERNS

- **NEVER** import `config/env.ts` outside the main app — Zod crashes without all vars
- **NEVER** remove `.rotate()` or `.withMetadata()` in `imageService.ts`
- **DO NOT** access GPS, camera serial, or software EXIF tags — privacy constraint
- **DO NOT** instantiate DynamoDB/S3/SQS clients per-request — use singletons
- **DO NOT** add new dependencies to `auth/` without understanding the timing attack prevention in `timing.ts`

## TESTING

- Tests live in `__tests__/` subdirectories next to source
- DynamoDB tests use `jest-dynalite` (in-memory DynamoDB)
- Storage tests use filesystem adapter with `/tmp/test-storage`
- Auth tests mock Redis for rate limiter
- Coverage tracked for entire `src/infrastructure/` tree
