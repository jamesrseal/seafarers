const path = require('path');

const SITE_ORIGIN = 'https://abandonedseafarers.org';

// The account is pinned by DID, not handle: a handle can be changed or taken
// over, a DID cannot. Reads of past posts and the post-login check both use it.
const ACCOUNT_DID = 'did:plc:m7zefvpmn2z7og6rhyvi2ms6';
const BLUESKY_SERVICE = 'https://bsky.social';
const PLC_DIRECTORY = 'https://plc.directory';

// app.bsky.feed.post: text maxGraphemes 300, maxLength 3000 (bytes).
const POST_MAX_GRAPHEMES = 300;
const POST_MAX_BYTES = 3000;
const QUOTE_MAX_GRAPHEMES = 200;

// The committed database holds ~1,800 cases. Far fewer means a truncated or
// broken file, and posting from it would misrepresent the record.
const MIN_CASES = 1000;

const REPO_ROOT = path.join(__dirname, '..', '..');
const DEFAULT_DB_PATH = path.join(REPO_ROOT, 'backend', 'data', 'seafarers.db');
const THUMB_PATH = path.join(REPO_ROOT, 'frontend', 'public', 'og-image.png');

// Hidden hashtags (the record's `tags`): discoverable in search, cost no text.
const TAGS = ['seafarers', 'maritime', 'shipping'];

function siteCaseUrl(id) {
  return `${SITE_ORIGIN}/?ship=${id}`;
}

function iloUrlPattern(id) {
  return new RegExp(`^https://wwwex\\.ilo\\.org/dyn/r/abandonment/seafarers/details\\?p3_abandonment_id=${id}$`);
}

module.exports = {
  SITE_ORIGIN,
  ACCOUNT_DID,
  BLUESKY_SERVICE,
  PLC_DIRECTORY,
  POST_MAX_GRAPHEMES,
  POST_MAX_BYTES,
  QUOTE_MAX_GRAPHEMES,
  MIN_CASES,
  REPO_ROOT,
  DEFAULT_DB_PATH,
  THUMB_PATH,
  TAGS,
  siteCaseUrl,
  iloUrlPattern,
};
