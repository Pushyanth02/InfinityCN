#!/bin/sh
# =============================================================================
# Lemniscate — App container entrypoint
# =============================================================================
# Ensures the SQLite database exists before the server starts. On a fresh
# named volume (first boot) the mounted /app/db directory is empty, so we
# seed it from the schema-initialized database baked into the image at build
# time (/app/db-seed/custom.db). This makes `docker compose up` work on an
# empty volume without shipping the Prisma CLI into the runtime image.
#
# The seed is copied ONLY when the target DB is absent, so existing data in
# the volume is never overwritten. DATABASE_URL uses an absolute path so
# Prisma resolves it unambiguously (see docs/ARCHITECTURE.md §6).
# =============================================================================
set -e

DB_PATH="${LEMNISCATE_DB_PATH:-/app/db/custom.db}"
SEED_PATH="${LEMNISCATE_DB_SEED_PATH:-/app/db-seed/custom.db}"

mkdir -p "$(dirname "$DB_PATH")"

if [ ! -f "$DB_PATH" ]; then
  if [ -f "$SEED_PATH" ]; then
    echo "[entrypoint] no database at $DB_PATH — seeding schema from $SEED_PATH"
    cp "$SEED_PATH" "$DB_PATH"
  else
    echo "[entrypoint] WARNING: no database and no seed found ($SEED_PATH). The app may fail until the schema is created."
  fi
else
  echo "[entrypoint] existing database found at $DB_PATH — leaving as-is"
fi

exec "$@"
