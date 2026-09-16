const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { main } = require('../post');
const { GRAPH_HOST } = require('../src/config');
const { caseIdsInText } = require('../src/caption');
const { response, fakeFetch } = require('../../bluesky/test/helpers');
const { nikolayMeshkov, bird16, shreenathJi } = require('../../bluesky/fixtures/ships');

const NOW = new Date('2026-09-16T13:41:00Z');
const DATA_AS_OF = '2026-09-16T10:09:20.322Z';
const SECRETS = { INSTAGRAM_ACCESS_TOKEN: 'token', INSTAGRAM_USER_ID: '123' };
const ships = [nikolayMeshkov, bird16, shreenathJi];

// Everything the poster talks to. `media` answers the account's own posts by
// call number, so a test can have a post appear only after a failed publish.
function world({
  media = () => [],
  account = { id: '123', username: 'abandonedseafarers' },
  publish,
  container = { status_code: 'FINISHED' },
} = {}) {
  return fakeFetch([
    [url => url.includes('/me?fields=id,username'), () => response(200, account)],
    [url => url.includes('/me/media'), (url, init, n) => response(200, { data: media(n) })],
    [(url, init) => init?.method === 'POST' && url.endsWith('/media'), () => response(200, { id: 'CONTAINER-1' })],
    [url => url.includes('fields=status_code'), () => response(200, container)],
    [(url, init) => init?.method === 'POST' && url.endsWith('/media_publish'),
      publish || (() => response(200, { id: 'MEDIA-9' }))],
    [url => url.includes('fields=id,permalink'),
      () => response(200, { id: 'MEDIA-9', permalink: 'https://www.instagram.com/p/XYZ/' })],
  ]);
}

function run(argv, { env = {}, fake = world(), ...deps } = {}) {
  const card = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ig-post-')), 'card.jpg');
  const uploads = [];
  const promise = main(['--card', card, ...argv], env, {
    fetch: fake.fetch,
    sleep: async () => {},
    log: () => {},
    now: () => NOW,
    loadShips: () => ({ ships, dropped: [], dataAsOf: DATA_AS_OF }),
    // The real one drives Chrome; here it only has to leave a file behind.
    renderCard: (html, out) => { fs.writeFileSync(out, 'jpeg bytes'); return { htmlPath: null }; },
    upload: (file, options) => {
      uploads.push({ file, options });
      return 'https://github.com/jamesrseal/seafarers/releases/download/instagram-cards/case.jpg';
    },
    minCases: 1,
    ...deps,
  });
  return { promise, fake, uploads, card };
}

const posted = (id, timestamp) => ({
  id: `m${id}`,
  caption: `A case ... ILO case ${id} · abandonedseafarers.org — link in bio`,
  permalink: `https://www.instagram.com/p/${id}/`,
  timestamp,
});

const writes = fake => fake.calls.filter(c => c.init?.method === 'POST');
const containerBody = fake => new URLSearchParams(fake.calls.find(c => c.url.endsWith('/media'))?.init.body);

test('a dry run composes, draws the card, and never touches the account', async () => {
  const { promise, fake, card } = run(['--dry-run', '--case', '1636']);
  const result = await promise;
  assert.equal(result.status, 'dry-run');
  assert.equal(result.draft.caseId, '1636');
  assert.match(result.caption, /ILO case 1636/);
  assert.ok(fs.existsSync(card), 'the card is drawn on a dry run too');
  assert.deepEqual(fake.calls, []);
});

test('publishing needs somewhere public to put the card', async () => {
  await assert.rejects(run(['--case', '1636'], { env: SECRETS }).promise, /--upload or --image-url/);
});

test('publishes a case that has not been posted, with caption and alt text', async () => {
  const fake = world({ media: () => [posted('1306', '2026-09-14T13:41:00+0000')] });
  const { promise, uploads } = run(['--case', '1821', '--upload', '--repo', 'jamesrseal/seafarers'], { env: SECRETS, fake });
  const result = await promise;

  assert.equal(result.status, 'posted');
  assert.equal(result.postUrl, 'https://www.instagram.com/p/XYZ/');
  const sent = containerBody(fake);
  assert.equal(sent.get('image_url'), 'https://github.com/jamesrseal/seafarers/releases/download/instagram-cards/case.jpg');
  assert.equal(uploads.length, 1, 'the card is uploaded once');
  assert.deepEqual(caseIdsInText(sent.get('caption')), ['1821']);
  assert.deepEqual(caseIdsInText(sent.get('alt_text')), ['1821']);
  assert.equal(uploads[0].options.caseId, '1821');
  assert.equal(uploads[0].options.date, '2026-09-16');
  const publishCall = fake.calls.find(c => c.url.endsWith('/media_publish'));
  assert.equal(new URLSearchParams(publishCall.init.body).get('creation_id'), 'CONTAINER-1');
});

test('a card already hosted somewhere is used as it is', async () => {
  const fake = world();
  const { promise, uploads } = run(['--case', '1821', '--image-url', 'https://example.org/card.jpg'], { env: SECRETS, fake });
  assert.equal((await promise).status, 'posted');
  assert.deepEqual(uploads, [], 'nothing uploaded');
  assert.equal(containerBody(fake).get('image_url'), 'https://example.org/card.jpg');
});

test('does nothing when a case was already posted today', async () => {
  const fake = world({ media: () => [posted('1306', '2026-09-16T05:00:00+0000')] });
  const result = await run(['--upload', '--repo', 'a/b'], { env: SECRETS, fake }).promise;
  assert.equal(result.status, 'already-posted');
  assert.deepEqual(writes(fake), []);
});

test('--allow-second-post overrides that', async () => {
  const fake = world({ media: () => [posted('1306', '2026-09-16T05:00:00+0000')] });
  const result = await run(['--upload', '--repo', 'a/b', '--allow-second-post'], { env: SECRETS, fake }).promise;
  assert.equal(result.status, 'posted');
});

test('will not publish without the account secrets', async () => {
  await assert.rejects(run(['--case', '1821', '--upload', '--repo', 'a/b']).promise, /INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_USER_ID/);
});

test('will not post as another account', async () => {
  const wrongName = world({ account: { id: '123', username: 'someone-else' } });
  await assert.rejects(
    run(['--case', '1821', '--upload', '--repo', 'a/b'], { env: SECRETS, fake: wrongName }).promise,
    /posts as @someone-else/,
  );
  assert.deepEqual(writes(wrongName), []);

  const wrongId = world({ account: { id: '999', username: 'abandonedseafarers' } });
  await assert.rejects(
    run(['--case', '1821', '--upload', '--repo', 'a/b'], { env: SECRETS, fake: wrongId }).promise,
    /token belongs to 999/,
  );
  assert.deepEqual(writes(wrongId), []);
});

test('a container that never becomes ready is not published', async () => {
  const fake = world({ container: { status_code: 'ERROR', status: 'media fetch failed' } });
  await assert.rejects(
    run(['--case', '1821', '--image-url', 'https://example.org/c.jpg'], { env: SECRETS, fake }).promise,
    /is ERROR: media fetch failed/,
  );
  assert.equal(fake.calls.filter(c => c.url.endsWith('/media_publish')).length, 0);
});

test('after an ambiguous failure, checks whether the post landed before trying again', async () => {
  let landed = false;
  const fake = world({
    media: () => (landed ? [posted('1821', NOW.toISOString())] : []),
    publish: () => { landed = true; throw new Error('socket hang up'); },
  });
  const result = await run(['--case', '1821', '--image-url', 'https://example.org/c.jpg'], { env: SECRETS, fake }).promise;
  assert.equal(result.status, 'posted');
  assert.equal(fake.calls.filter(c => c.url.endsWith('/media_publish')).length, 1, 'published once, not twice');
});

test('refuses a database that looks truncated', async () => {
  await assert.rejects(run(['--dry-run'], { minCases: 1000 }).promise, /looks truncated/);
});

test('a random pick honours the skip list', async () => {
  const env = { INSTAGRAM_SKIP_CASES: '1821,1636' };
  for (const seed of ['1', '2', '3']) {
    const result = await run(['--dry-run', '--seed', seed], { env }).promise;
    assert.equal(result.draft.caseId, '1306');
  }
});

test('rejects a malformed case ID before doing anything', async () => {
  await assert.rejects(run(['--dry-run', '--case', '18; rm -rf /']).promise, /--case needs a whole number/);
});

test('the token never appears in a URL', async () => {
  const fake = world();
  await run(['--case', '1821', '--image-url', 'https://example.org/c.jpg'], { env: SECRETS, fake }).promise;
  for (const call of fake.calls) {
    assert.ok(call.url.startsWith(GRAPH_HOST), call.url);
    assert.doesNotMatch(call.url, /token/i);
    assert.equal(call.init.headers.Authorization, 'Bearer token');
  }
});
