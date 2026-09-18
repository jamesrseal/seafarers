// A stand-in for fetch: routes are [test(url, init), respond(url, init, n)],
// where n counts calls to that route. Every call is recorded.

function response(status, body, headers = {}) {
  // A Uint8Array body is binary (the case card); everything else is text.
  const bytes = body instanceof Uint8Array ? body : null;
  const text = bytes ? '' : body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    text: async () => text,
    json: async () => JSON.parse(text),
    arrayBuffer: async () => (bytes || new TextEncoder().encode(text)).buffer,
  };
}

function fakeFetch(routes) {
  const calls = [];
  const counts = new Map();
  const fetch = async (url, init = {}) => {
    calls.push({ url, init });
    const index = routes.findIndex(([matches]) => matches(url, init));
    if (index === -1) throw new Error(`unexpected request: ${init.method || 'GET'} ${url}`);
    const n = (counts.get(index) || 0) + 1;
    counts.set(index, n);
    return routes[index][1](url, init, n);
  };
  return { fetch, calls };
}

module.exports = { response, fakeFetch };
