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

`.github/workflows/refresh-data.yml` runs every day at 05:23 UTC on GitHub Actions. It starts the backend on the runner with the committed `backend/data/seafarers.db`, runs the scraper against it, and commits the updated database to `master` as "Refresh ILO data (N ships, M new)". Render redeploys on that push, so the site is briefly unavailable while it restarts with the new data.

Render's free plan has no persistent disk, so the committed database is the live data: `start.sh` copies it into place on every deploy and restart. Ingest only stores ships whose data changed since their latest row, so each day's commit is small.

Run it on demand from **Actions → Refresh ILO data → Run workflow** (full scan or `rescan-open`, optionally forcing past the sanity guard). A failed run — including a tripped sanity guard — commits nothing, shows as failed in Actions (GitHub emails you), and attaches the backend log and raw scrape to the run. Runs dispatched from a branch other than `master` are dry runs: they upload the refreshed database as an artifact instead of pushing.

The live site's `POST /api/scrapes/ingest` requires the `INGEST_TOKEN` set in Render and refuses writes without it; the daily refresh doesn't use it.

## Project Structure

```
backend/   Node.js/Express API + SQLite
frontend/  React + Vite + Tailwind CSS + Leaflet
scraper/   Python + Playwright scraper
```

See `CLAUDE.md` for full architecture details and API reference.

## Contact

James Seal · [Dare Mighty Data Solutions](https://www.daremightydata.com/) · [james@daremightydata.com](mailto:james@daremightydata.com)
