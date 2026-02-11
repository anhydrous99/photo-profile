# Photo Profile

A modern, high-performance, self-hosted photography portfolio built with **Next.js 16**, following **Clean Architecture** principles. Leverages **DynamoDB** for data storage, **BullMQ** for background image processing, and **AWS S3 + CloudFront** for scalable image delivery.

## 🚀 Key Features

- **Next.js 16 App Router**: Leveraging Server Components for optimal performance.
- **Clean Architecture**: Strict separation of concerns (Domain, Infrastructure, Presentation).
- **High-Performance Image Pipeline**:
  - Background processing with **BullMQ** (Redis).
  - High-quality image derivatives (WebP, AVIF) using **Sharp**.
  - Automatic EXIF data extraction.
  - Smart image loading and progressive rendering.
- **Database**:
  - **DynamoDB** for production-grade data storage (primary).
  - **SQLite** support for local development (legacy option).
- **Flexible Storage**:
  - **Local Filesystem**: Simple setup for self-hosting.
  - **AWS S3 + CloudFront**: Scalable object storage with global CDN delivery.
- **Secure Admin Panel**:
  - JWT-based authentication (Jose) with timing attack prevention.
  - Rate limiting and brute-force protection (Redis-backed).
  - Secure password hashing (Bcrypt).
  - IP validation with trusted proxy support.
- **Modern UI**: **Tailwind CSS v4** and **Geist** font family.

## 🛠 Tech Stack

| Layer                | Technology           | Version    | Notes                                                               |
| -------------------- | -------------------- | ---------- | ------------------------------------------------------------------- |
| **Framework**        | Next.js              | 16         | App Router with Server Components                                   |
| **Runtime**          | Node.js              | 20+        | Recommended for optimal performance                                 |
| **Language**         | TypeScript           | Latest     | Strict mode enabled                                                 |
| **Database**         | DynamoDB             | AWS SDK v3 | **Primary** (production-ready). SQLite legacy option for local dev. |
| **ORM**              | Drizzle ORM          | Latest     | SQLite only (DynamoDB uses direct SDK)                              |
| **Job Queue**        | BullMQ               | Latest     | Requires Redis for background image processing                      |
| **Image Processing** | Sharp                | Latest     | WebP, AVIF derivatives + EXIF extraction                            |
| **Storage**          | AWS S3 or Filesystem | —          | Choose one: `STORAGE_BACKEND` env var                               |
| **CDN**              | CloudFront           | —          | Optional, pairs with S3 for global delivery                         |
| **Styling**          | Tailwind CSS         | v4         | Utility-first CSS framework                                         |
| **Testing**          | Vitest, Playwright   | Latest     | Unit tests + E2E browser testing                                    |
| **Auth**             | Jose, Bcrypt         | Latest     | JWT (HS256), password hashing, rate limiting                        |
| **UI Font**          | Geist                | Latest     | Modern, high-performance font family                                |

## 📋 Prerequisites

- **Node.js** (v20 or higher recommended)
- **Redis** (Optional for development; **Required for production** background job processing and rate limiting)
- **AWS Account** (Optional, if using DynamoDB or S3 storage; Docker Compose includes local DynamoDB)
- **Docker & Docker Compose** (Recommended for easy setup of Redis and DynamoDB-local)

## 🏁 Getting Started

### 1. Installation

```bash
npm install
```

### 2. Environment Configuration

Create a `.env` file in the root directory with the following required and optional settings:

#### ✅ **Required Core Settings**

```env
AUTH_SECRET=your-super-secret-key-at-least-32-chars-long
ADMIN_PASSWORD_HASH= # Generated in step 3
```

#### 🗄️ **Database Configuration (Choose One)**

**Option A: DynamoDB (Recommended for Production)**

```env
# AWS DynamoDB (requires AWS account)
# Credentials handled via AWS SDK (IAM roles or .aws/credentials)
# Tables created automatically on first run

# For local development with Docker Compose:
DYNAMODB_ENDPOINT=http://localhost:8000
DYNAMODB_TABLE_PREFIX=dev_
```

**Option B: SQLite (Legacy - Local Development Only)**

```env
DATABASE_PATH=./data/photo-profile.db
```

> **Why DynamoDB?** Fully managed, production-grade, scales automatically. SQLite is maintained for backwards compatibility and lightweight local development.

#### 💾 **Storage Backend (Choose One)**

**Option A: Local Filesystem (Default)**

```env
STORAGE_BACKEND=filesystem
STORAGE_PATH=./storage
```

**Option B: AWS S3 + CloudFront (Recommended for Production)**

```env
STORAGE_BACKEND=s3
AWS_REGION=us-east-1
AWS_S3_BUCKET=your-bucket-name
AWS_CLOUDFRONT_DOMAIN=d12345.cloudfront.net
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
NEXT_PUBLIC_CLOUDFRONT_DOMAIN=d12345.cloudfront.net
```

#### 🔄 **Optional Configuration**

```env
REDIS_URL=redis://localhost:6379      # Defaults to localhost:6379
NODE_ENV=development                  # or production
LOG_LEVEL=info                         # or debug, warn, error
```

**Ensure these directories exist or are writable:**

- `./data/` (if using SQLite)
- `./storage/` (if using filesystem backend)

### 3. Generate Admin Password

Use the included helper script to generate a secure bcrypt hash for your admin password:

```bash
npx tsx scripts/hash-password.ts "your-secure-password"
```

Copy the output hash into your `.env` file as `ADMIN_PASSWORD_HASH`.

### 4. Database Setup

**Option A: DynamoDB (Recommended for Production)**

If using AWS DynamoDB, tables are created automatically on first run. For local development with Docker Compose, tables are provisioned during startup.

**Option B: SQLite to DynamoDB Migration (If migrating from existing SQLite)**

If you have an existing SQLite database and want to migrate to DynamoDB:

```bash
npm run db:migrate-dynamo
```

This script:

- Reads all photos and albums from SQLite
- Batch-writes them to DynamoDB
- Performs verification to ensure data integrity
- Supports dry-run mode to preview changes

**Option C: SQLite Only (Local Development)**

For lightweight local development without Docker, SQLite is initialized automatically:

```bash
# No explicit setup needed — SQLite initializes on first run
npm run dev
```

## 🏃‍♂️ Running the Application

To run the full application, you need **two processes** running: the web server and the background worker.

### Option A: Using Docker Compose (Recommended)

This runs the Web App, Worker, Redis, and DynamoDB-Local in a single command:

```bash
docker-compose up -d
```

**Services included:**

- **web** — Next.js app (http://localhost:3000)
- **worker** — Background image processing (requires Redis)
- **redis** — In-memory cache & job queue (port 6379)
- **dynamodb-local** — Local DynamoDB for development (port 8000, in-memory mode)

**To stop all services:**

```bash
docker-compose down
```

**To view logs:**

```bash
docker-compose logs -f web    # Web server logs
docker-compose logs -f worker # Worker logs
```

### Option B: Manual Start

1. **Start Redis** (Ensure Redis is running locally)
2. **Start Web Server** (http://localhost:3000)
   ```bash
   npm run dev
   ```
3. **Start Worker Process**
   ```bash
   npm run worker
   ```
   _Note: Images will remain in "Processing" state if the worker is not running._

## 📂 Project Structure

This project follows **Clean Architecture** with strict separation of concerns:

```
src/
├── domain/
│   ├── entities/        # Photo, Album — plain TS interfaces (ZERO external dependencies)
│   └── repositories/    # PhotoRepository, AlbumRepository interface contracts
│
├── application/         # [EMPTY — .gitkeep] Business logic lives in API routes & infra services
│
├── infrastructure/      # Implementation of domain contracts + external services
│   ├── auth/            # JWT (jose), Bcrypt, rate limiter, session management
│   ├── config/          # Zod-validated environment variables (crash on startup if invalid)
│   ├── database/        # SQLite (Drizzle ORM) + DynamoDB repositories & tables
│   ├── jobs/            # BullMQ queue setup + standalone image processor worker
│   ├── logging/         # Structured logger (JSON in prod, pretty in dev)
│   ├── services/        # Sharp image processing, EXIF extraction, derivatives
│   ├── storage/         # StorageAdapter interface + filesystem & S3 implementations
│   └── validation/      # UUID & input validation helpers
│
├── presentation/        # React UI Components
│   ├── components/      # Reusable client components (barrel exported via index.ts)
│   └── lib/             # XHR upload utility with progress tracking
│
├── app/                 # Next.js App Router (Entry Points)
│   ├── actions/         # Server Action: login (rate-limited password verification)
│   ├── admin/login/     # Public password login page (unprotected)
│   ├── admin/(protected)/  # Route group — JWT verification in layout
│   ├── albums/          # Public album gallery pages (Server Components)
│   ├── api/             # REST API endpoints (admin/* routes require auth)
│   └── page.tsx         # Home: random public photos (force-dynamic, no cache)
│
├── lib/                 # Shared utilities
│   ├── imageLoader.ts   # Custom Next.js image loader for Sharp derivatives
│   └── types.ts         # Global type definitions
│
└── proxy.ts             # Edge middleware: cookie validation on /admin/* routes
```

### Architecture Principles

| Layer              | Purpose               | Dependencies                    | Examples                                         |
| ------------------ | --------------------- | ------------------------------- | ------------------------------------------------ |
| **Domain**         | Pure business rules   | None (import only from domain/) | Photo interface, Album interface                 |
| **Infrastructure** | External integrations | Domain only                     | DynamoDB repos, JWT auth, Sharp image service    |
| **Presentation**   | React UI components   | Domain, Infrastructure          | PhotoGrid, AlbumCard (client components)         |
| **App (Next.js)**  | HTTP entry points     | All layers                      | API routes, Server Components, Client Components |

## 📜 Scripts

### Development

| Command          | Description                                                          |
| ---------------- | -------------------------------------------------------------------- |
| `npm run dev`    | Start Next.js dev server (http://localhost:3000) with HMR            |
| `npm run worker` | Start BullMQ background worker for image processing (requires Redis) |

### Build & Production

| Command           | Description                                                         |
| ----------------- | ------------------------------------------------------------------- |
| `npm run build`   | Build for production (standalone output, optimized)                 |
| `npm run start`   | Start production server (requires `npm run build` first)            |
| `npm run analyze` | Analyze Next.js bundle size and identify optimization opportunities |

### Code Quality

| Command                | Description                                                          |
| ---------------------- | -------------------------------------------------------------------- |
| `npm run lint`         | Run ESLint (9 flat config) — checks all `.ts`, `.tsx`, `.js`, `.jsx` |
| `npm run lint:fix`     | Run ESLint with auto-fix (modifies files in-place)                   |
| `npm run format`       | Format code with Prettier (all file types)                           |
| `npm run format:check` | Check formatting without modifying files (useful in CI)              |
| `npm run typecheck`    | Run TypeScript type checking (`tsc --noEmit`)                        |

### Testing

| Command                 | Description                                                                      |
| ----------------------- | -------------------------------------------------------------------------------- |
| `npm run test`          | Run all tests with Vitest (once, exit after completion)                          |
| `npm run test:watch`    | Run tests in watch mode (re-run on file changes)                                 |
| `npm run test:pipeline` | E2E test: Verify full image processing pipeline (upload → process → derivatives) |

**Pro Tips:**

```bash
# Run single test file
npx vitest run src/infrastructure/auth/__tests__/auth.test.ts

# Run tests matching a pattern
npx vitest run --testNamePattern="encrypt"

# Generate coverage report
npx vitest run --coverage
```

### Database & Migration

| Command                     | Description                                                          |
| --------------------------- | -------------------------------------------------------------------- |
| `npm run db:migrate-dynamo` | Migrate all photos & albums from SQLite → DynamoDB with verification |
| `npm run db:push`           | (SQLite only) Push Drizzle schema changes to database                |
| `npm run db:studio`         | (SQLite only) Open Drizzle Studio GUI for database inspection        |

### Pre-commit & Setup

| Command           | Description                                                       |
| ----------------- | ----------------------------------------------------------------- |
| `npm run prepare` | Setup Husky pre-commit hooks (runs lint + format on staged files) |

## 🔒 Security Features

The admin panel implements **defense-in-depth** with multiple security layers:

### Authentication & Authorization

- **JWT with HS256**: Uses Jose library for secure token signing/verification
- **Token Expiration**: 8 hours (configurable via code)
- **Session Storage**: HttpOnly cookies only (not localStorage — prevents XSS theft)
- **Single Admin User**: Password-only authentication (no username required, reduces attack surface)

### Password Security

- **Bcrypt Hashing**: Industry-standard with automatic salt generation
- **Timing Attack Prevention**: Constant-time comparison prevents attackers from guessing passwords via response time analysis
- **Password Generation Helper**: `npm run hash-password` script for generating secure hashes

### Rate Limiting & Brute Force Protection

- **Redis-Backed**: 5 failed login attempts per 15 minutes = temporary lockout
- **Graceful Degradation**: If Redis is unavailable, rate limiting is skipped (security trade-off for availability)
- **IP Tracking**: Identifies attackers by IP address, respects X-Forwarded-For headers for proxy environments

### Network & Request Security

- **Trusted Proxy Support**: Validates X-Forwarded-For headers to prevent IP spoofing in reverse proxy setups
- **CORS**: Not applicable (single-origin app, no cross-domain requests)
- **Request Validation**: All inputs validated with Zod before processing

### Image Privacy & EXIF Data

- **EXIF Sanitization**: Only 11 safe metadata fields exposed to public API:
  - Camera: make, model
  - Settings: iso, focalLength, fNumber, exposureTime, exposureCompensation
  - Image: width, height, dateTime, orientation
  - **Excluded**: GPS coordinates, camera serial number, software version, lens info
- **Automatic Extraction**: EXIF data extracted during upload, immediately sanitized

### Data Protection

- **Filesystem Isolation**: Storage directory not web-accessible (not served directly)
- **S3 Private Buckets**: If using AWS S3, bucket can be private with CloudFront OAI (Origin Access Identity)
- **Image Derivatives**: Generated files stored with same privacy controls as originals

### Development & Deployment

- **Strict TypeScript**: `strict: true` catches many classes of bugs at compile time
- **Pre-commit Hooks**: ESLint + Prettier enforce code quality before commits
- **Environment Validation**: Zod schema crashes on startup if required env vars are missing or invalid
- **Secrets**: Never commit `.env` file (included in `.gitignore`)

## 🐛 Troubleshooting

### Images stay in "Processing" state

**Symptoms**: Uploaded images show "Processing..." indefinitely, never become viewable.

**Root Causes**:

1. Background worker is not running
2. Redis is unavailable or misconfigured
3. Worker crashed silently (check logs)
4. Image processing failed (EXIF, Sharp, file system)

**Diagnostic Steps**:

```bash
# 1. Check if worker process is running
ps aux | grep "worker"

# 2. Check Redis connectivity
redis-cli ping  # Should return PONG

# 3. Check Redis queue for jobs
redis-cli KEYS "bull:*"

# 4. If using Docker Compose, check worker logs
docker-compose logs -f worker

# 5. Check file system (if using filesystem backend)
ls -la ./storage/  # Should have subdirectories for derivatives
```

**Solutions**:

```bash
# Restart worker only
npm run worker

# Or restart all services with Docker Compose
docker-compose restart worker redis

# Check for disk space (images may fail to save)
df -h
```

---

### Database errors on startup

**Error Messages**:

- `Cannot find module 'better-sqlite3'`
- `DynamoDB endpoint unreachable`
- `ENOENT: no such file or directory, open './data/photo-profile.db'`

**Diagnostic Steps**:

```bash
# 1. Verify database configuration in .env
cat .env | grep -E "DATABASE_|DYNAMODB_"

# 2. Check DynamoDB endpoint availability
curl -v http://localhost:8000/  # Should respond, not timeout

# 3. Check SQLite database file
ls -la ./data/photo-profile.db

# 4. Check Node version (must be 20+)
node --version
```

**Solutions**:

**For DynamoDB:**

```bash
# Start Docker Compose (auto-creates tables)
docker-compose up -d dynamodb-local

# Or verify local endpoint
export DYNAMODB_ENDPOINT=http://localhost:8000
npm run dev

# For AWS, verify credentials
aws sts get-caller-identity
```

**For SQLite:**

```bash
# Create data directory
mkdir -p ./data

# Start app (will auto-initialize database)
npm run dev
```

---

### Rate limiter not working

**Symptom**: Can attempt login more than 5 times within 15 minutes without being blocked.

**Cause**: Redis is unavailable (app degrades gracefully, continues without protection).

**Impact**: Security risk — brute force attacks possible. Rate limiting skipped, but app keeps running.

**Solution**:

```bash
# Ensure Redis is running
docker-compose up -d redis

# Or start Redis manually
redis-server

# Verify Redis is accessible
redis-cli PING  # Should return PONG
```

---

### S3 upload errors

**Error Messages**:

- `AccessDenied: User: arn:aws:iam::... is not authorized to perform: s3:PutObject`
- `The specified bucket does not exist`
- `NoCredentialsError: Missing credentials`

**Diagnostic Steps**:

```bash
# 1. Verify S3 configuration in .env
cat .env | grep -E "AWS_|STORAGE_"

# 2. Test AWS credentials
aws s3 ls s3://your-bucket-name

# 3. Verify bucket exists and region is correct
aws s3api list-buckets

# 4. Check IAM permissions for the access key
aws iam get-user
```

**Solutions**:

```bash
# Update .env with correct values
STORAGE_BACKEND=s3
AWS_REGION=us-east-1
AWS_S3_BUCKET=your-actual-bucket-name
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...

# Verify CloudFront domain (if using CDN)
AWS_CLOUDFRONT_DOMAIN=d12345.cloudfront.net
NEXT_PUBLIC_CLOUDFRONT_DOMAIN=d12345.cloudfront.net

# Test S3 bucket access
aws s3 cp test.txt s3://your-bucket-name/test.txt
aws s3 rm s3://your-bucket-name/test.txt
```

---

### Port already in use

**Error**: `Error: listen EADDRINUSE :::3000` (or other ports)

**Solution**:

```bash
# Find process using port 3000
lsof -i :3000

# Kill the process (macOS/Linux)
kill -9 <PID>

# Or use different port
PORT=3001 npm run dev
```

---

### TypeScript errors not showing in VSCode

**Cause**: TypeScript language server is out of sync or VSCode cache is stale.

**Solution**:

1. Open Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
2. Type "TypeScript: Restart TS Server"
3. Select and wait for restart

Or run manual check:

```bash
npm run typecheck
```

---

### Image not appearing on public gallery

**Possible Causes**:

1. Image is still in "Processing" state (see above)
2. EXIF privacy filter removed restricted fields
3. Storage backend path mismatch
4. CloudFront cache stale (for S3 backend)

**Verify**:

```bash
# 1. Check image storage exists
ls -la ./storage/images/  # If using filesystem

# 2. Check image metadata in database (DynamoDB or SQLite)
# Use admin panel → inspect image details

# 3. Clear CloudFront cache (if using S3 + CloudFront)
# AWS Console → CloudFront → Invalidations → Create
```

---

### Worker keeps crashing

**Symptom**: Worker starts but exits after a few seconds.

**Check Logs**:

```bash
docker-compose logs -f worker

# Or if running locally
npm run worker 2>&1 | head -50  # Show first 50 lines
```

**Common Issues**:

- Redis is down → `Cannot connect to Redis`
- Sharp is not installed → `Cannot find module 'sharp'`
- Database unavailable → `DynamoDB endpoint unreachable`

**Fix**:

```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Verify Redis is running
docker-compose up -d redis

# Restart worker
npm run worker
```

## 🧪 Quality Assurance

This project uses **Husky** and **lint-staged** to ensure code quality. Pre-commit hooks automatically run:

- ESLint (fix mode)
- Prettier (write mode)
