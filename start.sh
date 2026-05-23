#!/bin/bash
set -e

# On first deploy, seed the persistent disk from the bundled database.
# On subsequent deploys the disk file already exists and is left untouched,
# preserving any data written by the scraper since the last deploy.
if [ -n "$DATABASE_PATH" ]; then
  echo "Seeding database to persistent disk..."
  mkdir -p "$(dirname "$DATABASE_PATH")"
  cp backend/data/seafarers.db "$DATABASE_PATH"
  echo "Done."
fi

node backend/src/app.js
