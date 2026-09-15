const test = require('node:test');
const assert = require('node:assert/strict');
const { pickCase, seededRandom, parseSkipList } = require('../src/select');

const ships = [
  { abandonment_id: '1', ship_status: '' },
  { abandonment_id: '2', ship_status: 'disputed' },
  { abandonment_id: '3', ship_status: 'inactive' },
  { abandonment_id: '4', ship_status: 'resolved' },
];

test('Unresolved and Disputed cases are three times as likely', () => {
  const rng = seededRandom(42);
  const draws = 30000;
  const tally = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (let i = 0; i < draws; i++) tally[pickCase(ships, new Map(), { rng }).ship.abandonment_id]++;
  const expected = { 1: 3 / 8, 2: 3 / 8, 3: 1 / 8, 4: 1 / 8 };
  for (const id of Object.keys(tally)) {
    assert.ok(Math.abs(tally[id] / draws - expected[id]) < 0.01, `case ${id}: ${tally[id] / draws}`);
  }
});

test('nothing repeats until every case has been posted', () => {
  const pick = pickCase(ships, new Map([['1', 1], ['2', 1], ['3', 1]]), { rng: () => 0 });
  assert.equal(pick.ship.abandonment_id, '4');
  assert.deepEqual([pick.poolSize, pick.cycle], [1, 1]);

  const allPosted = new Map(ships.map(s => [s.abandonment_id, 1]));
  assert.deepEqual(pickCase(ships, allPosted, { rng: () => 0 }).cycle, 2);
  assert.equal(pickCase(ships, allPosted, { rng: () => 0 }).poolSize, 4);
});

test('a case added mid-cycle joins the current cycle', () => {
  const counts = new Map(ships.map(s => [s.abandonment_id, 1]));
  const pick = pickCase([...ships, { abandonment_id: '5', ship_status: 'resolved' }], counts, { rng: () => 0.99 });
  assert.equal(pick.ship.abandonment_id, '5');
});

test('skipped cases are never picked', () => {
  const skip = parseSkipList(' 1, 2 ,3,abc');
  assert.deepEqual([...skip], ['1', '2', '3']);
  for (const r of [0, 0.5, 0.999]) assert.equal(pickCase(ships, new Map(), { rng: () => r, skip }).ship.abandonment_id, '4');
  assert.throws(() => pickCase(ships, new Map(), { skip: new Set(['1', '2', '3', '4']) }), /no cases to pick/);
});

test('a seed makes the pick reproducible', () => {
  const a = pickCase(ships, new Map(), { rng: seededRandom(7) }).ship.abandonment_id;
  const b = pickCase(ships, new Map(), { rng: seededRandom(7) }).ship.abandonment_id;
  assert.equal(a, b);
});
