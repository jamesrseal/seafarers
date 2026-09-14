#!/bin/bash
set -e

# Seed the persistent disk from the bundled database only when the disk has no
# database yet (first deploy). After that the disk copy is the source of truth —
# the daily GitHub Actions scrape writes straight to it — so redeploys must not
# overwrite it. Set RESEED_DB=true for one deploy to force a reseed from the
# committed file (discards anything scraped since that file was committed).
if [ -n "$DATABASE_PATH" ]; then
  mkdir -p "$(dirname "$DATABASE_PATH")"
  if [ ! -f "$DATABASE_PATH" ] || [ "$RESEED_DB" = "true" ]; then
    echo "Seeding database to persistent disk..."
    # A leftover WAL from the old database would corrupt the new copy.
    rm -f "$DATABASE_PATH-wal" "$DATABASE_PATH-shm"
    cp backend/data/seafarers.db "$DATABASE_PATH"
    echo "Done."
  else
    echo "Using existing database at $DATABASE_PATH"
  fi
fi

node backend/src/app.js
