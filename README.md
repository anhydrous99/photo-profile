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
  - **DynamoDB** for production-grade data storage with local development support.
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

- **Framework**: Next.js 16, React 19
- **Language**: TypeScript
- **Database**: DynamoDB
- **Queue**: BullMQ (requires Redis)
- **Image Processing**: Sharp
- **Storage**: Local Filesystem or AWS S3
- **Styling**: Tailwind CSS v4
- **Testing**: Vitest, Playwright
- **Authentication**: JWT (Jose HS256), Bcrypt, Rate Limiting

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

Create a `.env` file in the root directory. You can use the following template:

```env
# Required Core
AUTH_SECRET=your-super-secret-key-at-least-32-chars-long
ADMIN_PASSWORD_HASH= # Generated in step 3

# Database: DynamoDB
# DYNAMODB_ENDPOINT=http://localhost:8000  # Local development only
# DYNAMODB_TABLE_PREFIX=dev_                # Optional prefix for local testing

# Storage Configuration (Choose one)
# Option A: Local Filesystem (Default)
STORAGE_BACKEND=filesystem
STORAGE_PATH=./storage

# Option B: AWS S3 + CloudFront
# STORAGE_BACKEND=s3
# AWS_REGION=us-east-1
# AWS_S3_BUCKET=your-bucket-name
# AWS_CLOUDFRONT_DOMAIN=d12345.cloudfront.net
# AWS_ACCESS_KEY_ID=your-access-key
# AWS_SECRET_ACCESS_KEY=your-secret-key
# NEXT_PUBLIC_CLOUDFRONT_DOMAIN=d12345.cloudfront.net

# Optional (Defaults)
# REDIS_URL=redis://localhost:6379
# NODE_ENV=development
# LOG_LEVEL=info
```

Ensure the `storage` directory (if using filesystem) exists or is writable.

### 3. Generate Admin Password

Use the included helper script to generate a secure bcrypt hash for your admin password:

```bash
npx tsx scripts/hash-password.ts "your-secure-password"
```

Copy the output hash into your `.env` file as `ADMIN_PASSWORD_HASH`.

### 4. Database Setup

**DynamoDB**

Tables are created automatically on first run. For local development with Docker Compose, tables are provisioned during startup. If developing without Docker, you can set `DYNAMODB_ENDPOINT=http://localhost:8000` to use a local DynamoDB instance.

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

This project follows Clean Architecture:

```
src/
├── domain/              # Pure business entities & repository interfaces (No dependencies)
├── application/         # Application use cases (Logic lives in infra/API in this project)
├── infrastructure/      # Database, Auth, Image Processing, File System implementations
├── presentation/        # React Components (UI)
└── app/                 # Next.js App Router (Pages & API Routes)
```

## 📜 Scripts

| Command                 | Description                                      |
| ----------------------- | ------------------------------------------------ |
| **Development**         |                                                  |
| `npm run dev`           | Start Next.js dev server (http://localhost:3000) |
| `npm run worker`        | Start BullMQ background image processing worker  |
| **Build & Production**  |                                                  |
| `npm run build`         | Build for production (standalone output)         |
| `npm run start`         | Start production server                          |
| `npm run analyze`       | Analyze webpack bundle size                      |
| **Code Quality**        |                                                  |
| `npm run lint`          | Run ESLint                                       |
| `npm run lint:fix`      | Run ESLint with auto-fix                         |
| `npm run format`        | Format code with Prettier                        |
| `npm run format:check`  | Check formatting without modifying files         |
| `npm run typecheck`     | Run TypeScript type checking                     |
| **Testing**             |                                                  |
| `npm run test`          | Run all tests with Vitest                        |
| `npm run test:watch`    | Run tests in watch mode                          |
| `npm run test:pipeline` | E2E test: verify image processing pipeline       |
| **Utilities**           |                                                  |
| `npm run prepare`       | Setup Husky pre-commit hooks                     |

## 🔒 Security Features

The admin panel includes multiple layers of security:

- **JWT Authentication**: Tokens expire after 8 hours (configurable)
- **Password Hashing**: Bcrypt with security best practices
- **Timing Attack Prevention**: Constant-time password comparison + random jitter
- **Rate Limiting**: Redis-backed rate limiter (5 attempts per 15 minutes) with graceful degradation
- **IP Validation**: Trusted proxy support to prevent IP spoofing attacks
- **EXIF Privacy**: Only 11 safe metadata fields exposed (no GPS, camera serial, software info)
- **HttpOnly Cookies**: Session tokens stored in secure, HTTP-only cookies

## 🐛 Troubleshooting

### Images stay in "Processing" state

**Cause**: Background worker is not running or Redis is unavailable.

**Solution**:

```bash
# Check if worker is running
ps aux | grep "src/infrastructure/jobs/worker.ts"

# If using Docker Compose, restart worker
docker-compose restart worker

# If Redis is down, the app degrades gracefully but job processing fails
# Restart Redis
docker-compose restart redis
```

### Database errors on startup

**Cause**: DynamoDB tables don't exist or endpoint is unreachable.

**Solution**:

```bash
# If using Docker Compose, tables are auto-created during startup
docker-compose up -d

# If using local development without Docker:
# Ensure DYNAMODB_ENDPOINT is not set (uses real AWS account)
# Or provide local DynamoDB endpoint
export DYNAMODB_ENDPOINT=http://localhost:8000
npm run dev
```

### Rate limiter not working

**Cause**: Redis is unavailable (app degrades gracefully).

**Impact**: Rate limiting is skipped, but app continues functioning.

**Solution**:

```bash
# Ensure Redis is running
docker-compose up -d redis

# Or start Redis manually
redis-server
```

### S3 upload errors

**Cause**: AWS credentials are missing or invalid.

**Solution**:

1. Verify `AWS_S3_BUCKET`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
2. Test credentials:
   ```bash
   aws s3 ls s3://your-bucket-name
   ```
3. Ensure CloudFront domain is set if using CDN:
   ```env
   AWS_CLOUDFRONT_DOMAIN=d12345.cloudfront.net
   NEXT_PUBLIC_CLOUDFRONT_DOMAIN=d12345.cloudfront.net
   ```

## 🧪 Quality Assurance

This project uses **Husky** and **lint-staged** to ensure code quality. Pre-commit hooks automatically run:

- ESLint (fix mode)
- Prettier (write mode)
