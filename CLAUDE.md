# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A dashboard for the ILO Abandoned Seafarers database. Four components:

- **`backend/`** — Node.js/Express REST API + SQLite (via `better-sqlite3`)
- **`frontend/`** — React 18 + Vite + Tailwind CSS + React Leaflet
- **`scraper/`** — Python + Playwright scraper for the ILO AJAX website
- **`bluesky/`** — daily post of one case to @abandonedseafarers.org (Node 22.13+, no dependencies)

## Commands

### Backend
```bash
cd backend
npm start          # production
npm run dev        # nodemon watch mode (requires nodemon in devDeps)
npm test           # node:test: case pages, Dataset, sitemap
```
Runs on port 3001.

### Frontend
```bash
cd frontend
npm run dev        # Vite dev server (proxies /api/* → localhost:3001)
npm run build      # production build → frontend/dist/
npm test           # node:test (Node 22+): every flag in the committed DB has an icon
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
SQLite at `backend/data/seafarers.db`. The committed file is the live data: Render's free plan has no persistent disk, so `start.sh` copies it to `DATABASE_PATH` (`/data/seafarers.db`) on every deploy and restart. Schema is in `backend/src/db/schema.sql`.

- `ships` — ingest compares each scraped ship with its latest row and inserts it (stamped with the run's `scraped_at`) only when a field differs, so history holds one row per actual change.
- `scrape_runs` — one row per ingest (`scraped_at`, `received`, `inserted`). This, not `ships`, records when scrapes ran. The header's "Updated" time is the later of its newest `scraped_at` and the last app-code commit (`__APP_UPDATED__`, set in `frontend/vite.config.js`).

The `GET /api/ships` query selects only the most recent row per `abandonment_id` using a correlated subquery on `MAX(scraped_at)`. `idx_case_scraped (abandonment_id, scraped_at)` is what keeps that cheap: without it each subquery scans the ship's history, and `/api/ships/facets`, which runs nine of them, took ~7s on the live site and ~150ms with it.

### Scheduler
`.github/workflows/scheduler.yml` runs every half hour and calls `.github/scripts/dispatch-due.sh` once per daily workflow. It starts that workflow once the time in its repository variable has passed, unless a run has been created since:
- `REFRESH_TIME_UTC` (default 05:23) starts the refresh;
- `POST_TIME_UTC` (default 13:41) starts the Bluesky post.

Each variable is `HH:MM` in UTC, or `off`. The script looks back across midnight, so a late tick never skips a day.
- **Why it exists:** `schedule:` can't read `vars`. Don't put a `schedule:` back on refresh-data.yml or post-bluesky.yml, or they will run twice.
- **Dry runs don't count.** A run counts as done unless its run name ends "(dry run)". Both workflows set `run-name` for exactly this, so keep it in step with their dry-run logic.
- **Permissions:** dispatching needs `permissions: actions: write`. `GITHUB_TOKEN` is allowed to start `workflow_dispatch` runs; that is the exception to its "no new runs" rule.
- **Posts need `dry_run=false`.** A dispatched post is a dry run without it.
- **Testing:** test the script locally with a stub `gh` on PATH and `NOW=<epoch seconds>`.

### Scheduled refresh
`.github/workflows/refresh-data.yml` runs a full scrape once a day, started by the scheduler, and on demand via workflow_dispatch. It starts the backend on the runner against the committed DB, scrapes into it, checkpoints the WAL into the main file, and commits `backend/data/seafarers.db` to `master` ("Refresh ILO data (N ships, M new)"); Render redeploys on the push. Runs dispatched from other branches are dry runs that upload the DB as an artifact. The live site's ingest endpoint stays locked by `INGEST_TOKEN` in Render and isn't used by the refresh.

### API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/ships` | Latest snapshot of all ships; supports `?status=`, `?flag=`, `?port=`, `?q=` |
| GET | `/api/ships/filters` | Distinct values for dropdowns |
| GET | `/api/ships/:id` | Single ship (latest) |
| GET | `/api/ships/:id/history` | All historical rows for a ship |
| GET | `/api/ships/status-changes` | Every status change the refreshes have recorded: `{ runs: [scraped_at…], changes: [{ scraped_at, previous_scraped_at, from, to }] }`, from consecutive history rows. Only goes back to the first scrape run; declared before `/:id` |
| GET | `/api/scrapes` | Scrape runs, newest first: `scraped_at`, `record_count` (scraped), `inserted` (new/changed) |
| GET | `/feed.xml` | Atom feed of the 50 newest events: cases the refresh has just seen, and status changes. Built from the stored history (`backend/src/feed.js`), so entries are dated by the refresh that found them; the first run is the site arriving, not news, so its cases aren't announced |
| GET | `/og/case-<id>.png` | The case's share card, 1200x630 (`backend/src/ogCard.js`): drawn as SVG, rasterised with `@resvg/resvg-js`, cached in memory per row. Needs the Lato TTFs in `backend/assets/fonts` — resvg reads TTF/OTF, not woff2 |
| POST | `/api/scrapes/ingest` | Bulk ingest from scraper: `{ scraped_at, ships: [...] }`. Requires `Authorization: Bearer $INGEST_TOKEN` when `INGEST_TOKEN` is set; refused in production when it isn't |

### Pages for search engines
The app only uses `/` and its query string. `backend/src/routes/site.js` serves it from `frontend/dist/index.html`, filled in by `backend/src/seo.js`:
- **`/?ship=<id>`** gets the case's own title, description, canonical URL and Open Graph tags, plus the case as plain HTML in `#root`. That `.case-summary` is for crawlers and readers without JavaScript: `index.css` hides it when scripts run, and the app replaces it. An unknown case answers 404.
- **Keep the `?ship=` form.** The Bluesky poster reads the cases it has posted back from it.
- **A shared case shows its own card**, not the site's map image: `casePage` points `og:image`/`twitter:image` at `/og/case-<id>.png`, with alt text. The Bluesky poster still attaches the static `og-image.png` as its thumbnail.
- **Status colours live in `backend/src/status.js`**, copied from `frontend/src/utils/statusColors.js` because the backend is CommonJS and the site is ESM — the bind `bluesky/src/status.js` is in. `test/status.test.js` reads the site's file and fails on drift.
- **`/`** adds a schema.org `Dataset` (JSON-LD) for Google Dataset Search.
- **`/?view=about`, `?view=report` and `?view=dashboard`** are pages in their own right (`VIEW_PAGES` in `seo.js`), each with its own title, description and canonical URL. Their text stays in their React components for search engines to render, so nothing is written into `#root`. The other views show the same cases as the map, so they keep the home page's tags. A case (`?ship=`) wins over the view, since the app opens its detail on top.
- **`/sitemap.xml`** lists every case, with its latest `scraped_at` as `lastmod`. `frontend/public/robots.txt` points to it. Don't disallow `/api/` there: Google needs it to render the app.
- **Any other path is a 404.** `express.static` runs with `index: false` so `/` reaches the router.
- **Tests:** `test/seo.test.js` reads the real `frontend/index.html`, so renaming or dropping a tag the pages fill in fails it.

### Scraper
The ILO site (`wwwex.ilo.org`) is an AJAX app; Playwright renders each detail page before parsing. IDs 1–1700 are iterated; missing/404 pages are silently skipped. Port geocoding uses `geopy.Nominatim` with the `cleaned_ports_list.csv` overrides (tilde-delimited). Coordinates already in the current snapshot seed the geocoder, so only new ports hit Nominatim. The scraper sends `INGEST_TOKEN` from the environment as a bearer token. If the sanity guard trips or ingest fails, it saves output to `scraper/scraped_YYYY-MM-DD.json` and exits non-zero.

### Frontend
- `App.jsx` owns all state (filters, selected ship, view mode)
- `useShips` hook fetches `/api/ships` whenever filters change
- `useFilters` hook fetches `/api/ships/filters` once on mount
- Map markers are Leaflet `CircleMarker`s — radius scales with `num_seafarers`, color by `ship_status`
- Three view modes: Map, Map + Table (split), Table only
- Flags are `flag-icons` SVGs, looked up from the ILO flag name in `src/utils/flags.js` and drawn by `FlagIcon.jsx` in the table, the ship detail and the dashboard's flag charts. A new or renamed ILO flag needs an entry there; `npm test` lists any the committed DB is missing. The `ships.flag_url` column is unused.
- The Dashboard's two "over time" charts live in `CasesOverTime.jsx`, drawn as plain SVG (no chart library), each with a table view:
  - **New cases per month** comes from the ILO `notification_date`.
  - **Status changes per week** comes from `/api/ships/status-changes`.

  The ILO publishes no resolution or status-change dates, so status changes only exist from the site's own history. Weeks with no refresh are shaded, not shown as zero.

### Bluesky poster
`.github/workflows/post-bluesky.yml` runs `bluesky/post.js` once a day, when the scheduler starts it at `POST_TIME_UTC`, and on demand (off `master` always as a dry run). It picks one case, composes a post, verifies it and publishes it to @abandonedseafarers.org. The account's DID is pinned in `bluesky/src/config.js`. Setup: repo secrets `BLUESKY_HANDLE` and `BLUESKY_APP_PASSWORD`, plus an optional variable `BLUESKY_SKIP_CASES`.

- `src/load.js`: latest row per case from the committed DB, read-only, via Node's built-in `node:sqlite`. Don't go through `backend/src/db/database.js`, which writes on open.
- `src/feed.js`: already-posted case IDs, read back from the account's own records (`?ship=<id>` in the link card or a link facet).
- `src/select.js`: weighted pick (Unresolved and Disputed ×3) among the least-posted cases.
- `src/parse.js`, `src/sentences.js`, `src/eligibility.js`: circumstances and dated updates, sentence splitting, and what may be quoted.
- `src/compose.js`: template, best-fit layout under 300 graphemes, link facets (UTF-8 byte offsets), link card.
- `src/verify.js`: the grounding check, run before every publish.
- `src/bluesky.js`, `src/site.js`: the fetch client, the wait until the site serves the case before linking to it, and `fetchCaseCard`, which takes the link card's thumbnail from the site's own `/og/case-<id>.png`. It returns null on any problem and the post falls back to `THUMB_PATH` (`frontend/public/og-image.png`) rather than failing over a picture.

Rules for changing it:
- **Never commit from the workflow.** A push to master redeploys Render. Posting state lives in the account's posts.
- **Nothing fabricated.** Every character must be one of:
  - a template literal (`TEMPLATE_LITERALS`);
  - a record field;
  - the site's status label;
  - a verbatim quote.

  `verify.js` checks each part and then re-checks the finished text on its own. Don't add wording that asserts an outcome or a timeline ("still waiting", "stranded"), and don't paraphrase.
- Status wording comes from `frontend/src/utils/statusColors.js`. `test/drift.test.js` fails if the two diverge.
- The update-date regex in `src/parse.js` is anchored to line starts on purpose. The site's and scraper's version also matches mid-sentence dates (79 cases).
- A new quoting rule goes in `src/eligibility.js` with a test. Run `npm run check-all -- --sample 20` against the real DB and read the output before and after.
- `createRecord` is never retried blind. After an ambiguous failure, the poster re-lists its posts before trying again.

```bash
cd bluesky
node post.js --dry-run --case 1821     # preview; no login needed
npm run check-all -- --sample 20       # compose + verify every case
npm test                               # node:test, no dependencies
```

## Ship Status Color Coding
- `Inactive` → blue (`#bbc2e2`)
- `resolved` → green (`#7dce82`)
- `""` (active) → red (`#de1a1a`)
- anything else → yellow (`#e8e288`)
