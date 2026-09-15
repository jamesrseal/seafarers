const test = require('node:test');
const assert = require('node:assert/strict');
const { caseIdsInPost, summarizePosts, postWebUrl } = require('../src/feed');

const card = uri => ({ embed: { $type: 'app.bsky.embed.external', external: { uri } } });
const linkFacet = uri => ({ facets: [{ index: { byteStart: 0, byteEnd: 1 }, features: [{ $type: 'app.bsky.richtext.facet#link', uri }] }] });
const record = (rkey, createdAt, value = {}) => ({
  uri: `at://did:plc:m7zefvpmn2z7og6rhyvi2ms6/app.bsky.feed.post/${rkey}`,
  cid: `cid-${rkey}`,
  value: { $type: 'app.bsky.feed.post', text: '', createdAt, ...value },
});

test('reads case IDs from link cards and link facets', () => {
  assert.deepEqual(caseIdsInPost(card('https://abandonedseafarers.org/?ship=1821')), ['1821']);
  assert.deepEqual(caseIdsInPost(linkFacet('https://www.abandonedseafarers.org/?view=table&ship=12')), ['12']);
  assert.deepEqual(caseIdsInPost({ embed: { media: { external: { uri: 'https://abandonedseafarers.org/?ship=7' } } } }), ['7']);
  assert.deepEqual(caseIdsInPost({ ...card('https://abandonedseafarers.org/?ship=5'), ...linkFacet('https://abandonedseafarers.org/?ship=5') }), ['5']);
});

test('ignores links that are not a case on the site', () => {
  assert.deepEqual(caseIdsInPost(card('https://example.org/?ship=5')), []);
  assert.deepEqual(caseIdsInPost(card('https://abandonedseafarers.org/?ship=abc')), []);
  assert.deepEqual(caseIdsInPost(card('https://abandonedseafarers.org/?view=table')), []);
  assert.deepEqual(caseIdsInPost(card('not a url')), []);
  assert.deepEqual(caseIdsInPost({ text: 'A post written by hand' }), []);
});

test('counts posts per case, and finds today\'s by UTC date', () => {
  const records = [
    record('a', '2026-09-15T00:05:00.000Z', card('https://abandonedseafarers.org/?ship=1821')),
    record('b', '2026-09-14T23:59:00.000Z', card('https://abandonedseafarers.org/?ship=1306')),
    record('c', '2026-09-15T10:00:00.000Z', { text: 'Hand-written, no case link' }),
    record('d', '2026-09-15T01:00:00+05:00', card('https://abandonedseafarers.org/?ship=1821')), // 20:00 UTC on the 14th
  ];
  const { counts, postedToday } = summarizePosts(records, new Date('2026-09-15T13:41:00Z'));
  assert.deepEqual([...counts], [['1821', 2], ['1306', 1]]);
  assert.deepEqual(postedToday, [{ uri: records[0].uri, createdAt: '2026-09-15T00:05:00.000Z', caseIds: ['1821'] }]);
});

test('turns a post\'s at:// URI into its bsky.app address', () => {
  assert.equal(
    postWebUrl('at://did:plc:m7zefvpmn2z7og6rhyvi2ms6/app.bsky.feed.post/3kabc'),
    'https://bsky.app/profile/did:plc:m7zefvpmn2z7og6rhyvi2ms6/post/3kabc',
  );
});
