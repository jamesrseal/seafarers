#!/usr/bin/env python3
"""
ILO Abandoned Seafarers scraper.

Uses Playwright to render each detail page (AJAX site) and extract structured data.
Iterates abandonment IDs 1 through MAX_ID, skipping missing records gracefully.
Geocodes ports via Nominatim (with manual override CSV for corrections).
Posts the full batch to the backend /api/scrapes/ingest endpoint.

Usage:
    pip install -r requirements.txt
    playwright install chromium
    python scrape.py [--start 1] [--end 1700] [--api http://localhost:3001]
"""

import argparse
import csv
import json
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
from geopy.geocoders import Nominatim
from geopy.exc import GeocoderTimedOut, GeocoderUnavailable
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
BASE_URL = "https://wwwex.ilo.org/dyn/r/abandonment/seafarers/details"
SCRIPT_DIR = Path(__file__).parent
REPO_ROOT = SCRIPT_DIR.parent

PORT_OVERRIDES_CSV = REPO_ROOT / "cleaned_ports_list.csv"
FLAG_URLS_CSV = REPO_ROOT / "flag_urls.csv"

GEOCODE_DELAY = 1.2   # seconds between Nominatim calls
PAGE_DELAY = 0.8      # seconds between Playwright page loads


# ---------------------------------------------------------------------------
# Load support data
# ---------------------------------------------------------------------------
def load_port_overrides():
    overrides = {}
    if PORT_OVERRIDES_CSV.exists():
        with open(PORT_OVERRIDES_CSV, newline='', encoding='utf-8') as f:
            reader = csv.DictReader(f, delimiter='~')
            for row in reader:
                overrides[row['Port of abandonment'].strip()] = (
                    float(row['lat']), float(row['long'])
                )
    return overrides


def load_flag_urls():
    flags = {}
    if FLAG_URLS_CSV.exists():
        with open(FLAG_URLS_CSV, newline='', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                country = row.get('Country') or row.get('country', '').strip()
                url = row.get('Flag URL') or row.get('flag_url', '').strip()
                if country and url:
                    flags[country] = url
    return flags


# ---------------------------------------------------------------------------
# Geocoding
# ---------------------------------------------------------------------------
_geocoder = Nominatim(user_agent="seafarers_scraper/2.0")
_geocache: dict[str, tuple[float, float] | None] = {}


def geocode(port: str, overrides: dict) -> tuple[float | None, float | None]:
    if not port:
        return None, None
    if port in overrides:
        return overrides[port]
    if port in _geocache:
        result = _geocache[port]
        return result if result else (None, None)

    time.sleep(GEOCODE_DELAY)
    try:
        loc = _geocoder.geocode(port, timeout=10)
        if loc:
            _geocache[port] = (loc.latitude, loc.longitude)
            return loc.latitude, loc.longitude
        _geocache[port] = None
        return None, None
    except (GeocoderTimedOut, GeocoderUnavailable):
        return None, None


# ---------------------------------------------------------------------------
# Page parsing
# ---------------------------------------------------------------------------
def parse_detail_page(html: str, abandonment_id: int) -> dict | None:
    """
    Parse a rendered detail page and return a ship record dict.
    Returns None if the page indicates no record exists.
    """
    from html.parser import HTMLParser

    # Quick check for empty/404 page
    if 'No data found' in html or 'p3_abandonment_id' not in html:
        return None

    def text_after_label(label: str) -> str:
        """Extract the value following a label in the DL/DD structure."""
        pattern = re.compile(
            rf'{re.escape(label)}\s*</(?:dt|th|label)[^>]*>\s*<(?:dd|td)[^>]*>\s*(.*?)\s*</(?:dd|td)>',
            re.IGNORECASE | re.DOTALL,
        )
        m = pattern.search(html)
        if m:
            # Strip inner HTML tags
            return re.sub(r'<[^>]+>', '', m.group(1)).strip()
        return ''

    def find_field(label: str) -> str:
        val = text_after_label(label)
        if not val:
            # Try simpler adjacent text pattern
            idx = html.lower().find(label.lower())
            if idx != -1:
                snippet = html[idx:idx+500]
                tags_stripped = re.sub(r'<[^>]+>', ' ', snippet)
                parts = [p.strip() for p in tags_stripped.split() if p.strip()]
                # Skip the label words themselves
                label_words = label.split()
                for i, p in enumerate(parts):
                    if p not in label_words and len(p) > 1:
                        return p
        return val

    # Extract structured fields via common label patterns
    record = {
        'abandonment_id': str(abandonment_id),
        'ilo_url': f"https://wwwex.ilo.org/dyn/r/abandonment/seafarers/details?p3_abandonment_id={abandonment_id}",
    }

    # Try to pull a table of key-value pairs
    rows = re.findall(
        r'<tr[^>]*>.*?<(?:td|th)[^>]*>(.*?)</(?:td|th)>.*?<(?:td|th)[^>]*>(.*?)</(?:td|th)>.*?</tr>',
        html, re.DOTALL | re.IGNORECASE,
    )

    kv = {}
    for k_raw, v_raw in rows:
        k = re.sub(r'<[^>]+>', '', k_raw).strip().rstrip(':')
        v = re.sub(r'<[^>]+>', ' ', v_raw).strip()
        v = re.sub(r'\s+', ' ', v)
        if k:
            kv[k] = v

    def get(*keys):
        for k in keys:
            for stored_key, val in kv.items():
                if k.lower() in stored_key.lower():
                    return val
        return ''

    record['ship_name']           = get('Ship name', 'Vessel name', 'Name of ship')
    record['ship_status']         = get('Status', 'Ship status')
    record['flag']                = get('Flag', 'Flag state')
    record['imo_number']          = get('IMO', 'IMO number', 'IMO no')
    record['port_of_abandonment'] = get('Port of abandonment', 'Port')
    record['abandonment_date']    = get('Abandonment date', 'Date of abandonment')
    record['notification_date']   = get('Notification date', 'Date of notification')
    record['reporting_member']    = get('Reporting', 'Member', 'Organisation')
    record['num_seafarers']       = get('Number of seafarers', 'No. of seafarers', 'Seafarers')
    record['circumstances']       = get('Circumstances')
    record['comments']            = get('Comments', 'Observations')
    record['fishing_vessel']      = 1 if 'fishing' in get('Fishing', 'Type').lower() else 0

    # Clean num_seafarers to integer
    ns = re.sub(r'[^\d]', '', record['num_seafarers'])
    record['num_seafarers'] = int(ns) if ns else None

    # Build VesselFinder link from IMO
    imo = re.sub(r'[^\d]', '', record['imo_number'])
    record['vessel_finder_url'] = f"https://www.vesselfinder.com/vessels?name={imo}" if imo else None

    return record


# ---------------------------------------------------------------------------
# Main scraper
# ---------------------------------------------------------------------------
def scrape(start: int, end: int, api_url: str):
    port_overrides = load_port_overrides()
    flag_urls = load_flag_urls()
    scraped_at = datetime.now(timezone.utc).isoformat()

    print(f"Starting scrape: IDs {start}–{end}  |  scraped_at={scraped_at}")

    records = []
    failed_ids = []

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            )
        )
        page = context.new_page()

        for aid in range(start, end + 1):
            url = f"{BASE_URL}?p3_abandonment_id={aid}"
            try:
                page.goto(url, wait_until='networkidle', timeout=20_000)
                html = page.content()
            except PlaywrightTimeout:
                print(f"  [{aid}] TIMEOUT — skipping")
                failed_ids.append(aid)
                continue
            except Exception as e:
                print(f"  [{aid}] ERROR: {e} — skipping")
                failed_ids.append(aid)
                continue

            record = parse_detail_page(html, aid)
            if record is None:
                print(f"  [{aid}] no record")
                time.sleep(PAGE_DELAY)
                continue

            # Geocode
            lat, lon = geocode(record.get('port_of_abandonment', ''), port_overrides)
            record['port_latitude'] = lat
            record['port_longitude'] = lon

            # Flag URL
            record['flag_url'] = flag_urls.get(record.get('flag', ''), None)

            records.append(record)
            print(f"  [{aid}] {record.get('ship_name', '?')} — {record.get('port_of_abandonment', '?')}")
            time.sleep(PAGE_DELAY)

        browser.close()

    print(f"\nScraped {len(records)} records. Posting to {api_url}/api/scrapes/ingest …")

    payload = {'scraped_at': scraped_at, 'ships': records}
    try:
        resp = requests.post(f"{api_url}/api/scrapes/ingest", json=payload, timeout=60)
        resp.raise_for_status()
        print(f"Ingest response: {resp.json()}")
    except Exception as e:
        # Save to disk as fallback
        out = SCRIPT_DIR / f"scraped_{scraped_at[:10]}.json"
        with open(out, 'w') as f:
            json.dump(payload, f, indent=2)
        print(f"API error: {e}\nData saved to {out}")

    if failed_ids:
        print(f"\nFailed IDs (network errors): {failed_ids}")


# ---------------------------------------------------------------------------
if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Scrape ILO seafarers abandonment database')
    parser.add_argument('--start', type=int, default=1)
    parser.add_argument('--end',   type=int, default=1700)
    parser.add_argument('--api',   default='http://localhost:3001')
    args = parser.parse_args()
    scrape(args.start, args.end, args.api)
