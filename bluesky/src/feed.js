// Which cases the account has already posted, read back from its own posts.
// That is the only state the poster has: nothing is written to the repo,
// because a commit to master redeploys the site.

const SITE_HOSTS = new Set(['abandonedseafarers.org', 'www.abandonedseafarers.org']);

// Case IDs a post links to, from its link card and its link facets. A post the
// owner writes by hand counts only if it links to a case (?ship=<id>).
function caseIdsInPost(post) {
  const uris = [];
  const embed = post?.embed;
  if (embed?.external?.uri) uris.push(embed.external.uri);
  if (embed?.media?.external?.uri) uris.push(embed.media.external.uri);
  for (const facet of post?.facets || []) {
    for (const feature of facet.features || []) if (feature.uri) uris.push(feature.uri);
  }

  const ids = new Set();
  for (const uri of uris) {
    let url;
    try { url = new URL(uri); } catch { continue; }
    const ship = url.searchParams.get('ship');
    if (SITE_HOSTS.has(url.hostname) && /^\d+$/.test(ship || '')) ids.add(ship);
  }
  return [...ids];
}

// records: com.atproto.repo.listRecords entries ({ uri, cid, value }).
function summarizePosts(records, now) {
  const counts = new Map();
  const postedToday = [];
  const today = now.toISOString().slice(0, 10);
  for (const record of records) {
    const ids = caseIdsInPost(record.value);
    if (!ids.length) continue;
    for (const id of ids) counts.set(id, (counts.get(id) || 0) + 1);
    const created = new Date(record.value.createdAt);
    if (!Number.isNaN(created.getTime()) && created.toISOString().slice(0, 10) === today) {
      postedToday.push({ uri: record.uri, createdAt: record.value.createdAt, caseIds: ids });
    }
  }
  return { counts, postedToday };
}

// at://did:plc:…/app.bsky.feed.post/<rkey> -> https://bsky.app/profile/did:plc:…/post/<rkey>
function postWebUrl(atUri) {
  const m = /^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/.exec(atUri || '');
  return m ? `https://bsky.app/profile/${m[1]}/post/${m[2]}` : atUri;
}

module.exports = { caseIdsInPost, summarizePosts, postWebUrl };
