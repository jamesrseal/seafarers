const test = require('node:test');
const assert = require('node:assert/strict');
const { main } = require('../post');
const { ACCOUNT_DID, siteCaseUrl } = require('../src/config');
const { verifyDraft } = require('../src/verify');
const { response, fakeFetch } = require('./helpers');
const { nikolayMeshkov, bird16, shreenathJi } = require('../fixtures/ships');

const NOW = new Date('2026-09-15T13:41:00Z');
const DATA_AS_OF = '2026-09-15T10:09:20.322Z';
const SECRETS = { BLUESKY_HANDLE: 'abandonedseafarers.org', BLUESKY_APP_PASSWORD: 'app-password' };
const ships = [nikolayMeshkov, bird16, shreenathJi];

// Everything the poster talks to. `posts` answers listRecords by call number.
function world({ posts = () => [], session = { did: ACCOUNT_DID, accessJwt: 'jwt' }, createRecord, siteShip } = {}) {
  return fakeFetch([
    [url => url.startsWith('https://plc.directory/'), () => response(200, { service: [{ id: '#atproto_pds', serviceEndpoint: 'https://pds.example' }] })],
    [url => url.includes('com.atproto.repo.listRecords'), (url, init, n) => response(200, { records: posts(n) })],
    [url => url.startsWith('https://abandonedseafarers.org/api/ships/'), siteShip || (() => response(200, {}))],
    [url => url === 'https://abandonedseafarers.org/api/scrapes', () => response(200, [{ scraped_at: DATA_AS_OF }])],
    [url => url.endsWith('com.atproto.server.createSession'), () => response(200, session)],
    [url => url.endsWith('com.atproto.repo.uploadBlob'), () => response(200, { blob: { $type: 'blob', ref: { $link: 'bafk' }, mimeType: 'image/png', size: 3 } })],
    [url => url.endsWith('com.atproto.repo.createRecord'), createRecord || (() => response(200, { uri: `at://${ACCOUNT_DID}/app.bsky.feed.post/3kpost`, cid: 'cid' }))],
  ]);
}

function run(argv, { env = {}, fake = world(), ...deps } = {}) {
  const sleeps = [];
  const promise = main(argv, env, {
    fetch: fake.fetch,
    sleep: async ms => { sleeps.push(ms); },
    log: () => {},
    now: () => NOW,
    loadShips: () => ({ ships, dropped: [], dataAsOf: DATA_AS_OF }),
    readFile: () => Buffer.from('png'),
    minCases: 1,
    ...deps,
  });
  return { promise, fake, sleeps };
}

const writes = fake => fake.calls.filter(c => c.url.startsWith('https://bsky.social/'));
const postedCase = (id, createdAt) => ({ uri: `at://${ACCOUNT_DID}/app.bsky.feed.post/old`, cid: 'c', value: { createdAt, embed: { external: { uri: siteCaseUrl(id) } } } });

test('a dry run composes and verifies, and never logs in', async () => {
  const { promise, fake } = run(['--dry-run', '--case', '1636']);
  const result = await promise;
  assert.equal(result.status, 'dry-run');
  assert.equal(result.draft.caseId, '1636');
  assert.deepEqual(verifyDraft(result.draft, shreenathJi), []);
  assert.deepEqual(writes(fake), []);
});

test('does nothing when a case was already posted today', async () => {
  const fake = world({ posts: () => [postedCase('1306', '2026-09-15T13:41:05.000Z')] });
  const result = await run([], { env: SECRETS, fake }).promise;
  assert.equal(result.status, 'already-posted');
  assert.deepEqual(writes(fake), []);
});

test('publishes a case that has not been posted', async () => {
  const fake = world({ posts: () => [postedCase('1306', '2026-09-14T13:41:00.000Z'), postedCase('1636', '2026-09-13T13:41:00.000Z')] });
  const result = await run([], { env: SECRETS, fake }).promise;
  assert.equal(result.status, 'posted');
  assert.equal(result.url, `https://bsky.app/profile/${ACCOUNT_DID}/post/3kpost`);

  const create = fake.calls.find(c => c.url.endsWith('createRecord'));
  const body = JSON.parse(create.init.body);
  assert.equal(body.repo, ACCOUNT_DID);
  assert.equal(body.record.text, result.draft.text);
  assert.equal(body.record.embed.external.uri, siteCaseUrl('1821'), 'the only case not yet posted');
  assert.equal(body.record.embed.external.thumb.ref.$link, 'bafk');
  assert.equal(body.record.createdAt, NOW.toISOString());
});

test('will not publish without the login secrets', async () => {
  await assert.rejects(run(['--case', '1821']).promise, /BLUESKY_HANDLE and BLUESKY_APP_PASSWORD/);
});

test('will not post to an account other than the pinned one', async () => {
  const fake = world({ session: { did: 'did:plc:someoneelse', accessJwt: 'jwt' } });
  await assert.rejects(run(['--case', '1821'], { env: SECRETS, fake }).promise, /wrong account/);
  assert.equal(fake.calls.filter(c => c.url.endsWith('createRecord')).length, 0);
});

test('after an ambiguous failure, checks whether the post landed before trying again', async () => {
  let landed = false;
  const fake = world({
    posts: () => (landed ? [postedCase('1821', NOW.toISOString())] : []),
    createRecord: () => { landed = true; throw new Error('socket hang up'); },
  });
  const result = await run(['--case', '1821'], { env: SECRETS, fake }).promise;
  assert.equal(result.status, 'posted');
  assert.equal(fake.calls.filter(c => c.url.endsWith('createRecord')).length, 1);
});

test('waits for the site to serve the case before posting a link to it', async () => {
  const fake = world({ siteShip: (url, init, n) => response(n < 3 ? 404 : 200, {}) });
  const { promise, sleeps } = run(['--case', '1821'], { env: SECRETS, fake });
  assert.equal((await promise).status, 'posted');
  assert.deepEqual(sleeps, [30000, 30000]);
});

test('refuses a database that looks truncated', async () => {
  await assert.rejects(run(['--dry-run'], { minCases: 1000 }).promise, /looks truncated/);
});

test('a random pick honours the skip list', async () => {
  const env = { BLUESKY_SKIP_CASES: '1821,1636' };
  for (const seed of ['1', '2', '3']) {
    const result = await run(['--dry-run', '--seed', seed], { env }).promise;
    assert.equal(result.draft.caseId, '1306');
  }
});

test('rejects a malformed case ID before doing anything', async () => {
  await assert.rejects(run(['--dry-run', '--case', '18; rm -rf /']).promise, /--case needs a whole number/);
});
