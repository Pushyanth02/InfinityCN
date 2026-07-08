#!/usr/bin/env bash
# Lemniscate worker supervisor — restarts the worker if it exits.
set -u
cd "$(dirname "$0")"
echo "[supervisor] starting Lemniscate worker supervisor"
while true; do
  echo "[supervisor] launching worker at $(date -Iseconds)"
  bun index.ts 2>&1
  code=$?
  echo "[supervisor] worker exited with code $code at $(date -Iseconds); restarting in 2s"
  sleep 2
done
