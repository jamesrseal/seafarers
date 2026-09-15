const test = require('node:test');
const assert = require('node:assert/strict');
const { createClient, RETRY_DELAYS_MS } = require('../src/bluesky');
const { response, fakeFetch } = require('./helpers');

const session = { did: 'did:plc:m7zefvpmn2z7og6rhyvi2ms6', accessJwt: 'jwt' };

function client(routes) {
  const sleeps = [];
  const fake = fakeFetch(routes);
  return { ...fake, sleeps, api: createClient({ fetch: fake.fetch, sleep: async ms => { sleeps.push(ms); } }) };
}

test('finds the account\'s own server in the PLC directory', async () => {
  const { api } = client([[url => url.startsWith('https://plc.directory/'), () => response(200, {
    service: [{ id: '#atproto_pds', type: 'AtprotoPersonalDataServer', serviceEndpoint: 'https://pds.example/' }],
  })]]);
  assert.equal(await api.resolvePds(session.did), 'https://pds.example');
});

test('lists every post, following the cursor', async () => {
  const pages = [{ records: [{ uri: 'a' }], cursor: 'c1' }, { records: [{ uri: 'b' }], cursor: 'c2' }, { records: [] }];
  const { api, calls } = client([[url => url.includes('listRecords'), (url, init, n) => response(200, pages[n - 1])]]);
  const records = await api.listPosts('https://pds.example', session.did);
  assert.deepEqual(records.map(r => r.uri), ['a', 'b']);
  assert.match(calls[1].url, /cursor=c1/);
  assert.match(calls[2].url, /cursor=c2/);
});

test('retries a transient failure, then gives up', async () => {
  const flaky = client([[() => true, (url, init, n) => (n < 3 ? response(503, { error: 'Unavailable' }) : response(200, { records: [] }))]]);
  assert.deepEqual(await flaky.api.listPosts('https://pds.example', session.did), []);
  assert.deepEqual(flaky.sleeps, RETRY_DELAYS_MS.slice(0, 2));

  const down = client([[() => true, () => response(500, { error: 'InternalServerError' })]]);
  await assert.rejects(down.api.listPosts('https://pds.example', session.did), /HTTP 500/);
  assert.equal(down.calls.length, RETRY_DELAYS_MS.length + 1);
});

test('waits out a rate limit for as long as it asks', async () => {
  const reset = String(Math.floor(Date.now() / 1000) + 7);
  const { api, sleeps } = client([[() => true, (url, init, n) => (n === 1 ? response(429, { error: 'RateLimitExceeded' }, { 'ratelimit-reset': reset }) : response(200, { records: [] }))]]);
  await api.listPosts('https://pds.example', session.did);
  assert.ok(sleeps[0] > 5000 && sleeps[0] <= 7000, `slept ${sleeps[0]}ms`);
});

test('a refused login fails at once and names the secrets', async () => {
  const { api, calls } = client([[url => url.endsWith('createSession'), () => response(401, { error: 'AuthenticationRequired', message: 'Invalid identifier or password' })]]);
  await assert.rejects(api.createSession('abandonedseafarers.bsky.social', 'wrong'), /BLUESKY_APP_PASSWORD/);
  assert.equal(calls.length, 1);
});

test('createRecord is never retried, even on a 5xx', async () => {
  const { api, calls } = client([[url => url.endsWith('createRecord'), () => response(502, 'Bad Gateway')]]);
  await assert.rejects(api.createRecord(session, { text: 'x' }), /HTTP 502/);
  assert.equal(calls.length, 1);
});

test('writes go to the logged-in account with its token', async () => {
  const { api, calls } = client([
    [url => url.endsWith('uploadBlob'), () => response(200, { blob: { $type: 'blob', ref: { $link: 'bafk' }, mimeType: 'image/png', size: 3 } })],
    [url => url.endsWith('createRecord'), () => response(200, { uri: 'at://x/app.bsky.feed.post/1', cid: 'c' })],
  ]);
  const blob = await api.uploadBlob(session, Buffer.from('png'), 'image/png');
  assert.equal(blob.ref.$link, 'bafk');
  await api.createRecord(session, { text: 'hello' });
  assert.equal(calls[0].init.headers.Authorization, 'Bearer jwt');
  assert.equal(calls[0].init.headers['Content-Type'], 'image/png');
  assert.deepEqual(JSON.parse(calls[1].init.body), { repo: session.did, collection: 'app.bsky.feed.post', record: { text: 'hello' } });
});
