# Abandoned Seafarers Dashboard

Interactive map and table of abandoned seafarer cases from the [ILO database](https://wwwex.ilo.org/dyn/r/abandonment/seafarers/search).

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

## Project Structure

```
backend/   Node.js/Express API + SQLite
frontend/  React + Vite + Tailwind CSS + Leaflet
scraper/   Python + Playwright scraper
```

See `CLAUDE.md` for full architecture details and API reference.

## Contact

James Seal · [Dare Mighty Data Solutions](https://www.daremightydata.com/) · [james@daremightydata.com](mailto:james@daremightydata.com)
