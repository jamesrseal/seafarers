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

## When the daily jobs run

The data refresh and the Bluesky post start at times kept in two repository variables.
| Variable | Starts |
|---|---|
| `REFRESH_TIME_UTC` | Refresh ILO data |
| `POST_TIME_UTC` | Post to Bluesky |

Each is a UTC time written `HH:MM`, or `off` to pause that job. From a terminal: `gh variable set POST_TIME_UTC --body 14:00`.

`.github/workflows/scheduler.yml` runs every half hour and starts each job once its time has passed, unless it has already run since. What that means in practice:
- **Times are approximate.** GitHub starts scheduled runs late when it's busy, sometimes by hours, so a time means "at or after", not "at".
- **A manual run counts** as that day's run if it started after the set time. A dry run doesn't count.
- **A failed run isn't retried** until the next day's time.
- **A variable that isn't a valid time** makes the scheduler fail, and GitHub emails you.
- **Avoid times after about 23:00.** A late start slips into the next UTC day.
- **Keep the post an hour or more after the refresh**, so it uses that day's data.

To see what's due without starting anything, go to **Actions → Scheduler → Run workflow**. Dry run is ticked by default.

## Automatic daily refresh

`.github/workflows/refresh-data.yml` runs once a day on GitHub Actions, at the time in `REFRESH_TIME_UTC` (see above). It starts the backend on the runner with the committed `backend/data/seafarers.db`, runs the scraper against it, and commits the updated database to `master` as "Refresh ILO data (N ships, M new)". Render redeploys on that push, so the site is briefly unavailable while it restarts with the new data.

Render's free plan has no persistent disk, so the committed database is the live data: `start.sh` copies it into place on every deploy and restart. Ingest only stores ships whose data changed since their latest row, so each day's commit is small.

Run it on demand from **Actions → Refresh ILO data → Run workflow** (full scan or `rescan-open`, optionally forcing past the sanity guard). A failed run — including a tripped sanity guard — commits nothing, shows as failed in Actions (GitHub emails you), and attaches the backend log and raw scrape to the run. Runs dispatched from a branch other than `master` are dry runs: they upload the refreshed database as an artifact instead of pushing.

The live site's `POST /api/scrapes/ingest` requires the `INGEST_TOKEN` set in Render and refuses writes without it; the daily refresh doesn't use it.

## Daily Bluesky post

`.github/workflows/post-bluesky.yml` posts one abandonment case a day, at the time in `POST_TIME_UTC` (see [When the daily jobs run](#when-the-daily-jobs-run)), to [@abandonedseafarers.org](https://bsky.app/profile/abandonedseafarers.org). The code is in `bluesky/`: Node 22.13+, no dependencies.

**Nothing in a post is written freehand.** Each post is a fixed template filled from the case's record in the committed database: ship name, flag, crew count, port, abandonment date and the site's status label. Most posts also carry whole sentences quoted word for word from the case's circumstances and its latest dated update. For example:

```
Bird 16 (Comoros flag): 15 seafarers abandoned in Mersin, Türkiye, on 1 September 2024.

“2 Indian Officers have 4 months of unpaid salary.”

Latest update, 15 June 2025: “The 3 crew members who complained confirmed that they received their outstanding wages.”

Status: Resolved · ILO record
```

The ship name links to the case on abandonedseafarers.org, "ILO record" links to the ILO page, and a link card points back to the site.

Some sentences are never quoted:
- ones that name or redact a person, carry contact details, or mention a death or someone's medical condition;
- first- or second-person sentences;
- routine correspondence or corrections to the database;
- anything from a letter relayed by a flag state or a seafarer.

When nothing is quotable, the post is just the facts and the links.

Before anything is published, a grounding check re-verifies the draft against the record. Every quote must be verbatim, every number must appear in the record, and the links must be exactly this case's. If the check fails, nothing is posted.

**Which case.** Any case can be picked. Unresolved and Disputed cases are three times as likely as the rest, and no case is posted twice until every case has been. The workflow never commits, because a push to `master` redeploys Render. Instead, it works out what has already been posted by reading the account's own posts. That means:
- deleting a post makes its case eligible again;
- to keep a case out for good, add its ID to the repository variable `BLUESKY_SKIP_CASES` (comma-separated);
- at most one case is posted per UTC day.

Before posting, it waits until the site is serving that case, so the link works.

**Setup, once.**
1. Create an app password in Bluesky under **Settings → Privacy and security → App passwords**.
2. Add the repository secrets `BLUESKY_HANDLE` (`abandonedseafarers.org`) and `BLUESKY_APP_PASSWORD`.

**Running it by hand.** Use **Actions → Post to Bluesky → Run workflow**:
- `dry_run` is ticked by default. It composes and verifies the post and shows it in the run summary, without publishing.
- `case_id` posts a specific case.
- `allow_second_post` overrides the once-a-day limit.

Runs from any branch other than `master` are always dry runs. Locally:

```bash
cd bluesky
node post.js --dry-run --case 1821     # preview one case
node post.js --dry-run --seed 7        # preview a reproducible random pick
npm run check-all -- --sample 10       # compose and verify every case; print 10
npm test
```

## Project Structure

```
backend/   Node.js/Express API + SQLite
frontend/  React + Vite + Tailwind CSS + Leaflet
scraper/   Python + Playwright scraper
bluesky/   Daily Bluesky post (Node.js, no dependencies)
```

See `CLAUDE.md` for full architecture details and API reference.

## Contact

[abandonedseafarers@gmail.com](mailto:abandonedseafarers@gmail.com)
