const test = require('node:test');
const assert = require('node:assert/strict');
const { createClient, GraphError } = require('../src/instagram');

// A fetch that answers from a queue and records what it was asked.
function fakeFetch(responses) {
  const calls = [];
  const fetch = async (url, options = {}) => {
    calls.push({ url, method: options.method ?? 'GET', headers: options.headers ?? {}, body: options.body });
    const next = responses.shift();
    if (!next) throw new Error(`no fake response left for ${options.method ?? 'GET'} ${url}`);
    if (next.throw) throw next.throw;
    return {
      ok: next.status === undefined || (next.status >= 200 && next.status < 300),
      status: next.status ?? 200,
      text: async () => (typeof next.body === 'string' ? next.body : JSON.stringify(next.body ?? {})),
    };
  };
  return { fetch, calls };
}

const client = (responses, extra = {}) => {
  const { fetch, calls } = fakeFetch(responses);
  return { api: createClient({ fetch, sleep: async () => {}, token: 'SECRET-TOKEN', ...extra }), calls };
};

test('a token is required, and travels in the header rather than the URL', async () => {
  assert.throws(() => createClient({ fetch: async () => {} }), /access token is required/);
  const { api, calls } = client([{ body: { id: '17841400000000000', username: 'abandonedseafarers' } }]);
  const account = await api.account();
  assert.equal(account.username, 'abandonedseafarers');
  assert.equal(calls[0].headers.Authorization, 'Bearer SECRET-TOKEN');
  assert.doesNotMatch(calls[0].url, /SECRET-TOKEN/);
  assert.match(calls[0].url, /^https:\/\/graph\.instagram\.com\/v\d+\.\d+\/me\?fields=id,username$/);
});

test('creating a container posts the image URL, caption and alt text', async () => {
  const { api, calls } = client([{ body: { id: 'CONTAINER-1' } }]);
  const id = await api.createContainer({
    igUserId: '123', imageUrl: 'https://example.org/card.jpg', caption: 'ILO case 7', altText: 'a card',
  });
  assert.equal(id, 'CONTAINER-1');
  assert.equal(calls[0].method, 'POST');
  assert.match(calls[0].url, /\/123\/media$/);
  const sent = new URLSearchParams(calls[0].body);
  assert.equal(sent.get('image_url'), 'https://example.org/card.jpg');
  assert.equal(sent.get('caption'), 'ILO case 7');
  assert.equal(sent.get('alt_text'), 'a card');
});

test('a container with no id is an error rather than a half-made post', async () => {
  const { api } = client([{ body: {} }]);
  await assert.rejects(() => api.createContainer({ igUserId: '123', imageUrl: 'https://example.org/c.jpg' }), /returned no id/);
});

test('waiting on a container polls until it is ready', async () => {
  const { api, calls } = client([
    { body: { status_code: 'IN_PROGRESS' } },
    { body: { status_code: 'IN_PROGRESS' } },
    { body: { status_code: 'FINISHED' } },
  ]);
  assert.equal(await api.waitForContainer('CONTAINER-1', { interval: 0 }), 'FINISHED');
  assert.equal(calls.length, 3);
});

test('a container that failed or expired is not published', async () => {
  const failed = client([{ body: { status_code: 'ERROR', status: 'media fetch failed' } }]);
  await assert.rejects(() => failed.api.waitForContainer('C', { interval: 0 }), /is ERROR: media fetch failed/);
  const expired = client([{ body: { status_code: 'EXPIRED' } }]);
  await assert.rejects(() => expired.api.waitForContainer('C', { interval: 0 }), /is EXPIRED/);
  const stuck = client([{ body: { status_code: 'IN_PROGRESS' } }, { body: { status_code: 'IN_PROGRESS' } }]);
  await assert.rejects(() => stuck.api.waitForContainer('C', { attempts: 2, interval: 0 }), /still not ready after 2 checks/);
});

test('reads are retried when Instagram is briefly unwell', async () => {
  const { api, calls } = client([
    { status: 503, body: { error: { message: 'Service unavailable', code: 2 } } },
    { body: { id: '1', username: 'abandonedseafarers' } },
  ]);
  assert.equal((await api.account()).id, '1');
  assert.equal(calls.length, 2);
});

test('publishing is never retried: a second try would post the case twice', async () => {
  const { api, calls } = client([{ status: 500, body: { error: { message: 'oops', code: 1 } } }]);
  await assert.rejects(() => api.publish({ igUserId: '123', containerId: 'C' }), /answered HTTP 500/);
  assert.equal(calls.length, 1);
});

test('publishing sends the container id and gives back the media id', async () => {
  const { api, calls } = client([{ body: { id: 'MEDIA-9' } }]);
  assert.equal(await api.publish({ igUserId: '123', containerId: 'CONTAINER-1' }), 'MEDIA-9');
  assert.match(calls[0].url, /\/123\/media_publish$/);
  assert.equal(new URLSearchParams(calls[0].body).get('creation_id'), 'CONTAINER-1');
});

test('a dead token is not retried, and says so', async () => {
  const { api, calls } = client([{ status: 400, body: { error: { message: 'Invalid OAuth 2.0 Access Token', code: 190 } } }]);
  const err = await api.account().catch(e => e);
  assert.ok(err instanceof GraphError);
  assert.equal(err.code, 190);
  assert.ok(err.isExpiredToken);
  assert.equal(calls.length, 1);
});

test('listing the account\'s posts follows every page', async () => {
  const { api } = client([
    { body: { data: [{ id: '1' }, { id: '2' }], paging: { next: 'https://graph.instagram.com/next-page' } } },
    { body: { data: [{ id: '3' }] } },
  ]);
  assert.deepEqual((await api.listMedia()).map(m => m.id), ['1', '2', '3']);
});

test('refreshing the token hands back the new one', async () => {
  const { api, calls } = client([{ body: { access_token: 'NEW-TOKEN', token_type: 'bearer', expires_in: 5184000 } }]);
  const refreshed = await api.refreshToken();
  assert.equal(refreshed.access_token, 'NEW-TOKEN');
  assert.match(calls[0].url, /refresh_access_token\?grant_type=ig_refresh_token$/);
  const empty = client([{ body: {} }]);
  await assert.rejects(() => empty.api.refreshToken(), /returned no token/);
});
