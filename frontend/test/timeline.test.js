import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  abandonmentMonth, buildTimeline, visibleAt, ageStyle, summaryAt, monthIndex, monthLabel, AGE_STYLES,
} from '../src/utils/timeline.js';

const at = { port_latitude: 1, port_longitude: 2 };
const ship = (id, abandonment_date, fields = {}) => ({ abandonment_id: id, abandonment_date, num_seafarers: 10, ...at, ...fields });

test('the abandonment month comes from a day, a month or a year alone', () => {
  assert.equal(abandonmentMonth(ship('1', '2 July 2014')), monthIndex(2014, 6));
  assert.equal(abandonmentMonth(ship('2', 'September 2010')), monthIndex(2010, 8));
  assert.equal(abandonmentMonth(ship('3', '2009')), monthIndex(2009, 0), 'a year alone is its January');
  assert.equal(abandonmentMonth(ship('4', '')), null);
  assert.equal(abandonmentMonth(ship('5', null)), null);
  assert.equal(monthLabel(monthIndex(2023, 5)), 'June 2023');
});

const now = new Date(Date.UTC(2026, 10, 24));
const timeline = buildTimeline([
  ship('a', '15 March 2025', { num_seafarers: 20 }),
  ship('b', '1 January 2024'),
  ship('c', 'March 2025', { num_seafarers: '5' }),
  ship('d', '1 February 2026'),
  ship('e', ''),
  ship('f', '1 May 2025', { port_latitude: null }),
], now);

test('the months run from the first case to the current month, counting only what can be mapped', () => {
  assert.equal(timeline.first, monthIndex(2024, 0));
  assert.equal(timeline.last, monthIndex(2026, 10));
  assert.equal(timeline.perMonth.length, 35);
  assert.equal(timeline.perMonth[monthIndex(2025, 2) - timeline.first], 2);
  assert.equal(timeline.perMonth.reduce((a, b) => a + b, 0), 4);
  assert.equal(timeline.undated, 1);
  assert.equal(timeline.unmapped, 1);
  assert.deepEqual(timeline.items.map(i => i.ship.abandonment_id), ['b', 'a', 'c', 'd'], 'sorted by month');
});

test('"all" shows every case abandoned by the month, and none after it', () => {
  const ids = m => visibleAt(timeline, m, 'all').map(i => i.ship.abandonment_id);
  assert.deepEqual(ids(monthIndex(2023, 11)), []);
  assert.deepEqual(ids(monthIndex(2025, 1)), ['b']);
  assert.deepEqual(ids(monthIndex(2025, 2)), ['b', 'a', 'c'], 'a case in the month itself is in');
  assert.deepEqual(ids(monthIndex(2026, 10)), ['b', 'a', 'c', 'd']);
});

test('"window" shows only the 12 months up to the month', () => {
  const ids = m => visibleAt(timeline, m, 'window').map(i => i.ship.abandonment_id);
  assert.deepEqual(ids(monthIndex(2024, 11)), ['b'], 'January is the 12th month back from December');
  assert.deepEqual(ids(monthIndex(2025, 0)), [], '13 months on, it has dropped out');
  assert.deepEqual(ids(monthIndex(2026, 1)), ['a', 'c', 'd']);
});

test('a case is ringed in its own month, full for a year, then faded', () => {
  assert.equal(ageStyle(0).weight, AGE_STYLES[0].weight);
  assert.equal(ageStyle(1).fillOpacity, AGE_STYLES[1].fillOpacity);
  assert.equal(ageStyle(11).fillOpacity, AGE_STYLES[1].fillOpacity);
  assert.equal(ageStyle(12).fillOpacity, AGE_STYLES[2].fillOpacity);
});

test('the readout counts cases, seafarers and the month\'s own cases', () => {
  assert.deepEqual(summaryAt(timeline, monthIndex(2025, 2), 'all'), { cases: 3, seafarers: 35, thisMonth: 2 });
  assert.deepEqual(summaryAt(timeline, monthIndex(2026, 1), 'window'), { cases: 3, seafarers: 35, thisMonth: 1 });
});
