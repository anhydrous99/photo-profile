# =============================================================================
# Stage 1: deps - Install dependencies with native module build tools
# =============================================================================
FROM node:22-slim AS deps

# Install build tools for native modules (sharp, bcrypt, better-sqlite3)
RUN apt-get update && \
    apt-get install -y python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency manifests
COPY package.json package-lock.json ./

# Install all dependencies (including devDependencies for build stage)
RUN npm ci

# =============================================================================
# Stage 2: builder - Build the Next.js application
# =============================================================================
FROM node:22-slim AS builder

WORKDIR /app

# Copy node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy all source files
COPY . .

# Disable Next.js telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1

# Provide dummy env vars for build-time Zod validation (env.ts validates at import)
ENV DATABASE_PATH=/tmp/build.db
ENV STORAGE_PATH=/tmp/storage
ENV AUTH_SECRET=build-time-secret-minimum-thirty-two-chars
ENV ADMIN_PASSWORD_HASH=build-time-hash

# Build the Next.js application (produces standalone output)
RUN npm run build

# =============================================================================
# Stage 3: runner - Production runtime
# =============================================================================
FROM node:22-slim AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Install curl for healthcheck
RUN apt-get update && \
    apt-get install -y curl && \
    rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy public assets from builder
COPY --from=builder /app/public ./public

# Copy standalone Next.js output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Copy node_modules for worker process (tsx needs full modules)
COPY --from=deps /app/node_modules ./node_modules

# Copy source files for worker tsx execution
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/package.json ./package.json

# Create mount points for persistent data
RUN mkdir -p /app/data /app/storage && \
    chown -R nextjs:nodejs /app

# Switch to non-root user
USER nextjs

# Expose Next.js port
EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=40s \
    CMD curl -f http://localhost:3000/ || exit 1

# Default command: run the Next.js standalone server
CMD ["node", "server.js"]
