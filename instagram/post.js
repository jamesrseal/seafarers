#!/usr/bin/env node
/**
 * Daily Instagram post: one ILO abandonment case to @abandonedseafarers.
 *
 * Usage:
 *   node post.js --dry-run [--case 1821] [--seed 7]   compose, verify and draw it; post nothing
 *   node post.js --upload --repo owner/name           draw it, host the card, publish
 *   node post.js --image-url https://…/card.jpg       publish with a card already hosted
 *
 * Flags:
 *   --db PATH             database (default ../backend/data/seafarers.db)
 *   --case ID             post this case instead of a random pick
 *   --seed N              make the random pick reproducible
 *   --allow-second-post   post even though a case was already posted today (UTC)
 *   --card FILE           where to write the rendered JPEG (default card.jpg)
 *   --upload              host the card on this repo's releases, with gh
 *   --repo OWNER/NAME     which repository's releases to use (default GITHUB_REPOSITORY)
 *   --image-url URL       a card already hosted somewhere public; skips rendering
 *   --out FILE            write the draft, caption and result as JSON
 *   --summary FILE        append a Markdown summary (GitHub's $GITHUB_STEP_SUMMARY)
 *
 * Environment:
 *   INSTAGRAM_ACCESS_TOKEN, INSTAGRAM_USER_ID   the account; only needed to publish
 *   INSTAGRAM_SKIP_CASES                        case IDs never to pick, comma-separated
 *   GH_TOKEN                                    for --upload, which shells out to gh
 *
 * Like the Bluesky poster, this writes nothing to the database or the repo:
 * which cases have been posted is read back from the account's own posts,
 * because a commit to master redeploys the site.
 */

const fs = require('fs');
const { DEFAULT_DB_PATH, MIN_CASES } = require('../bluesky/src/config');
const { loadLatestShips } = require('../bluesky/src/load');
const { composePost } = require('../bluesky/src/compose');
const { assertGrounded } = require('../bluesky/src/verify');
const { pickCase, parseSkipList, secureRandom, seededRandom } = require('../bluesky/src/select');
const { statusLabel } = require('../bluesky/src/status');
const { COMPOSE_MAX_GRAPHEMES, ACCOUNT_USERNAME } = require('./src/config');
const { buildCardHtml } = require('./src/card');
const { buildCaption, buildAltText } = require('./src/caption');
const { caseIdsInMedia, summarizeMedia } = require('./src/feed');
const { createClient } = require('./src/instagram');
const { uploadCard } = require('./src/upload');
const { renderHtmlToJpeg } = require('./render-card');

function parseArgs(argv) {
  const opts = {
    db: DEFAULT_DB_PATH, dryRun: false, allowSecondPost: false, caseId: null, seed: null,
    card: 'card.jpg', upload: false, repo: process.env.GITHUB_REPOSITORY || null,
    imageUrl: null, out: null, summary: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) throw new Error(`${arg} needs a value`);
      return v;
    };
    const integer = () => {
      const v = value();
      if (!/^\d+$/.test(v)) throw new Error(`${arg} needs a whole number, got ${v}`);
      return Number(v);
    };
    switch (arg) {
      case '--db': opts.db = value(); break;
      case '--dry-run': opts.dryRun = true; break;
      case '--allow-second-post': opts.allowSecondPost = true; break;
      case '--case': opts.caseId = String(integer()); break;
      case '--seed': opts.seed = integer(); break;
      case '--card': opts.card = value(); break;
      case '--upload': opts.upload = true; break;
      case '--repo': opts.repo = value(); break;
      case '--image-url': opts.imageUrl = value(); break;
      case '--out': opts.out = value(); break;
      case '--summary': opts.summary = value(); break;
      default: throw new Error(`unknown argument ${arg}`);
    }
  }
  if (!opts.dryRun && !opts.upload && !opts.imageUrl) {
    throw new Error('publishing needs either --upload or --image-url: Instagram fetches the card from a public URL');
  }
  return opts;
}

function chooseCase(ships, counts, opts, env, log) {
  if (opts.caseId) {
    const ship = ships.find(s => s.abandonment_id === opts.caseId);
    if (!ship) throw new Error(`case ${opts.caseId} is not in the database, or its row is unusable`);
    const timesPosted = counts.get(opts.caseId) || 0;
    if (timesPosted) log(`Note: case ${opts.caseId} has already been posted ${timesPosted} time(s).`);
    return { ship, chosenBy: 'case_id', timesPosted };
  }
  const rng = opts.seed === null ? secureRandom : seededRandom(opts.seed);
  return { ...pickCase(ships, counts, { rng, skip: parseSkipList(env.INSTAGRAM_SKIP_CASES) }), chosenBy: 'random' };
}

function summaryMarkdown({ draft, caption, pick, mode, postUrl, imageUrl }) {
  const how = pick.chosenBy === 'case_id'
    ? `chosen by case_id (posted ${pick.timesPosted} time(s) before)`
    : `random pick from ${pick.poolSize} cases not yet posted in cycle ${pick.cycle}`;
  return [
    `## Instagram post: ${mode}`,
    '',
    `**Case ${draft.caseId}**, ${statusLabel(pick.ship.ship_status)} — ${how}`,
    ...(postUrl ? ['', `**Posted:** ${postUrl}`] : []),
    ...(imageUrl ? ['', `**Card:** ${imageUrl}`] : []),
    '',
    '```text',
    caption,
    '```',
    '',
    `${caption.length}/2200 characters · flag shown: ${draft.layout.showFlag ? 'yes' : 'no'} · `
      + `quotes: ${(draft.layout.circumstancesQuote ? 1 : 0) + (draft.layout.updateQuote ? 1 : 0)}`,
    '',
  ].join('\n');
}

const appendSummary = (path, markdown) => { if (path) fs.appendFileSync(path, `${markdown}\n`); };
const writeOut = (path, data) => { if (path) fs.writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`); };

// Publishing failed without a clear refusal: a timeout, a dropped connection, a
// 5xx. The post may have landed. Retrying blind would post the case twice, so
// look for it first — the same guard the Bluesky poster has.
async function publishOnce(api, { igUserId, containerId, caseId, sleep, log }) {
  try {
    return await api.publish({ igUserId, containerId });
  } catch (err) {
    const refused = err.status && err.status < 500 && err.status !== 408 && err.status !== 429;
    if (refused) throw err;
    log(`Publishing failed without a clear answer (${err.message}); checking whether it landed.`);
    await sleep(5000);
    const landed = (await api.listMedia({ limit: 25, maxPages: 1 })).find(m => caseIdsInMedia(m).includes(caseId));
    if (landed) {
      log('It did.');
      return landed.id;
    }
    log('It did not; trying once more.');
    return api.publish({ igUserId, containerId });
  }
}

async function main(argv, env = process.env, deps = {}) {
  const {
    fetch = globalThis.fetch,
    sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
    log = console.log,
    now = () => new Date(),
    loadShips = loadLatestShips,
    renderCard = renderHtmlToJpeg,
    upload = uploadCard,
    minCases = MIN_CASES,
  } = deps;

  const opts = parseArgs(argv);
  const { ships, dropped, dataAsOf } = loadShips(opts.db);
  log(`Loaded ${ships.length} cases, data as of ${dataAsOf}${dropped.length ? `; left out ${dropped.length} unusable row(s)` : ''}.`);
  if (ships.length < minCases) {
    throw new Error(`only ${ships.length} usable cases in ${opts.db} (expected at least ${minCases}); refusing to post from a database that looks truncated`);
  }

  const token = env.INSTAGRAM_ACCESS_TOKEN;
  const igUserId = env.INSTAGRAM_USER_ID;
  let api = null;
  let counts = new Map();

  if (!opts.dryRun) {
    if (!token || !igUserId) {
      throw new Error('INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_USER_ID must be set to publish (use --dry-run to preview)');
    }
    api = createClient({ fetch, sleep, log, token });
    const account = await api.account();
    if (account.username !== ACCOUNT_USERNAME) {
      throw new Error(`this token posts as @${account.username}, not @${ACCOUNT_USERNAME}; refusing to post to the wrong account`);
    }
    if (String(account.id) !== String(igUserId)) {
      throw new Error(`INSTAGRAM_USER_ID is ${igUserId}, but the token belongs to ${account.id}`);
    }

    const media = await api.listMedia();
    const seen = summarizeMedia(media, now());
    counts = seen.counts;
    log(`The account has ${media.length} post(s), naming ${counts.size} case(s).`);

    if (seen.postedToday.length && !opts.allowSecondPost) {
      const url = seen.postedToday[0].permalink;
      log(`A case was already posted today (UTC): ${url}. Nothing to do.`);
      appendSummary(opts.summary, `## Instagram post: skipped\n\nA case was already posted today (UTC): ${url}\n`);
      return { status: 'already-posted', exitCode: 0 };
    }
  }

  const pick = chooseCase(ships, counts, opts, env, log);
  const draft = composePost(pick.ship, { maxGraphemes: COMPOSE_MAX_GRAPHEMES });
  assertGrounded(draft, pick.ship, { maxGraphemes: COMPOSE_MAX_GRAPHEMES });
  const caption = buildCaption(draft);
  const alt = buildAltText(draft);
  log(`\nCase ${draft.caseId} (${caption.length} characters):\n\n${caption}\n`);

  // The card is drawn even on a dry run: a case that cannot be drawn is a case
  // that cannot be posted, and it is the thing worth looking at beforehand.
  let imageUrl = opts.imageUrl;
  if (!imageUrl) {
    renderCard(buildCardHtml(draft, pick.ship), opts.card);
    log(`Card written to ${opts.card} (${Math.round(fs.statSync(opts.card).size / 1024)} KB).`);
  }

  if (opts.dryRun) {
    log('Dry run: nothing posted.');
    writeOut(opts.out, { draft, caption, altText: alt.text, card: opts.card });
    appendSummary(opts.summary, summaryMarkdown({ draft, caption, pick, mode: 'dry run, nothing posted' }));
    return { status: 'dry-run', exitCode: 0, draft, caption, altText: alt.text };
  }

  if (!imageUrl) {
    imageUrl = upload(opts.card, {
      repo: opts.repo, caseId: draft.caseId, date: now().toISOString().slice(0, 10), log,
    });
  }

  const containerId = await api.createContainer({ igUserId, imageUrl, caption, altText: alt.text });
  log(`Container ${containerId} created; waiting for Instagram to fetch the card.`);
  await api.waitForContainer(containerId);
  const mediaId = await publishOnce(api, { igUserId, containerId, caseId: draft.caseId, sleep, log });
  const published = await api.media(mediaId).catch(() => ({ permalink: null }));
  const postUrl = published.permalink || `https://www.instagram.com/${ACCOUNT_USERNAME}/`;

  log(`Posted: ${postUrl}`);
  writeOut(opts.out, { draft, caption, altText: alt.text, imageUrl, mediaId, postUrl });
  appendSummary(opts.summary, summaryMarkdown({ draft, caption, pick, mode: 'posted', postUrl, imageUrl }));
  return { status: 'posted', exitCode: 0, draft, caption, mediaId, postUrl };
}

if (require.main === module) {
  main(process.argv.slice(2)).then(
    result => { process.exitCode = result.exitCode; },
    err => { console.error(`\n${err.message}`); process.exitCode = 1; },
  );
}

module.exports = { main, parseArgs, publishOnce };
