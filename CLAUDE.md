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
node scrape.js --start 1 --end 1705 --api http://localhost:3001 --concurrency 5

# Re-scrape all Unresolved + Disputed records to pick up status changes
node scrape.js --rescan-open --api http://localhost:3001 --concurrency 5
```

## Architecture

### Database
Single SQLite table `ships` at `backend/data/seafarers.db`. Schema is in `backend/src/db/schema.sql`. Each scrape run inserts rows with the same `scraped_at` timestamp, so every scrape is preserved for historical comparison.

The `GET /api/ships` query selects only the most recent row per `abandonment_id` using a correlated subquery on `MAX(scraped_at)`.

### API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/ships` | Latest snapshot of all ships; supports `?status=`, `?flag=`, `?port=`, `?q=` |
| GET | `/api/ships/filters` | Distinct values for dropdowns |
| GET | `/api/ships/:id` | Single ship (latest) |
| GET | `/api/ships/:id/history` | All historical rows for a ship |
| GET | `/api/scrapes` | List of scrape runs with record counts |
| POST | `/api/scrapes/ingest` | Bulk insert from scraper: `{ scraped_at, ships: [...] }` |

### Scraper
The ILO site (`wwwex.ilo.org`) is an AJAX app; Playwright renders each detail page before parsing. IDs 1–1700 are iterated; missing/404 pages are silently skipped. Port geocoding uses `geopy.Nominatim` with the `cleaned_ports_list.csv` overrides (tilde-delimited). Flag image URLs come from `flag_urls.csv`. If the backend is unreachable, the scraper saves output to `scraper/scraped_YYYY-MM-DD.json`.

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
