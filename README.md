# Abandoned Seafarers Dashboard

[Interactive map](https://abandonedseafarers.org/) and table of abandoned seafarer cases from the [ILO database](https://wwwex.ilo.org/dyn/r/abandonment/seafarers/search).

This project started after reading about the [Ever Given crew](https://jalopnik.com/crew-of-ever-given-really-dont-want-to-spend-years-stuc-1846730643) and wanting a better way to visualize the ILO's abandonment case data. The original Python/Dash version has been rebuilt as a React + Node.js app with a SQLite database that stores scrape history so changes can be tracked over time.

## Setup

### 1. Backend

```bash
cd backend
npm install
npm start          # http://localhost:3001
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

The frontend proxies all `/api/*` requests to the backend at port 3001.

### 3. Scraper (populate the database)

```bash
cd scraper
pip install -r requirements.txt
playwright install chromium
python scrape.py --start 1 --end 1700 --api http://localhost:3001
```

The scraper iterates ILO abandonment IDs 1–1700, renders each AJAX detail page with a headless browser, geocodes ports via OpenStreetMap Nominatim, and posts the batch to the backend. A full run takes roughly 45–60 minutes. Each run is stored with a timestamp so changes can be tracked over time.

To scrape a small test batch first:
```bash
python scrape.py --start 1690 --end 1700 --api http://localhost:3001
```

## Production

```bash
cd frontend && npm run build
cd ../backend && npm start   # serves React build as static files on port 3001
```

## Automatic daily refresh

`.github/workflows/refresh-data.yml` runs the scraper every day at 05:23 UTC on GitHub Actions and posts the results straight to the live site's ingest API — no commit or redeploy needed. The database on the Render disk is the live source of truth; the committed `backend/data/seafarers.db` only seeds a brand-new disk.

One-time setup:

1. Generate a random token, e.g. `openssl rand -hex 32`.
2. In Render → the `seafarers` service → **Environment**, add `INGEST_TOKEN` with that value.
3. In GitHub → **Settings → Secrets and variables → Actions**, add a repository secret named `INGEST_TOKEN` with the same value.

Run it on demand from **Actions → Refresh ILO data → Run workflow** (full scan or `rescan-open`, optionally forcing past the sanity guard). A failed run — including a tripped sanity guard — shows as failed in Actions, GitHub emails you, and the raw scrape is attached to the run as an artifact.

Ingest only stores ships whose data changed since their latest row, so the database grows with real changes rather than a full copy of every scrape.

To replace the live database with the committed `seafarers.db` (this discards everything scraped since that file was committed), set `RESEED_DB=true` in Render, deploy, then remove it.

## Project Structure

```
backend/   Node.js/Express API + SQLite
frontend/  React + Vite + Tailwind CSS + Leaflet
scraper/   Python + Playwright scraper
```

See `CLAUDE.md` for full architecture details and API reference.

## Contact

James Seal · [Dare Mighty Data Solutions](https://www.daremightydata.com/) · [james@daremightydata.com](mailto:james@daremightydata.com)
