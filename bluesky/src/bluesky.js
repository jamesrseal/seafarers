// A minimal Bluesky (AT Protocol) client: six calls, plain fetch. The job holds
// the account's app password, so it carries no third-party packages.

const { BLUESKY_SERVICE, PLC_DIRECTORY } = require('./config');

const RETRY_DELAYS_MS = [1000, 4000, 10000];
const REQUEST_TIMEOUT_MS = 60 * 1000;

class HttpError extends Error {
  constructor(method, url, status, body, headers) {
    const detail = body && typeof body === 'object' ? body.message || body.error : body;
    super(`${method} ${url.split('?')[0]} answered HTTP ${status}${detail ? `: ${String(detail).slice(0, 200)}` : ''}`);
    this.status = status;
    this.body = body;
    this.headers = headers;
  }
}

const defaultSleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function createClient({ fetch = globalThis.fetch, sleep = defaultSleep, log = () => {} } = {}) {
  async function once(method, url, { headers, body } = {}) {
    const res = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    const text = await res.text();
    let data = text;
    try { data = text ? JSON.parse(text) : null; } catch { /* not JSON: keep the text */ }
    if (!res.ok) throw new HttpError(method, url, res.status, data, res.headers);
    return data;
  }

  function retryDelay(err, attempt) {
    const reset = Number(err.headers?.get?.('ratelimit-reset'));
    if (err.status === 429 && reset > 0) return Math.min(60 * 1000, Math.max(1000, reset * 1000 - Date.now()));
    return RETRY_DELAYS_MS[attempt];
  }

  // For reads and idempotent writes only. createRecord never comes through here:
  // retrying it blind can post the same case twice.
  async function withRetry(method, url, options) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await once(method, url, options);
      } catch (err) {
        const transient = !(err instanceof HttpError) || err.status === 429 || err.status >= 500;
        if (!transient || attempt >= RETRY_DELAYS_MS.length) throw err;
        const wait = retryDelay(err, attempt);
        log(`  ${err.message}; retrying in ${Math.round(wait / 1000)}s`);
        await sleep(wait);
      }
    }
  }

  const json = (body, headers = {}) => ({
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const bearer = session => ({ Authorization: `Bearer ${session.accessJwt}` });

  return {
    // The account's own server, where its records can be listed without logging in.
    async resolvePds(did) {
      const doc = await withRetry('GET', `${PLC_DIRECTORY}/${did}`);
      const service = (doc?.service || []).find(s => s.id === '#atproto_pds' || s.id === `${did}#atproto_pds`);
      if (!service?.serviceEndpoint) throw new Error(`no PDS listed for ${did} in the PLC directory`);
      return service.serviceEndpoint.replace(/\/+$/, '');
    },

    async listPosts(pds, did) {
      const records = [];
      let cursor;
      do {
        const query = new URLSearchParams({ repo: did, collection: 'app.bsky.feed.post', limit: '100' });
        if (cursor) query.set('cursor', cursor);
        const page = await withRetry('GET', `${pds}/xrpc/com.atproto.repo.listRecords?${query}`);
        const batch = page?.records || [];
        records.push(...batch);
        cursor = batch.length ? page.cursor : undefined;
      } while (cursor);
      return records;
    },

    async createSession(identifier, password) {
      try {
        return await withRetry('POST', `${BLUESKY_SERVICE}/xrpc/com.atproto.server.createSession`, json({ identifier, password }));
      } catch (err) {
        if (err.status === 400 || err.status === 401) {
          throw new Error(`Bluesky refused the login for ${identifier} (HTTP ${err.status}). Check the BLUESKY_HANDLE and BLUESKY_APP_PASSWORD secrets; an app password can be revoked in Bluesky's settings.`);
        }
        throw err;
      }
    },

    // Blobs are content-addressed, so an upload is safe to retry.
    async uploadBlob(session, bytes, mimeType) {
      const res = await withRetry('POST', `${BLUESKY_SERVICE}/xrpc/com.atproto.repo.uploadBlob`, {
        headers: { ...bearer(session), 'Content-Type': mimeType },
        body: bytes,
      });
      if (!res?.blob) throw new Error('uploadBlob returned no blob');
      return res.blob;
    },

    async createRecord(session, record) {
      return once('POST', `${BLUESKY_SERVICE}/xrpc/com.atproto.repo.createRecord`,
        json({ repo: session.did, collection: 'app.bsky.feed.post', record }, bearer(session)));
    },
  };
}

module.exports = { createClient, HttpError, RETRY_DELAYS_MS };
