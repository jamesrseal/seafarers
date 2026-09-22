// Cases are placed at their port, not at the ship, so they pile up: 74% of the
// mapped cases share a coordinate with another case, and Sharjah alone holds 53.
// A stack like that shows one dot and there is no way to reach the cases under
// it. Zoomed in, the group is spread around its coordinate instead — a ring for
// a few, a spiral for many — the way gpspix does it:
// https://github.com/Matthias-Wandel/gpspix
//
// The offsets are in screen pixels, so the shape holds as the map zooms, and
// they mean nothing geographically: the port is what the data locates, so the
// spread only appears once the map is close enough for it to read as "around
// this port" rather than as a position of its own.

// A group is spread from this zoom up. Lower than this and a ring of 40px would
// carry a case hundreds of kilometres from the port it was abandoned in.
export const JITTER_FROM_ZOOM = 8;

const GAP = 3;        // px of clear water between neighbouring circles
const MAX_SPREAD = 110; // px: beyond this the group reads as scattered, not stacked

// Where to put each marker of a group, as [dx, dy] pixel offsets from the
// coordinate they share. `radii` are the markers' own radii, in pixels.
export function spreadOffsets(radii) {
  const count = radii.length;
  if (count < 2) return radii.map(() => [0, 0]);

  const biggest = Math.max(...radii);
  const step = (2 * (radii.reduce((sum, r) => sum + r, 0) / count)) + GAP;

  // A few: a ring, with one left in the middle once the ring is crowded enough
  // to have room for it (gpspix keeps the last one centred from six up).
  if (count <= 10) {
    const onRing = count >= 6 ? count - 1 : count;
    // Wide enough that neighbours don't touch — the distance between them is the
    // chord, not the arc, which for two or three is much the shorter — and that
    // the centre one doesn't touch the ring either.
    const radius = Math.min(
      MAX_SPREAD,
      Math.max(step / (2 * Math.sin(Math.PI / onRing)), count >= 6 ? biggest * 2 + GAP : 0),
    );
    return radii.map((_, i) => {
      if (i >= onRing) return [0, 0];
      const angle = ((i + 0.5) / onRing) * 2 * Math.PI;
      return [Math.cos(angle) * radius, Math.sin(angle) * radius];
    });
  }

  // Many: a Fermat spiral, which packs them evenly and grows slowly.
  const spacing = Math.min(step, MAX_SPREAD / Math.sqrt(count + 1.5));
  return radii.map((_, i) => {
    const rad = Math.sqrt(i + 1.5);
    const theta = 4 * rad;
    return [Math.cos(theta) * rad * spacing, Math.sin(theta) * rad * spacing];
  });
}

// Coordinates are rounded to about 11m before grouping: 44 pairs of ports are
// geocoded within 500m of each other, some a metre or two apart — the same quay
// under two names — and those stack as surely as exact duplicates. Ports further
// apart than that keep their own positions and separate as the map zooms, which
// is the honest answer: only cases the data puts in one place get moved.
const KEY_DECIMALS = 4;

// Everything at one coordinate, keyed by that coordinate. Insertion order is
// kept, so a case lands in the same place on every render.
export function groupByCoordinate(ships) {
  const groups = new Map();
  for (const ship of ships) {
    const key = `${ship.port_latitude.toFixed(KEY_DECIMALS)},${ship.port_longitude.toFixed(KEY_DECIMALS)}`;
    const group = groups.get(key);
    if (group) group.push(ship);
    else groups.set(key, [ship]);
  }
  return groups;
}
