// A minimal Instagram Graph client: the handful of calls the poster needs, on
// plain fetch, so this carries no third-party packages either. It follows
// bluesky/src/bluesky.js — same retry rules, same error shape — with one
// difference that matters: publishing is never retried blind, because a
// repeated publish is a second post of the same case.
//
// The token goes in the Authorization header rather than the query string, so
// it cannot end up in a logged URL.

const { GRAPH_HOST, GRAPH_VERSION, CONTAINER_POLL_MS, CONTAINER_POLL_ATTEMPTS } = require('./config');

const RETRY_DELAYS_MS = [1000, 4000, 10000];
const REQUEST_TIMEOUT_MS = 60 * 1000;

// Meta's errors come back as { error: { message, type, code, error_subcode } }.
class GraphError extends Error {
  constructor(method, url, status, body) {
    const error = body && typeof body === 'object' ? body.error : null;
    const detail = error?.message || (typeof body === 'string' ? body.slice(0, 200) : '');
    super(`${method} ${url.split('?')[0]} answered HTTP ${status}${detail ? `: ${detail}` : ''}`);
    this.status = status;
    this.body = body;
    this.code = error?.code;
    this.subcode = error?.error_subcode;
  }

  // 190 is the one worth naming: the token died and no retry will fix it.
  get isExpiredToken() {
    return this.code === 190;
  }
}

const defaultSleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function createClient({ fetch = globalThis.fetch, sleep = defaultSleep, log = () => {}, token } = {}) {
  if (!token) throw new Error('an Instagram access token is required');
  const base = `${GRAPH_HOST}/${GRAPH_VERSION}`;
  const auth = { Authorization: `Bearer ${token}` };

  async function once(method, url, { headers, body } = {}) {
    const res = await fetch(url, {
      method,
      headers: { ...auth, ...headers },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const text = await res.text();
    let data = text;
    try { data = text ? JSON.parse(text) : null; } catch { /* not JSON: keep the text */ }
    if (!res.ok) throw new GraphError(method, url, res.status, data);
    return data;
  }

  // For reads and for creating a container, which is safe to repeat: a spare
  // container is never published and expires on its own after 24 hours.
  async function withRetry(method, url, options) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await once(method, url, options);
      } catch (err) {
        const transient = !(err instanceof GraphError) || err.status === 429 || err.status >= 500;
        if (!transient || err.isExpiredToken || attempt >= RETRY_DELAYS_MS.length) throw err;
        const wait = RETRY_DELAYS_MS[attempt];
        log(`  ${err.message}; retrying in ${wait / 1000}s`);
        await sleep(wait);
      }
    }
  }

  const form = params => ({
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });

  return {
    // Which account this token actually posts as. Checked before publishing,
    // the way the Bluesky poster checks the DID it logged in as.
    async account() {
      return withRetry('GET', `${base}/me?fields=id,username`);
    },

    // Instagram fetches the image itself, so imageUrl has to be reachable by
    // anyone, with no login and no redirect games, until the container is made.
    async createContainer({ igUserId, imageUrl, caption, altText }) {
      const params = { image_url: imageUrl };
      if (caption) params.caption = caption;
      if (altText) params.alt_text = altText;
      const created = await withRetry('POST', `${base}/${igUserId}/media`, form(params));
      if (!created?.id) throw new Error('creating the media container returned no id');
      return created.id;
    },

    async containerStatus(containerId) {
      return withRetry('GET', `${base}/${containerId}?fields=status_code,status`);
    },

    // An image container is usually ready at once; Meta's guidance is to poll
    // rather than assume. EXPIRED and ERROR are final: make a new container.
    async waitForContainer(containerId, { attempts = CONTAINER_POLL_ATTEMPTS, interval = CONTAINER_POLL_MS } = {}) {
      for (let attempt = 1; attempt <= attempts; attempt++) {
        const { status_code: code, status } = await this.containerStatus(containerId);
        if (code === 'FINISHED' || code === 'PUBLISHED') return code;
        if (code === 'ERROR' || code === 'EXPIRED') {
          throw new Error(`the image container is ${code}${status ? `: ${status}` : ''}`);
        }
        log(`  container ${containerId} is ${code || 'pending'} (${attempt}/${attempts})`);
        await sleep(interval);
      }
      throw new Error(`the image container was still not ready after ${attempts} checks`);
    },

    // Never retried here: see publishOnce in post.js, which looks for the post
    // before trying again.
    async publish({ igUserId, containerId }) {
      const published = await once('POST', `${base}/${igUserId}/media_publish`, form({ creation_id: containerId }));
      if (!published?.id) throw new Error('publishing returned no media id');
      return published.id;
    },

    // The account's own posts, newest first, followed through every page.
    // maxPages stops early: checking whether a post just landed only needs the
    // newest page, not the account's whole history.
    async listMedia({ limit = 100, maxPages = Infinity } = {}) {
      const fields = 'id,caption,alt_text,permalink,timestamp,media_type';
      let url = `${base}/me/media?fields=${fields}&limit=${limit}`;
      const media = [];
      for (let page = 0; url && page < maxPages; page++) {
        const answer = await withRetry('GET', url);
        media.push(...(answer?.data || []));
        url = answer?.paging?.next || null;
      }
      return media;
    },

    // One post, for the link to it once it is published.
    async media(id, fields = 'id,permalink,timestamp') {
      return withRetry('GET', `${base}/${id}?fields=${fields}`);
    },

    // How many of the day's posts are already used, from Instagram itself
    // rather than from a number copied out of the documentation.
    async publishingLimit(igUserId) {
      return withRetry('GET', `${base}/${igUserId}/content_publishing_limit?fields=config,quota_usage`);
    },

    // A long-lived token lasts 60 days and can be refreshed indefinitely, but
    // only while it is still alive and at least 24 hours old.
    async refreshToken() {
      const refreshed = await withRetry('GET', `${GRAPH_HOST}/refresh_access_token?grant_type=ig_refresh_token`);
      if (!refreshed?.access_token) throw new Error('refreshing the token returned no token');
      return refreshed;
    },
  };
}

module.exports = { createClient, GraphError, RETRY_DELAYS_MS };
