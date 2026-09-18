const { SITE_ORIGIN } = require('./config');

const REQUEST_TIMEOUT_MS = 90 * 1000; // a sleeping Render free instance takes ~a minute to wake

// Why the site can't yet back this post, or null when it can: the case's page
// must load, and from data at least as new as the post's. A push to master
// redeploys Render and a new case isn't on the site until that finishes, so a
// link posted too early opens to nothing.
async function liveProblem({ id, dataAsOf, fetch }) {
  try {
    const shipRes = await fetch(`${SITE_ORIGIN}/api/ships/${id}`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (shipRes.status !== 200) return `/api/ships/${id} answered HTTP ${shipRes.status}`;
    const scrapesRes = await fetch(`${SITE_ORIGIN}/api/scrapes`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (scrapesRes.status !== 200) return `/api/scrapes answered HTTP ${scrapesRes.status}`;
    const runs = await scrapesRes.json();
    const siteDataAsOf = Array.isArray(runs) ? runs[0]?.scraped_at : null;
    if (dataAsOf && !(siteDataAsOf >= dataAsOf)) return `the site's data is from ${siteDataAsOf || 'an unknown time'}, this post's from ${dataAsOf}`;
    return null;
  } catch (err) {
    return err.message;
  }
}

async function waitForLiveCase({
  id, dataAsOf, fetch, sleep, log = () => {},
  timeoutMs = 30 * 60 * 1000, intervalMs = 30 * 1000, clock = Date.now,
}) {
  const deadline = clock() + timeoutMs;
  for (;;) {
    const problem = await liveProblem({ id, dataAsOf, fetch });
    if (!problem) return;
    if (clock() >= deadline) {
      throw new Error(`abandonedseafarers.org still can't show case ${id} after ${Math.round(timeoutMs / 60000)} minutes (${problem}); not posting a link that may not work`);
    }
    log(`  Waiting for the site: ${problem}`);
    await sleep(intervalMs);
  }
}

// Bluesky rejects a blob over 1 MB; the cards run ~40 KB.
const CARD_MAX_BYTES = 1000000;
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];

// The case's own card, drawn by the site (backend/src/ogCard.js), for the link
// card's thumbnail. Returns null rather than throwing when the site can't give
// a usable one: a post is worth making with the site-wide image behind it.
async function fetchCaseCard({ id, fetch, log = () => {} }) {
  const url = `${SITE_ORIGIN}/og/case-${id}.png`;
  const fallback = reason => { log(`  Using the site's own image: ${reason}.`); return null; };
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (res.status !== 200) return fallback(`${url} answered HTTP ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length > CARD_MAX_BYTES) return fallback(`the card is ${bytes.length} bytes, over Bluesky's ${CARD_MAX_BYTES}`);
    if (!PNG_MAGIC.every((byte, i) => bytes[i] === byte)) return fallback('the card isn\'t a PNG');
    return bytes;
  } catch (err) {
    return fallback(err.message);
  }
}

module.exports = { waitForLiveCase, liveProblem, fetchCaseCard, CARD_MAX_BYTES };
