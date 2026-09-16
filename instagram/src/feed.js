// Which cases the account has already posted, read back from its own posts.
// That is the only state the poster has, the same as the Bluesky one: nothing
// is written to the repo, because a commit to master redeploys the site.
//
// Instagram has no per-post metadata field, so a post says which case it is in
// words: the caption carries "ILO case <id>", and so does the image's alt text.
// Either will do, so a caption edited by hand doesn't lose the post's identity.

const { caseIdsInText } = require('./caption');

// Instagram timestamps look like 2026-09-16T20:45:20+0000. Date.parse handles
// the offset without a colon on Node, but not everywhere, so it is normalised.
function mediaTime(media) {
  const raw = String(media?.timestamp ?? '').replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  const time = new Date(raw);
  return Number.isNaN(time.getTime()) ? null : time;
}

// Every case a post says it is about, from its caption and its alt text.
function caseIdsInMedia(media) {
  return [...new Set([
    ...caseIdsInText(media?.caption),
    ...caseIdsInText(media?.alt_text),
  ])];
}

// media: entries from GET /me/media ({ id, caption, alt_text, permalink, timestamp }).
function summarizeMedia(media, now) {
  const counts = new Map();
  const postedToday = [];
  const today = now.toISOString().slice(0, 10);
  for (const item of media) {
    const ids = caseIdsInMedia(item);
    if (!ids.length) continue;
    for (const id of ids) counts.set(id, (counts.get(id) || 0) + 1);
    const time = mediaTime(item);
    if (time && time.toISOString().slice(0, 10) === today) {
      postedToday.push({ id: item.id, permalink: item.permalink, timestamp: item.timestamp, caseIds: ids });
    }
  }
  return { counts, postedToday };
}

module.exports = { caseIdsInMedia, summarizeMedia, mediaTime };
