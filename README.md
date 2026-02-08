# Photo Profile

A modern, high-performance, self-hosted photography portfolio built with **Next.js 16**, following **Clean Architecture** principles.

## 🚀 Key Features

- **Next.js 16 App Router**: Leveraging Server Components for optimal performance.
- **Clean Architecture**: Strict separation of concerns (Domain, Infrastructure, Presentation).
- **High-Performance Image Pipeline**:
  - Background processing with **BullMQ** (Redis).
  - High-quality image derivatives (WebP, AVIF) using **Sharp**.
  - Automatic EXIF data extraction.
  - Smart image loading and progressive rendering.
- **Secure Admin Panel**:
  - JWT-based authentication (Jose).
  - Rate limiting and brute-force protection.
  - Secure password hashing (Bcrypt).
- **Database**: **SQLite** via **Drizzle ORM** for lightweight, file-based persistence.
- **Modern UI**: **Tailwind CSS v4** and **Geist** font family.

## 🛠 Tech Stack

- **Framework**: Next.js 16, React 19
- **Language**: TypeScript
- **Database**: SQLite (via `better-sqlite3`)
- **ORM**: Drizzle ORM
- **Queue**: BullMQ (requires Redis)
- **Image Processing**: Sharp
- **Styling**: Tailwind CSS v4
- **Testing**: Vitest, Playwright

## 📋 Prerequisites

- **Node.js** (v20 or higher recommended)
- **Redis** (Required for background image processing jobs)

## 🏁 Getting Started

### 1. Installation

```bash
npm install
```

### 2. Environment Configuration

Create a `.env` file in the root directory. You can use the following template:

```env
# Required
DATABASE_PATH=./data/photo-profile.db
STORAGE_PATH=./storage
AUTH_SECRET=your-super-secret-key-at-least-32-chars-long
ADMIN_PASSWORD_HASH= # Generated in step 3

# Optional (Defaults)
# REDIS_URL=redis://localhost:6379
# NODE_ENV=development
```

Ensure the `data` and `storage` directories exist or are writable.

### 3. Generate Admin Password

Use the included helper script to generate a secure bcrypt hash for your admin password:

```bash
npx tsx scripts/hash-password.ts "your-secure-password"
```

Copy the output hash into your `.env` file as `ADMIN_PASSWORD_HASH`.

### 4. Database Setup

Push the database schema to your SQLite file:

```bash
npm run db:push
```

## 🏃‍♂️ Running the Application

To run the full application, you need **two processes** running: the web server and the background worker.

### Web Server

Starts the Next.js application at `http://localhost:3000`.

```bash
npm run dev
```

### Worker Process

Processes image uploads (generates thumbnails, extracts EXIF, etc.). **Images will stick in "Processing" state if this is not running.**

```bash
npm run worker
```

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

| Command                       | Description                              |
| ----------------------------- | ---------------------------------------- |
| `npm run dev`                 | Start development server                 |
| `npm run build`               | Build for production                     |
| `npm run start`               | Start production server                  |
| `npm run worker`              | Start background image processing worker |
| `npm run db:push`             | Push schema changes to SQLite database   |
| `npm run db:studio`           | Open Drizzle Studio database GUI         |
| `npm run lint`                | Run ESLint                               |
| `npm run format`              | Format code with Prettier                |
| `npm run test`                | Run unit tests with Vitest               |
| `npm run exif:backfill`       | Backfill EXIF data for existing photos   |
| `npm run dimensions:backfill` | Backfill image dimensions                |

## 🧪 Quality Assurance

This project uses **Husky** and **lint-staged** to ensure code quality. Pre-commit hooks automatically run:

- ESLint (fix mode)
- Prettier (write mode)
