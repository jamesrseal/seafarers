// The caption and alt text for the Instagram post.
//
// Both are the Bluesky post's own text, unchanged, with one exception: that
// text ends "Status: <label> · ILO record", where "ILO record" is a link. A
// caption cannot carry a link — Instagram renders URLs as plain text — so the
// dead link text comes off and the closing line below goes on instead.
//
// Everything added here is in CAPTION_LITERALS or is a record field. Nothing
// states an outcome or a timeline, the same rule compose.js and verify.js hold
// the post to.
//
// The alt text is also where the case ID lives for reading back later: the
// poster keeps no state of its own and works out what it has already posted
// from the account's own posts, so each post has to say which case it is.

const { splitBlocks, headerParts } = require('./card');

// Instagram's limits on a feed post's caption and an image's alt text.
const CAPTION_MAX = 2200;
const ALT_TEXT_MAX = 1000;
const HASHTAG_MAX = 30;

// The text compose.js puts at the end for the link to the ILO record.
const ILO_LINK_TAIL = ' · ILO record';

const CAPTION_LITERALS = Object.freeze({
  casePrefix: 'ILO case ',
  separator: ' · ',
  site: 'abandonedseafarers.org — link in bio',
  altPrefix: 'Card over a photograph of open sea. ',
  hashtags: ['#seafarers', '#maritime', '#shipping', '#abandonment'],
});

// The post minus the link text, which would read as a dangling label.
function postTextWithoutLink(draft) {
  return draft.text.endsWith(ILO_LINK_TAIL) ? draft.text.slice(0, -ILO_LINK_TAIL.length) : draft.text;
}

function caseLine(draft) {
  return `${CAPTION_LITERALS.casePrefix}${draft.caseId}${CAPTION_LITERALS.separator}${CAPTION_LITERALS.site}`;
}

function buildCaption(draft) {
  const caption = [
    postTextWithoutLink(draft),
    caseLine(draft),
    CAPTION_LITERALS.hashtags.join(' '),
  ].join('\n\n');

  if (caption.length > CAPTION_MAX) {
    throw new Error(`case ${draft.caseId}: caption is ${caption.length} characters, over Instagram's ${CAPTION_MAX}`);
  }
  const hashtags = caption.match(/#[^\s#]+/g) ?? [];
  if (hashtags.length > HASHTAG_MAX) {
    throw new Error(`case ${draft.caseId}: ${hashtags.length} hashtags, over Instagram's ${HASHTAG_MAX}`);
  }
  return caption;
}

// What the card shows, for anyone who can't see it: the same sentence, and the
// ship, flag and status the card sets in larger type.
function buildAltText(draft) {
  const header = headerParts(splitBlocks(draft.segments)[0]);
  const alt = `${CAPTION_LITERALS.casePrefix}${draft.caseId}${CAPTION_LITERALS.separator}`
    + `${CAPTION_LITERALS.altPrefix}${postTextWithoutLink(draft).replace(/\n+/g, ' ')}`;
  const trimmed = alt.length > ALT_TEXT_MAX ? `${alt.slice(0, ALT_TEXT_MAX - 1).trimEnd()}…` : alt;
  return { text: trimmed, shipName: header.shipName };
}

// Every case a post says it is about. Used to read back which cases the
// account has already posted, from its own captions and alt text.
function caseIdsInText(text) {
  const ids = new Set();
  for (const m of String(text ?? '').matchAll(/\bILO case (\d{1,7})\b/g)) ids.add(m[1]);
  return [...ids];
}

module.exports = {
  buildCaption, buildAltText, caseIdsInText, postTextWithoutLink,
  CAPTION_LITERALS, CAPTION_MAX, ALT_TEXT_MAX, HASHTAG_MAX, ILO_LINK_TAIL,
};
