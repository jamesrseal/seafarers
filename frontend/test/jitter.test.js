import test from 'node:test';
import assert from 'node:assert/strict';
import { spreadOffsets, groupByCoordinate } from '../src/utils/jitter.js';

const distance = ([ax, ay], [bx, by]) => Math.hypot(ax - bx, ay - by);
const ship = (id, lat, lng) => ({ abandonment_id: id, port_latitude: lat, port_longitude: lng });

test('a case on its own is left where it is', () => {
  assert.deepEqual(spreadOffsets([8]), [[0, 0]]);
  assert.deepEqual(spreadOffsets([]), []);
});

test('a few cases ring their coordinate without touching each other', () => {
  for (const count of [2, 3, 4, 5]) {
    const radii = Array(count).fill(9);
    const offsets = spreadOffsets(radii);
    assert.equal(offsets.length, count);
    const spread = offsets.map(o => distance(o, [0, 0]));
    assert.ok(Math.max(...spread) - Math.min(...spread) < 0.001, `${count}: all the same distance out`);
    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count; j++) {
        assert.ok(distance(offsets[i], offsets[j]) >= 18, `${count}: circles ${i} and ${j} clear each other`);
      }
    }
  }
});

test('from six up, one case stays in the middle of the ring', () => {
  const offsets = spreadOffsets(Array(8).fill(9));
  const centred = offsets.filter(o => o[0] === 0 && o[1] === 0);
  assert.equal(centred.length, 1);
  // And the ring is wide enough not to sit on top of it.
  for (const offset of offsets.filter(o => o[0] || o[1])) {
    assert.ok(distance(offset, [0, 0]) >= 18 + 3, 'the ring clears the centred circle');
  }
});

test('a crowd spirals outwards, and stays within reach of its port', () => {
  const offsets = spreadOffsets(Array(53).fill(9));
  assert.equal(offsets.length, 53);
  const spread = offsets.map(o => distance(o, [0, 0]));
  assert.ok(spread[0] < spread.at(-1), 'it grows outwards');
  assert.ok(Math.max(...spread) <= 110, 'and is capped, so the group still reads as one port');
  // No two cases land on each other.
  for (let i = 0; i < offsets.length; i++) {
    for (let j = i + 1; j < offsets.length; j++) {
      assert.ok(distance(offsets[i], offsets[j]) > 1, `${i} and ${j} are distinguishable`);
    }
  }
});

test('bigger circles are pushed further apart than small ones', () => {
  const small = spreadOffsets(Array(6).fill(5));
  const large = spreadOffsets(Array(6).fill(22));
  assert.ok(distance(large[0], [0, 0]) > distance(small[0], [0, 0]));
});

test('cases are grouped by the coordinate they share, keeping their order', () => {
  const groups = groupByCoordinate([
    ship('1', 25.3, 55.4), ship('2', 1.2, 103.8), ship('3', 25.3, 55.4), ship('4', 25.3, 55.4),
  ]);
  assert.deepEqual([...groups.keys()], ['25.3000,55.4000', '1.2000,103.8000']);
  assert.deepEqual(groups.get('25.3000,55.4000').map(s => s.abandonment_id), ['1', '3', '4']);
  assert.deepEqual(groups.get('1.2000,103.8000').map(s => s.abandonment_id), ['2']);
});

test('ports geocoded a couple of metres apart count as one stack, further apart do not', () => {
  const metres = d => d / 111320;
  const together = groupByCoordinate([ship('1', 25.3, 55.4), ship('2', 25.3 + metres(2), 55.4)]);
  assert.equal(together.size, 1, 'two metres apart is the same quay');
  const apart = groupByCoordinate([ship('1', 25.3, 55.4), ship('2', 25.3 + metres(400), 55.4)]);
  assert.equal(apart.size, 2, 'four hundred metres apart are two places');
});
