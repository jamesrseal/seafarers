// Instagram fetches the image itself, from a URL that has to be reachable by
// anyone, so the card has to be somewhere public before the post can be made.
//
// That somewhere is a GitHub release on this repo. Releases serve their assets
// publicly from a public repo, which keeps the card:
//   - off the site, because Render's free instances sleep and a cold start
//     could outrun Meta's fetch, which fails the post;
//   - out of master, because a commit there redeploys the site.
//
// Assets accumulate under one release rather than one per day, and each is
// named for the case and the date, so the post and its image can be matched up
// afterwards.

const { execFileSync } = require('child_process');
const path = require('path');

const RELEASE_TAG = 'instagram-cards';
const RELEASE_TITLE = 'Instagram cards';
const RELEASE_NOTES = 'Card images for posts to @abandonedseafarers. Uploaded by the daily job; not a software release.';

function defaultRun(command, args) {
  return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

// gh exits non-zero when the release is missing, which is the only way to ask.
function ensureRelease({ repo, tag, run, log }) {
  try {
    run('gh', ['release', 'view', tag, '--repo', repo, '--json', 'tagName']);
    return false;
  } catch {
    log(`Release ${tag} does not exist yet; creating it.`);
    run('gh', ['release', 'create', tag, '--repo', repo, '--title', RELEASE_TITLE, '--notes', RELEASE_NOTES]);
    return true;
  }
}

function assetName(caseId, date) {
  return `case-${caseId}-${date}.jpg`;
}

// Returns the URL Instagram will fetch. --clobber so a re-run of the same day
// replaces its own asset instead of failing.
function uploadCard(file, { repo, caseId, date, tag = RELEASE_TAG, run = defaultRun, log = () => {} }) {
  if (!repo) throw new Error('uploading the card needs the repository, as owner/name');
  const name = assetName(caseId, date);
  const created = ensureRelease({ repo, tag, run, log });
  run('gh', ['release', 'upload', tag, `${file}#${name}`, '--clobber', '--repo', repo]);
  const url = `https://github.com/${repo}/releases/download/${tag}/${name}`;
  log(`Card uploaded${created ? ' to a new release' : ''}: ${url}`);
  return url;
}

module.exports = { uploadCard, ensureRelease, assetName, RELEASE_TAG, defaultRun };
