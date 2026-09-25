# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A dashboard for the ILO Abandoned Seafarers database. Four components:

- **`backend/`** — Node.js/Express REST API + SQLite (via `better-sqlite3`)
- **`frontend/`** — React 18 + Vite + Tailwind CSS + React Leaflet
- **`scraper/`** — Node.js + Playwright scraper for the ILO AJAX website
- **`bluesky/`** — daily post of one case to @abandonedseafarers.org (Node 22.13+, no dependencies)

## Commands

### Backend
```bash
cd backend
npm start          # production
npm run dev        # nodemon watch mode (requires nodemon in devDeps)
npm test           # node:test: case pages, Dataset, sitemap, cards, basemaps

node scripts/bake-basemaps.js   # redraw assets/basemaps by hand; the daily refresh does this itself
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

npm test           # node:test: iloFields.js, no install needed
```

## Architecture

### Database
SQLite at `backend/data/seafarers.db`. The committed file is the live data: Render's free plan has no persistent disk, so `start.sh` copies it to `DATABASE_PATH` (`/data/seafarers.db`) on every deploy and restart. Schema is in `backend/src/db/schema.sql`.

- `ships` — ingest (`backend/src/ingest.js`) compares each scraped ship with its latest row and inserts it (stamped with the run's `scraped_at`) only when a field differs, so history holds one row per actual change. Two things are written in place on the latest row instead, since neither is a change to the case:
  - **a column added after that row was written.** `backend/src/db/migrate.js` adds `ADDED_COLUMNS` to an existing database (schema.sql declares them for a fresh one; `test/migrate.test.js` fails if the two drift). On older rows they're NULL, meaning *not captured*, not blank. The first scrape to see a NULL fills it in place and reports `filled`; it doesn't count as a change. Without this, adding a field writes a history row for every case.
  - **a derived column** (`DERIVED_COLUMNS`: `payment_latest`, `repatriation_latest`) that no longer matches. They aren't part of the change check, so a new way of deriving them is never history.
  A record without one of the added columns (an older saved `scraped_*.json`) keeps the stored value rather than blanking it.
- `scrape_runs` — one row per ingest (`scraped_at`, `received`, `inserted`). This, not `ships`, records when scrapes ran. The header's "Updated" time is the later of its newest `scraped_at` and the last app-code commit (`__APP_UPDATED__`, set in `frontend/vite.config.js`).

`GET /api/ships` and `/api/ships/facets` select only the most recent row per `abandonment_id` by joining on `MAX(scraped_at)` grouped by case (`LATEST` in `backend/src/shipFilters.js`, which holds the filters and facets). `idx_case_scraped (abandonment_id, scraped_at)` serves that grouping. It was a correlated subquery per row until the facets doubled to eight: a grouped count took ~34ms that way and ~5ms joined, and `/facets`, which runs 16 of them, went from ~190ms with four facets to ~80ms with eight. (Before the index, the correlated form took ~7s on the live site.)

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

### Tests in CI
`.github/workflows/test.yml` runs the backend, frontend and scraper suites on every push to `master` and every pull request. Nothing ran them automatically before, so each guard was only as good as someone remembering: the status colours copied into `backend/src/status.js` and `bluesky/src/status.js`, the flag icons the table needs, the tags the SEO pages fill in, the committed social card's pixels, whether every port has a basemap, and how the scraper reads the ILO's fields. The Bluesky suite isn't among them: run it by hand. It doesn't gate the daily refresh, which commits straight to `master` — it reports right after.

### Scheduled refresh
`.github/workflows/refresh-data.yml` runs a full scrape once a day, started by the scheduler, and on demand via workflow_dispatch. It starts the backend on the runner against the committed DB, scrapes into it, checkpoints the WAL into the main file, draws a basemap for any port the scrape has just introduced, and commits `backend/data/seafarers.db` plus those panels to `master` ("Refresh ILO data (N ships, M new)", with "+ P basemap(s)" when it drew any); Render redeploys on the push. It installs the backend's dev dependencies, because the baker needs `jpeg-js`. Runs dispatched from other branches are dry runs that upload the DB as an artifact. The live site's ingest endpoint stays locked by `INGEST_TOKEN` in Render and isn't used by the refresh.

### API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/ships` | Latest snapshot of all ships; supports `?status=`, `?flag=`, `?port=`, `?country=`, `?nationality=` (any of the crew), `?vessel=` (every ILO spelling of the type), `?payment=`, `?repatriation=` (the `*_latest` status) and `?q=` (ship name, circumstances, port, vessel type, insurer). Each row carries `is_new` (see below) |
| GET | `/api/ships/facets` | Counts per value for each filter, each one counted with the *other* filters applied |
| GET | `/api/ships/:id` | Single ship (latest) |
| GET | `/api/ships/:id/history` | All historical rows for a ship |
| GET | `/api/ships/status-changes` | Every status change the refreshes have recorded: `{ runs: [scraped_at…], changes: [{ scraped_at, previous_scraped_at, from, to }] }`, from consecutive history rows. Only goes back to the first scrape run; declared before `/:id` |
| GET | `/api/scrapes` | Scrape runs, newest first: `scraped_at`, `record_count` (scraped), `inserted` (new/changed) |
| GET | `/feed.xml` | Atom feed of the 50 newest events: cases the refresh has just seen, and status changes. Built from the stored history (`backend/src/feed.js`), so entries are dated by the refresh that found them; the first run is the site arriving, not news, so its cases aren't announced |
| GET | `/og/case-<id>.png` | The case's share card, 1200x630 (`backend/src/ogCard.js`): the case beside the piece of map it happened on, drawn as SVG, rasterised with `@resvg/resvg-js`, cached in memory per row. Needs the Lato TTFs in `backend/assets/fonts` — resvg reads TTF/OTF, not woff2 |
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

### New cases
`is_new` on `/api/ships` and `/api/ships/:id` marks the cases the site has just seen, drawn as a badge by `frontend/src/components/NewBadge.jsx` in the table, the ship detail header and the map tooltip. The rule is `backend/src/newCases.js`.

- **New means arrived, not updated.** A case's rows are only written when a field changed, so its first row is its arrival and `MIN(scraped_at)` can't move. **Don't use `scrape_runs.inserted`** — it counts new and changed rows together: the refresh of 18 September wrote nine rows of which four were arrivals, and the one before it wrote nine of which none were.
- **It marks a cohort, not the last refresh.** Refreshes that bring nothing new are the norm, so the badge stays on the most recent arrivals until newer ones land.
- **It expires after 14 days** (`NEW_WINDOW_DAYS`). Arrivals are irregular — one gap ran 66 days — and "New" on a two-month-old case is a lie.
- **The cohort is computed over the whole table, never the filtered result.** The newest arrival *within a filter* can be years old, and would wear the badge on a page of its own.
- **The first run is excluded**, as `feed.js` excludes it: that run is the database arriving, not news. Keep the two rules in step.
- **Not in `/facets`**, which runs 16 counts and would pay for the extra subquery in each, and not in the CSV export — it describes the site's scrape history, not the case.

### Case card basemaps
`/og/case-<id>.png` draws the case beside the map it happened on. The map is a **committed JPEG**, one per port, in `backend/assets/basemaps/<lat>_<lon>.jpg` — about 30MB for 680 panels covering all 707 port coordinates.

- **Nothing is fetched when a card is drawn.** Render's free plan has no persistent disk and the card cache is in memory, so live tiles would mean ~9 calls to OpenStreetMap on every cold request — the automated use their tile policy asks clients not to make. Baked, a card takes ~0.1s and can't be slower than the site.
- **`backend/src/basemap.js` is shared by the baker and the card**, so the picture and the dots drawn on it can't drift: same centre, size, zoom and projection. Change anything there and the committed panels are stale — re-bake.
- **The daily refresh draws them.** `refresh-data.yml` runs the baker after it scrapes and commits any new panels with the data that needs them, so a new port never ships uncovered. `node scripts/bake-basemaps.js` does the same by hand (`--force` redraws all). Each distinct tile is fetched once, two at a time, and kept in the untracked `backend/.tile-cache`, so redrawing at a different size or quality costs no requests. Delete that directory to pull fresh tiles.
- **JPEG, not WebP.** resvg reads PNG and JPEG and silently draws *nothing* for a WebP — the map would empty without failing. `test/basemap.test.js` checks the pixels, not the markup.
- **A port with no panel loses the map, not the card**: the text runs full width instead. That covers the cases with no coordinates, and is the safety net if the refresh's bake ever fails — `test/basemap.test.js` fails while any port is missing one, and CI runs it.
- **The markers are the site's**, via `markerRadius` and the status fills copied into `backend/src/status.js`; `test/status.test.js` runs the site's own function against the copy and fails on drift.
- **The basemap is credited on every card that carries one** ("© OpenStreetMap contributors"), and in `backend/assets/CREDITS.md`.

### Scraper
The ILO site (`wwwex.ilo.org`) is an AJAX app; Playwright renders each detail page before parsing. The daily refresh scans every known case ID, then carries on until 30 consecutive empty pages; missing/404 pages are silently skipped. Port geocoding (`geocode.js`) uses Nominatim with the `cleaned_ports_list.csv` overrides (tilde-delimited). Coordinates already in the current snapshot seed the geocoder, so only new ports hit Nominatim. The scraper sends `INGEST_TOKEN` from the environment as a bearer token. If the sanity guard trips or ingest fails, it saves output to `scraper/scraped_YYYY-MM-DD.json` and exits non-zero.

Six fields arrive as markup or packed text and are shaped by `scraper/iloFields.js`, which is pure and tested in CI (`npm test --prefix scraper`):
- `nationalities`: JSON `[{country, count}]` from "Azerbaijan (11); Türkiye (1)". Only a trailing `(n)` is a count, and `count` is null where the ILO gives none.
- `payment_status`, `repatriation_status`, `actions_taken`: JSON `[{date, dateText, status, detail}]`, **newest first**. `date` is a partial ISO date (`2025-10-08`, `2004-10`, `2004`). The ILO lists entries in either order, and its markup is often malformed.
- `payment_latest`, `repatriation_latest`: the newest entry's status, in the ILO's own spelling (`PAYMENT_STATUSES`, `REPATRIATION_STATUSES`).
- `vessel_type`, `financial_security_provider`: text.

`extractApexFields` runs in the page, so it returns raw values and `scrapeOne` shapes them in Node. **The ILO's page leaves an empty field out entirely** (no input, no container), so a missing element is stored as blank. A field the ILO renames would therefore read as blank on every case; the sanity guard's fill-rate check (`MONITORED_FIELDS`) is what stops that run before ingest. **The stored text is `iloFields.js`'s output, so changing that output rewrites every case's history on the next refresh.** Only the derived `*_latest` columns are exempt.

### Frontend
- `App.jsx` owns all state (filters, selected ship, view mode)
- `useShips` hook fetches `/api/ships` whenever filters change
- `useFacets` hook fetches `/api/ships/facets` whenever filters change
- The filters are `FILTER_KEYS` in `src/utils/urlState.js`: each is a URL parameter, an `/api/ships` parameter and a facet of the same name, and both hooks build their query from that list.
- `FilterBar.jsx` keeps one row of filters (search, status, flag, country, port). Crew nationality, vessel type, payment and repatriation sit behind **More filters**, a quiet line under it: the row is full, and a button in it pushes Export and Reset onto a line of their own. The second row opens by itself when a link sets one of its filters, and stays hidden, toggle and all, until a refresh has captured the ILO fields. The insurer has no dropdown — the ILO names one insurer several ways ("Hydor", "Hydor AS") — so the search covers it instead.
- Map markers are Leaflet `CircleMarker`s — radius scales with `num_seafarers`, color by `ship_status`
- Three view modes: Map, Map + Table (split), Table only
- Flags are `flag-icons` SVGs, looked up from the ILO country name in `src/utils/flags.js` and drawn by `FlagIcon.jsx` in the table, the ship detail and the dashboard's flag and nationality charts. A new or renamed ILO flag or nationality needs an entry there; `npm test` lists any the committed DB is missing. Yugoslavia, which flag-icons has no flag for, is drawn without one. The `ships.flag_url` column is unused.
- The table and the CSV export have a column for each ILO field: vessel type, nationalities, payment and repatriation (`*_latest`), latest action (the newest heading in `actions_taken`) and insurer. Each shows the ILO's text as stored; `src/utils/iloFields.js` reads the JSON ones. The dated histories aren't exported, like the other long text.
- The Dashboard charts nationalities and vessel types from the ILO fields. Both the table and the dashboard leave the ILO fields out until a refresh has captured them (NULL on every case before that); the CSV keeps its columns and leaves them blank.
  - **Seafarers by nationality sums the ILO's head counts.** Older cases sometimes name a nationality without one ("Georgia; Greece; Philippines"), so it counts fewer seafarers than `num_seafarers`; the chart's note says how many cases are missing.
  - **Vessel types the ILO spells two ways are merged** for the dashboard and the vessel type filter by `VESSEL_TYPE_ALIASES` in `src/utils/vesselTypes.js`: 161 cases say "General Cargo" and 278 "General Cargo Ship", over the same years. The stored text isn't touched. `backend/src/vesselTypes.js` copies the map for the filter, and `test/vesselTypes.test.js` fails if the two drift.
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
`frontend/src/utils/statusColors.js` is the source of truth. `backend/src/status.js` and `bluesky/src/status.js` copy it because they're CommonJS and it's ESM; both are tested against it and fail on drift.

| Stored value | Label | Fill |
|--------------|-------|------|
| `""` | Unresolved | yellow `#e8e288` |
| `disputed` | Disputed | red `#de1a1a` |
| `inactive` | Inactive | grey `#9ca3af` |
| `resolved` | Resolved | green `#7dce82` |

An unrecognised status falls back to `""`, so it reads as Unresolved. The map also varies a marker's opacity and stroke by how recently the case saw activity (`markerRecency`), which is a separate axis from the fill — the cards don't use it.
