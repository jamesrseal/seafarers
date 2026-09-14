#!/bin/bash
set -e

# The committed backend/data/seafarers.db is the live data: the daily GitHub
# Actions refresh commits it and the push redeploys. Render's free plan has no
# persistent disk, so copy it into place on every start.
if [ -n "$DATABASE_PATH" ]; then
  echo "Copying database to $DATABASE_PATH..."
  mkdir -p "$(dirname "$DATABASE_PATH")"
  # A leftover WAL from a previous copy would corrupt the new one.
  rm -f "$DATABASE_PATH-wal" "$DATABASE_PATH-shm"
  cp backend/data/seafarers.db "$DATABASE_PATH"
  echo "Done."
fi

node backend/src/app.js
