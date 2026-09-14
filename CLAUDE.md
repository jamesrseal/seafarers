# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A dashboard for the ILO Abandoned Seafarers database. Three components:

- **`backend/`** — Node.js/Express REST API + SQLite (via `better-sqlite3`)
- **`frontend/`** — React 18 + Vite + Tailwind CSS + React Leaflet
- **`scraper/`** — Python + Playwright scraper for the ILO AJAX website

## Commands

### Backend
```bash
cd backend
npm start          # production
npm run dev        # nodemon watch mode (requires nodemon in devDeps)
```
Runs on port 3001.

### Frontend
```bash
cd frontend
npm run dev        # Vite dev server (proxies /api/* → localhost:3001)
npm run build      # production build → frontend/dist/
```
Runs on port 5173.

### Scraper
```bash
cd scraper
npm install
npx playwright install chromium

# Full scrape (range scan + auto-extend beyond END until 30 consecutive empty pages)
node scrape.js --start 1 --end 1705 --api http://localhost:3001 --concurrency 4

# Re-scrape all Unresolved + Disputed records to pick up status changes
node scrape.js --rescan-open --api http://localhost:3001 --concurrency 4
```

## Architecture

### Database
SQLite at `backend/data/seafarers.db` locally; in production it lives on the Render disk (`DATABASE_PATH=/data/seafarers.db`). Schema is in `backend/src/db/schema.sql`.

- `ships` — ingest compares each scraped ship with its latest row and inserts it (stamped with the run's `scraped_at`) only when a field differs, so history holds one row per actual change.
- `scrape_runs` — one row per ingest (`scraped_at`, `received`, `inserted`). This, not `ships`, records when scrapes ran; the header's "Data updated" date comes from it.

The `GET /api/ships` query selects only the most recent row per `abandonment_id` using a correlated subquery on `MAX(scraped_at)`.

`start.sh` copies the committed DB onto the Render disk only when the disk has none (or `RESEED_DB=true`), so deploys don't wipe scraped data.

### Scheduled refresh
`.github/workflows/refresh-data.yml` runs a full scrape daily (and on demand via workflow_dispatch) directly against the live API. It authenticates with the `INGEST_TOKEN` repository secret, which must match `INGEST_TOKEN` in Render.

### API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/ships` | Latest snapshot of all ships; supports `?status=`, `?flag=`, `?port=`, `?q=` |
| GET | `/api/ships/filters` | Distinct values for dropdowns |
| GET | `/api/ships/:id` | Single ship (latest) |
| GET | `/api/ships/:id/history` | All historical rows for a ship |
| GET | `/api/scrapes` | Scrape runs, newest first: `scraped_at`, `record_count` (scraped), `inserted` (new/changed) |
| POST | `/api/scrapes/ingest` | Bulk ingest from scraper: `{ scraped_at, ships: [...] }`. Requires `Authorization: Bearer $INGEST_TOKEN` when `INGEST_TOKEN` is set; refused in production when it isn't |

### Scraper
The ILO site (`wwwex.ilo.org`) is an AJAX app; Playwright renders each detail page before parsing. IDs 1–1700 are iterated; missing/404 pages are silently skipped. Port geocoding uses `geopy.Nominatim` with the `cleaned_ports_list.csv` overrides (tilde-delimited). Flag image URLs come from `flag_urls.csv`. Coordinates already in the current snapshot seed the geocoder, so only new ports hit Nominatim. The scraper sends `INGEST_TOKEN` from the environment as a bearer token. If the sanity guard trips or ingest fails, it saves output to `scraper/scraped_YYYY-MM-DD.json` and exits non-zero.

### Frontend
- `App.jsx` owns all state (filters, selected ship, view mode)
- `useShips` hook fetches `/api/ships` whenever filters change
- `useFilters` hook fetches `/api/ships/filters` once on mount
- Map markers are Leaflet `CircleMarker`s — radius scales with `num_seafarers`, color by `ship_status`
- Three view modes: Map, Map + Table (split), Table only

## Ship Status Color Coding
- `Inactive` → blue (`#bbc2e2`)
- `resolved` → green (`#7dce82`)
- `""` (active) → red (`#de1a1a`)
- anything else → yellow (`#e8e288`)
