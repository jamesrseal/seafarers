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

module.exports = { waitForLiveCase, liveProblem };
