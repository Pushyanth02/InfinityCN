# =============================================================================
# Lemniscate — Multi-stage Dockerfile
# =============================================================================
# Stage 1: Install dependencies
# Stage 2: Build Next.js (standalone output)
# Stage 3: Production runtime
# =============================================================================

# --- Stage 1: Dependencies ---
# Install the FULL dependency set (including devDependencies). `next build`
# requires build-time devDependencies such as typescript, tailwindcss, and
# @tailwindcss/postcss. The final runtime image (stage 3) copies only the
# standalone output + Prisma engine, so these build deps never ship to prod.
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma/

RUN npm ci && npx prisma generate

# --- Stage 2: Build ---
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=file:/app/db/custom.db

RUN npx prisma generate && npm run build:unix

# Bake a schema-initialized SQLite database to seed empty volumes at runtime.
# Uses an absolute path so Prisma resolves it unambiguously (not relative to
# the schema directory). devDependencies (prisma CLI) are present in this stage.
RUN mkdir -p /app/db-seed && \
    DATABASE_URL=file:/app/db-seed/custom.db npx prisma db push --skip-generate

# --- Stage 3: Production runtime ---
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=file:/app/db/custom.db

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/src/lib/pipeline/pdf-extract-worker.mjs ./src/lib/pipeline/pdf-extract-worker.mjs

# Seed DB (schema only) + entrypoint that copies it into an empty volume
COPY --from=builder /app/db-seed ./db-seed
COPY docker-entrypoint.sh ./docker-entrypoint.sh

# Create db directory with correct permissions
RUN mkdir -p ./db && chmod +x ./docker-entrypoint.sh && chown -R nextjs:nodejs ./db ./db-seed ./docker-entrypoint.sh

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "server.js"]
