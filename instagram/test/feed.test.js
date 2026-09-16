const test = require('node:test');
const assert = require('node:assert/strict');
const { caseIdsInMedia, summarizeMedia, mediaTime } = require('../src/feed');

const media = (id, fields) => ({ id, permalink: `https://instagram.com/p/${id}`, ...fields });

test('a post names its case in the caption or the alt text', () => {
  assert.deepEqual(caseIdsInMedia(media('a', { caption: 'Brienz ... ILO case 1818 · abandonedseafarers.org' })), ['1818']);
  assert.deepEqual(caseIdsInMedia(media('b', { alt_text: 'ILO case 1820 · Card over a photograph of open sea.' })), ['1820']);
  assert.deepEqual(caseIdsInMedia(media('c', { caption: 'ILO case 7', alt_text: 'ILO case 7' })), ['7']);
  assert.deepEqual(caseIdsInMedia(media('d', { caption: 'a post with no case' })), []);
  assert.deepEqual(caseIdsInMedia(media('e', {})), []);
});

test('posting counts come from the account\'s own posts', () => {
  const now = new Date('2026-09-16T12:00:00Z');
  const { counts } = summarizeMedia([
    media('1', { caption: 'ILO case 100', timestamp: '2026-09-14T08:00:00+0000' }),
    media('2', { caption: 'ILO case 100', timestamp: '2026-09-15T08:00:00+0000' }),
    media('3', { caption: 'ILO case 200', timestamp: '2026-09-16T08:00:00+0000' }),
    media('4', { caption: 'a holiday photo', timestamp: '2026-09-16T09:00:00+0000' }),
  ], now);
  assert.equal(counts.get('100'), 2);
  assert.equal(counts.get('200'), 1);
  assert.equal(counts.size, 2);
});

test('a case posted today is found, by UTC day', () => {
  const now = new Date('2026-09-16T12:00:00Z');
  const { postedToday } = summarizeMedia([
    media('1', { caption: 'ILO case 100', timestamp: '2026-09-15T23:59:59+0000' }),
    media('2', { caption: 'ILO case 200', timestamp: '2026-09-16T00:00:01+0000' }),
  ], now);
  assert.deepEqual(postedToday.map(p => p.caseIds), [['200']]);
  assert.equal(postedToday[0].permalink, 'https://instagram.com/p/2');
});

test('Instagram\'s timestamp format is understood, and a broken one is not guessed at', () => {
  assert.equal(mediaTime({ timestamp: '2026-09-16T20:45:20+0000' }).toISOString(), '2026-09-16T20:45:20.000Z');
  assert.equal(mediaTime({ timestamp: '2026-09-16T20:45:20+0530' }).toISOString(), '2026-09-16T15:15:20.000Z');
  assert.equal(mediaTime({ timestamp: 'not a date' }), null);
  assert.equal(mediaTime({}), null);
});

test('a post whose time cannot be read still counts as posted', () => {
  const { counts, postedToday } = summarizeMedia(
    [media('1', { caption: 'ILO case 100', timestamp: 'nonsense' })],
    new Date('2026-09-16T12:00:00Z'),
  );
  assert.equal(counts.get('100'), 1);
  assert.deepEqual(postedToday, []);
});
