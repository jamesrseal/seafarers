const test = require('node:test');
const assert = require('node:assert/strict');
const { parseUpdates, latestUpdate, circumstanceLines } = require('../src/parse');
const { bird16 } = require('../fixtures/ships');

test('updates come newest first, with the author line set aside', () => {
  const updates = parseUpdates(bird16.comments);
  assert.deepEqual(updates.map(u => u.dateLabel), ['15 June 2025', '14 April 2025']);
  assert.equal(updates[0].author, "International Transport Workers' Federation");
  assert.deepEqual(updates[0].lines, [
    'The 3 crew members who complained confirmed that they received their outstanding wages. 2 were repatriated and the other seafarers decided he wanted to remain no-board.',
    'Resolved.',
  ]);
});

test('orders by date, not by position in the text', () => {
  const comments = '2 March 2020: Panama\nOlder note here.\n\n9 May 2021: Other\nNewer note here.';
  assert.equal(latestUpdate(comments).dateLabel, '9 May 2021');
});

test('a date inside a sentence is not an update header', () => {
  const comments = '3 March 2024: Other\nFlag: UNKNOWN on IMO GISIS before 1 January 2022: Comoros\nCrew still on board.';
  const updates = parseUpdates(comments);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].dateLabel, '3 March 2024');
  assert.deepEqual(updates[0].lines, ['Crew still on board.']);
});

test('comments without a dated update have no updates', () => {
  assert.deepEqual(parseUpdates(''), []);
  assert.deepEqual(parseUpdates(null), []);
  assert.deepEqual(parseUpdates('International Maritime Organisation\n6 crew members have outstanding wages.'), []);
});

test('circumstances lose field lines and the indented rest of their values', () => {
  assert.deepEqual(
    circumstanceLines('Outstanding wages of 3 months\n\nSeafarers applied to insurer?: No \nInsurance certificate dates: 10/02/26 MLC REGULATION 2.5\n                                                  Nu. 20250579 VALID TO 10/02/26'),
    ['Outstanding wages of 3 months'],
  );
  assert.deepEqual(
    circumstanceLines("Flag: Unknown\n\nSeafarers unpaid since joining 13 months ago\n\nP&I/Financial security insurer: Shipowners' Club (reported by the ITF)\nSeafarers applied to insurer?: No \nInsurance certificate dates: TBC"),
    ['Seafarers unpaid since joining 13 months ago'],
  );
});
