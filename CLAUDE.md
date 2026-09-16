# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A dashboard for the ILO Abandoned Seafarers database. Five components:

- **`backend/`** — Node.js/Express REST API + SQLite (via `better-sqlite3`)
- **`frontend/`** — React 18 + Vite + Tailwind CSS + React Leaflet
- **`scraper/`** — Python + Playwright scraper for the ILO AJAX website
- **`bluesky/`** — daily post of one case to @abandonedseafarers.bsky.social (Node 22.13+, no dependencies)
- **`instagram/`** — the same case drawn as a card and posted to @abandonedseafarers (Node 22.13+, no dependencies)

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

The `GET /api/ships` query selects only the most recent row per `abandonment_id` using a correlated subquery on `MAX(scraped_at)`.

### Scheduler
`.github/workflows/scheduler.yml` runs every half hour and calls `.github/scripts/dispatch-due.sh` once per daily workflow. It starts that workflow once the time in its repository variable has passed, unless a run has been created since:
- `REFRESH_TIME_UTC` (default 05:23) starts the refresh;
- `POST_TIME_UTC` (default 13:41) starts the Bluesky post;
- `INSTAGRAM_TIME_UTC` (default 15:17) starts the Instagram post.

Each variable is `HH:MM` in UTC, or `off`. The script looks back across midnight, so a late tick never skips a day.
- **Why it exists:** `schedule:` can't read `vars`. Don't put a `schedule:` back on refresh-data.yml, post-bluesky.yml or post-instagram.yml, or they will run twice. (refresh-instagram-token.yml keeps a cron of its own: nobody needs to change its time from the Settings page.)
- **Dry runs don't count.** A run counts as done unless its run name ends "(dry run)". Each of those workflows sets `run-name` for exactly this, so keep it in step with their dry-run logic.
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
| POST | `/api/scrapes/ingest` | Bulk ingest from scraper: `{ scraped_at, ships: [...] }`. Requires `Authorization: Bearer $INGEST_TOKEN` when `INGEST_TOKEN` is set; refused in production when it isn't |

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
`.github/workflows/post-bluesky.yml` runs `bluesky/post.js` once a day, when the scheduler starts it at `POST_TIME_UTC`, and on demand (off `master` always as a dry run). It picks one case, composes a post, verifies it and publishes it to @abandonedseafarers.bsky.social. The account's DID is pinned in `bluesky/src/config.js`. Setup: repo secrets `BLUESKY_HANDLE` and `BLUESKY_APP_PASSWORD`, plus an optional variable `BLUESKY_SKIP_CASES`.

- `src/load.js`: latest row per case from the committed DB, read-only, via Node's built-in `node:sqlite`. Don't go through `backend/src/db/database.js`, which writes on open.
- `src/feed.js`: already-posted case IDs, read back from the account's own records (`?ship=<id>` in the link card or a link facet).
- `src/select.js`: weighted pick (Unresolved and Disputed ×3) among the least-posted cases.
- `src/parse.js`, `src/sentences.js`, `src/eligibility.js`: circumstances and dated updates, sentence splitting, and what may be quoted.
- `src/compose.js`: template, best-fit layout under 300 graphemes, link facets (UTF-8 byte offsets), link card.
- `src/verify.js`: the grounding check, run before every publish.
- `src/bluesky.js`, `src/site.js`: the fetch client, and the wait until the site serves the case before linking to it.

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

### Instagram poster
`.github/workflows/post-instagram.yml` runs `instagram/post.js` once a day, when the scheduler starts it at `INSTAGRAM_TIME_UTC`, and on demand (off `master` always as a dry run). Instagram takes no text-only post, so the case is drawn as a 1080x1350 JPEG and published with the post's own words as the caption. It picks its own case, the same way the Bluesky poster does, so the two accounts don't have to stay in step.

- `src/card.js`: the card's HTML — the case over a public-domain photograph of open sea, with the map's status colour as its only accent. `render-card.js` photographs it with headless Chrome (already on the runner), which writes JPEG — the only format Instagram takes — when the file ends `.jpg`.
- `src/caption.js`: the caption and the alt text. The caption is the Bluesky post's text minus " · ILO record", which a caption can't make clickable; two lines and four hashtags are added. The alt text names the case, and that naming *is* the state.
- `src/feed.js`: already-posted case IDs, read back from the account's own captions and alt text. Instagram has no per-post metadata field.
- `src/upload.js`: Instagram fetches the image itself, so the card goes to an asset on this repo's `instagram-cards` release first. Not to the site (Render's free instances sleep, and a cold start can outrun Meta's fetch) and not to master (a commit there redeploys).
- `src/instagram.js`: the API client. `src/config.js` pins the Graph API version and the account username; Meta retires a version about two years after release.
- `refresh-token.js` and `.github/workflows/refresh-instagram-token.yml`: the token lasts 60 days and is refreshed twice a month. Miss the window and it is dead for good — a browser re-authorisation, not a retry.

Rules for changing it:
- **The same grounding rules as the Bluesky poster.** The card and caption are built from the composed post's segments, so every word has already been through `verify.js`. Don't add wording to `CARD_LITERALS` or `CAPTION_LITERALS` that asserts an outcome or a timeline.
- **More room, not different words.** `COMPOSE_MAX_GRAPHEMES` (700) is passed to both `composePost` and `verifyDraft`, so the flag and both quotes survive where Bluesky has to drop one. Bluesky still composes and verifies at 300.
- **The fonts are committed** because a runner has almost none: without them "Türkiye" renders as boxes. A quote whose characters the fonts lack is left off the card (`src/renderable.js`), and `assets/fonts/fonts.json` is what decides that.
- **Never commit from the workflow.** A release asset is not a commit, which is the point of uploading there.
- `createContainer` may be retried; `publish` never is. After an ambiguous failure the poster re-lists its own posts before trying again.

Setup: repo secrets `INSTAGRAM_ACCESS_TOKEN` and `INSTAGRAM_USER_ID` (Instagram API with Instagram Login: the account must be Business or Creator, and no Facebook Page is needed), `ACTIONS_SECRET_PAT` for the token refresh (`GITHUB_TOKEN` has no secrets scope), plus optional variables `INSTAGRAM_SKIP_CASES` and `INSTAGRAM_TIME_UTC`.

```bash
cd instagram
node post.js --dry-run --case 1820     # compose, draw the card, post nothing
node render-card.js --case 1820        # just the card
npm test                               # node:test, no dependencies
```

## Ship Status Color Coding
- `Inactive` → blue (`#bbc2e2`)
- `resolved` → green (`#7dce82`)
- `""` (active) → red (`#de1a1a`)
- anything else → yellow (`#e8e288`)
