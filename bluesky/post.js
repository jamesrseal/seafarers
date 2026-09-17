#!/usr/bin/env node
/**
 * Daily Bluesky post: one ILO abandonment case to @abandonedseafarers.org.
 *
 * Usage:
 *   node post.js --dry-run [--case 1821] [--seed 7]   compose and verify, post nothing
 *   node post.js                                       pick, compose, verify and publish
 *   node post.js --check-all [--sample 20]             compose and verify EVERY case
 *
 * Flags:
 *   --db PATH             database (default ../backend/data/seafarers.db)
 *   --case ID             post this case instead of a random pick
 *   --seed N              make the random pick reproducible
 *   --allow-second-post   post even though a case was already posted today (UTC)
 *   --out FILE            write the draft and the record as JSON
 *   --summary FILE        append a Markdown summary (GitHub's $GITHUB_STEP_SUMMARY)
 *   --sample N            with --check-all, print N composed posts to read
 *
 * Environment:
 *   BLUESKY_HANDLE, BLUESKY_APP_PASSWORD   the login; only needed to publish
 *   BLUESKY_SKIP_CASES                     case IDs never to pick, comma-separated
 *
 * Nothing here writes to the database or the repo. Which cases were already
 * posted is read back from the account's own posts, because a commit to master
 * redeploys the site.
 */

const fs = require('fs');
const { ACCOUNT_DID, DEFAULT_DB_PATH, MIN_CASES, THUMB_PATH, iloUrlPattern } = require('./src/config');
const { loadLatestShips } = require('./src/load');
const { composePost, buildRecord } = require('./src/compose');
const { assertGrounded } = require('./src/verify');
const { pickCase, parseSkipList, secureRandom, seededRandom } = require('./src/select');
const { caseIdsInPost, summarizePosts, postWebUrl } = require('./src/feed');
const { createClient } = require('./src/bluesky');
const { waitForLiveCase } = require('./src/site');
const { statusLabel } = require('./src/status');

function parseArgs(argv) {
  const opts = {
    db: DEFAULT_DB_PATH, dryRun: false, checkAll: false, allowSecondPost: false,
    caseId: null, seed: null, out: null, summary: null, sample: 0,
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
      case '--check-all': opts.checkAll = true; break;
      case '--allow-second-post': opts.allowSecondPost = true; break;
      case '--case': opts.caseId = String(integer()); break;
      case '--seed': opts.seed = integer(); break;
      case '--out': opts.out = value(); break;
      case '--summary': opts.summary = value(); break;
      case '--sample': opts.sample = integer(); break;
      default: throw new Error(`unknown argument ${arg}`);
    }
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
  return { ...pickCase(ships, counts, { rng, skip: parseSkipList(env.BLUESKY_SKIP_CASES) }), chosenBy: 'random' };
}

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function summaryMarkdown(draft, pick, { mode, postUrl }) {
  const how = pick.chosenBy === 'case_id'
    ? `chosen by case_id (posted ${pick.timesPosted} time(s) before)`
    : `random pick from ${pick.poolSize} cases not yet posted in cycle ${pick.cycle}`;
  return [
    `## Bluesky post: ${mode}`,
    '',
    `**Case ${draft.caseId}**, ${statusLabel(pick.ship.ship_status)}: [site](${draft.card.uri}) · [ILO record](${pick.ship.ilo_url}) · ${how}`,
    ...(postUrl ? ['', `**Posted:** ${postUrl}`] : []),
    '',
    '```text',
    draft.text,
    '```',
    '',
    `${draft.graphemes}/300 graphemes · ${draft.bytes} bytes · flag shown: ${yesNo(draft.layout.showFlag)} · `
      + `circumstances quote: ${yesNo(draft.layout.circumstancesQuote)} · update quote: ${yesNo(draft.layout.updateQuote)}`
      + (draft.layout.updateRejected ? ` (latest update not quotable: ${draft.layout.updateRejected})` : ''),
    '',
    `**Link card:** ${draft.card.title}  `,
    draft.card.description,
    '',
  ].join('\n');
}

function appendSummary(path, markdown) {
  if (path) fs.appendFileSync(path, `${markdown}\n`);
}

function writeOut(path, data) {
  if (path) fs.writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

function checkAll(ships, { log, sample, seed }) {
  const tally = { both: 0, circumstancesOnly: 0, updateOnly: 0, noQuote: 0, flagHidden: 0 };
  const drafts = [];
  const failures = [];
  let longest = 0;
  for (const ship of ships) {
    try {
      const draft = composePost(ship);
      assertGrounded(draft, ship);
      drafts.push(draft);
      const { circumstancesQuote: c, updateQuote: u, showFlag } = draft.layout;
      if (c && u) tally.both++;
      else if (c) tally.circumstancesOnly++;
      else if (u) tally.updateOnly++;
      else tally.noQuote++;
      if (!showFlag) tally.flagHidden++;
      longest = Math.max(longest, draft.graphemes);
    } catch (err) {
      failures.push(err.message);
    }
  }

  log(`Composed and verified ${drafts.length} of ${ships.length} cases; longest post ${longest} graphemes.`);
  log(`Quotes: both ${tally.both} · circumstances only ${tally.circumstancesOnly} · update only ${tally.updateOnly} · none ${tally.noQuote}. Flag left out of ${tally.flagHidden}.`);

  if (sample) {
    const rng = seededRandom(seed ?? 1);
    const shown = new Set();
    while (shown.size < Math.min(sample, drafts.length)) shown.add(Math.floor(rng() * drafts.length));
    for (const i of shown) log(`\n--- case ${drafts[i].caseId} (${drafts[i].graphemes} graphemes)\n${drafts[i].text}`);
  }

  if (failures.length) {
    log(`\n${failures.length} case(s) FAILED:`);
    for (const failure of failures.slice(0, 50)) log(failure);
    return { status: 'check-failed', exitCode: 1, failures };
  }
  return { status: 'checked', exitCode: 0 };
}

// createRecord failed without a clear refusal: a timeout, a dropped connection,
// a 5xx. The post may have landed. Retrying blind could post the case twice,
// so look for it first.
async function publishOnce(client, session, pds, record, caseId, { sleep, log }) {
  try {
    return await client.createRecord(session, record);
  } catch (err) {
    const refused = err.status && err.status < 500 && err.status !== 408 && err.status !== 429;
    if (refused) throw err;
    log(`Posting failed without a clear answer (${err.message}); checking whether it landed.`);
    await sleep(5000);
    const landed = (await client.listPosts(pds, ACCOUNT_DID)).find(r =>
      r.value?.createdAt === record.createdAt && caseIdsInPost(r.value).includes(caseId));
    if (landed) {
      log('It did.');
      return { uri: landed.uri, cid: landed.cid };
    }
    log('It did not; trying once more.');
    return client.createRecord(session, record);
  }
}

async function main(argv, env = process.env, deps = {}) {
  const {
    fetch = globalThis.fetch,
    sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
    log = console.log,
    now = () => new Date(),
    loadShips = loadLatestShips,
    readFile = path => fs.readFileSync(path),
    minCases = MIN_CASES,
    siteWait = {},
  } = deps;

  const opts = parseArgs(argv);
  const { ships, dropped, dataAsOf } = loadShips(opts.db);
  log(`Loaded ${ships.length} cases, data as of ${dataAsOf}${dropped.length ? `; left out ${dropped.length} unusable row(s)` : ''}.`);
  if (ships.length < minCases) {
    throw new Error(`only ${ships.length} usable cases in ${opts.db} (expected at least ${minCases}); refusing to post from a database that looks truncated`);
  }

  if (opts.checkAll) return checkAll(ships, { log, sample: opts.sample, seed: opts.seed });

  const client = createClient({ fetch, sleep, log });
  const pds = await client.resolvePds(ACCOUNT_DID);
  const records = await client.listPosts(pds, ACCOUNT_DID);
  const { counts, postedToday } = summarizePosts(records, now());
  log(`The account has ${records.length} post(s), linking to ${counts.size} case(s).`);

  if (postedToday.length && !opts.allowSecondPost) {
    const url = postWebUrl(postedToday[0].uri);
    log(`A case was already posted today (UTC): ${url}. Nothing to do.`);
    appendSummary(opts.summary, `## Bluesky post: skipped\n\nA case was already posted today (UTC): ${url}\n`);
    return { status: 'already-posted', exitCode: 0 };
  }

  const pick = chooseCase(ships, counts, opts, env, log);
  const draft = composePost(pick.ship);
  assertGrounded(draft, pick.ship);
  const record = buildRecord(draft, now());
  log(`\nCase ${draft.caseId} (${draft.graphemes} graphemes):\n\n${draft.text}\n\nCard: ${draft.card.title} | ${draft.card.description}\n`);
  writeOut(opts.out, { draft, record });

  if (opts.dryRun) {
    log('Dry run: nothing posted.');
    appendSummary(opts.summary, summaryMarkdown(draft, pick, { mode: 'dry run, nothing posted' }));
    return { status: 'dry-run', exitCode: 0, draft, record };
  }

  const handle = env.BLUESKY_HANDLE;
  const password = env.BLUESKY_APP_PASSWORD;
  if (!handle || !password) {
    throw new Error('BLUESKY_HANDLE and BLUESKY_APP_PASSWORD must be set to publish (use --dry-run to preview)');
  }
  // Belt and braces: load.js already dropped rows whose ILO link isn't theirs.
  if (!iloUrlPattern(draft.caseId).test(pick.ship.ilo_url)) throw new Error(`case ${draft.caseId} has no valid ILO link`);

  await waitForLiveCase({ id: draft.caseId, dataAsOf, fetch, sleep, log, ...siteWait });
  const session = await client.createSession(handle, password);
  if (session.did !== ACCOUNT_DID) {
    throw new Error(`logged in as ${session.did}, not ${ACCOUNT_DID}; refusing to post to the wrong account`);
  }
  record.embed.external.thumb = await client.uploadBlob(session, readFile(THUMB_PATH), 'image/png');
  const created = await publishOnce(client, session, pds, record, draft.caseId, { sleep, log });

  const url = postWebUrl(created.uri);
  log(`Posted: ${url}`);
  writeOut(opts.out, { draft, record, posted: created, url });
  appendSummary(opts.summary, summaryMarkdown(draft, pick, { mode: 'posted', postUrl: url }));
  return { status: 'posted', exitCode: 0, draft, record, url };
}

if (require.main === module) {
  main(process.argv.slice(2)).then(
    result => { process.exitCode = result.exitCode; },
    err => { console.error(`\n${err.message}`); process.exitCode = 1; },
  );
}

module.exports = { main, parseArgs };
