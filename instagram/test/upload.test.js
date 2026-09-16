const test = require('node:test');
const assert = require('node:assert/strict');
const { uploadCard, ensureRelease, assetName, RELEASE_TAG } = require('../src/upload');

// A stand-in for gh: records the commands, and fails the ones told to.
function fakeGh({ missingRelease = false, failUpload = false } = {}) {
  const calls = [];
  const run = (command, args) => {
    calls.push([command, ...args]);
    if (args[0] === 'release' && args[1] === 'view' && missingRelease) throw new Error('release not found');
    if (args[0] === 'release' && args[1] === 'upload' && failUpload) throw new Error('upload failed');
    return '';
  };
  return { run, calls };
}

const options = extra => ({ repo: 'jamesrseal/seafarers', caseId: '1820', date: '2026-09-16', ...extra });

test('the card is uploaded to the release and its public URL handed back', () => {
  const { run, calls } = fakeGh();
  const url = uploadCard('/tmp/card.jpg', options({ run }));
  assert.equal(url, `https://github.com/jamesrseal/seafarers/releases/download/${RELEASE_TAG}/case-1820-2026-09-16.jpg`);
  const upload = calls.find(c => c[2] === 'upload');
  assert.deepEqual(upload, ['gh', 'release', 'upload', RELEASE_TAG, '/tmp/card.jpg#case-1820-2026-09-16.jpg', '--clobber', '--repo', 'jamesrseal/seafarers']);
});

test('the release is made the first time and not again after that', () => {
  const missing = fakeGh({ missingRelease: true });
  uploadCard('/tmp/card.jpg', options({ run: missing.run }));
  assert.ok(missing.calls.some(c => c[1] === 'release' && c[2] === 'create'));

  const existing = fakeGh();
  uploadCard('/tmp/card.jpg', options({ run: existing.run }));
  assert.ok(!existing.calls.some(c => c[1] === 'release' && c[2] === 'create'));
});

test('an asset is named for its case and day, so a post can be matched to its image', () => {
  assert.equal(assetName('7', '2026-01-02'), 'case-7-2026-01-02.jpg');
});

test('a failed upload is raised rather than returning a URL that 404s', () => {
  const { run } = fakeGh({ failUpload: true });
  assert.throws(() => uploadCard('/tmp/card.jpg', options({ run })), /upload failed/);
});

test('uploading without knowing the repository is refused', () => {
  const { run } = fakeGh();
  assert.throws(() => uploadCard('/tmp/card.jpg', { caseId: '1', date: '2026-01-01', run }), /needs the repository/);
});

test('ensureRelease says whether it had to create one', () => {
  assert.equal(ensureRelease({ repo: 'a/b', tag: 't', run: fakeGh().run, log: () => {} }), false);
  assert.equal(ensureRelease({ repo: 'a/b', tag: 't', run: fakeGh({ missingRelease: true }).run, log: () => {} }), true);
});
