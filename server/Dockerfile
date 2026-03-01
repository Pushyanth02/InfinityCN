# Multi-stage Dockerfile for InfinityCN API server and worker
#
# Targets:
#   api    — Express API server (default)
#   worker — RabbitMQ consumer

# ── Base stage ───────────────────────────────────────────────
FROM node:22-alpine AS base

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY tsconfig.json ./
COPY src/ ./src/

# Compile TypeScript
RUN npx tsc

# ── API target ───────────────────────────────────────────────
FROM node:22-alpine AS api

WORKDIR /app

COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/dist ./dist
COPY --from=base /app/package.json ./

EXPOSE 3001

CMD ["node", "dist/index.js"]

# ── Worker target ────────────────────────────────────────────
FROM node:22-alpine AS worker

WORKDIR /app

COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/dist ./dist
COPY --from=base /app/package.json ./

CMD ["node", "dist/worker.js"]
