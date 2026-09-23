// The map panel on a case card: where the port sits on the world, and which
// OpenStreetMap tiles cover it.
//
// The panels are baked, not fetched. `scripts/bake-basemaps.js` writes one JPEG
// per port into `assets/basemaps/`, and the card draws that file. A card drawn
// from live tiles would call OpenStreetMap's servers on every cold request —
// Render's free plan has no persistent disk and the card cache is in memory, so
// every deploy empties it — and that is the automated use their tile policy
// asks clients not to make. Baked, a card needs no network at all, and a
// crawler's card can't be slower than the site.
//
// The baker and the card share this file so the picture and the dots drawn on
// it can't drift: the baker centres, sizes and zooms each panel by these
// numbers, and the card projects its markers with the same arithmetic. Change
// anything here and the committed panels are stale — re-bake them.
//
// JPEG, not WebP: resvg reads PNG and JPEG, and silently draws nothing for a
// WebP, which would empty the map without failing. PNG panels of map tiles run
// ~220KB against JPEG's ~45KB, which across every port is the difference
// between a repository that carries its basemaps and one that can't.

const fs = require('fs');
const path = require('path');

// A 472x514 window at zoom 9 is about 140km across: the port, its town and the
// coastline it sits on, which is what a share of one case should show.
const PANEL = { width: 472, height: 514, zoom: 9 };
const BASEMAP_DIR = path.join(__dirname, '../assets/basemaps');
const TILE = 256;

// Web Mercator, in pixels at a given zoom — the projection the tiles are cut on
// and the one the site's map uses.
const lonToX = (lon, zoom) => ((lon + 180) / 360) * TILE * 2 ** zoom;
const latToY = (lat, zoom) => {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * TILE * 2 ** zoom;
};

// Panels are keyed by their centre rounded to four decimals, about 11m. Two
// ports that round together share a panel, which is far below what a 140km
// window can show. The card projects from the rounded centre too, so a marker
// lands exactly where the baker put the middle of the picture.
const round = value => Number(value).toFixed(4);
const panelCentre = (lat, lon) => ({ lat: Number(round(lat)), lon: Number(round(lon)) });
const panelKey = (lat, lon) => `${round(lat)}_${round(lon)}`;
const panelFile = (lat, lon) => path.join(BASEMAP_DIR, `${panelKey(lat, lon)}.jpg`);

// A coordinate the card can draw. Empty and null are both "the ILO didn't say",
// and Number('') is 0 — a port in the Gulf of Guinea — so they are ruled out
// before the number is read.
const isCoord = value =>
  value !== null && value !== undefined && String(value).trim() !== '' && Number.isFinite(Number(value));
const hasCoords = ship => isCoord(ship?.port_latitude) && isCoord(ship?.port_longitude);

// The top-left of the panel in world pixels, from which everything projects.
function panelOrigin(lat, lon) {
  const centre = panelCentre(lat, lon);
  return {
    left: lonToX(centre.lon, PANEL.zoom) - PANEL.width / 2,
    top: latToY(centre.lat, PANEL.zoom) - PANEL.height / 2,
  };
}

// Where a case falls inside the panel. The panel's own port is the centre.
function project(lat, lon, origin) {
  return {
    x: lonToX(lon, PANEL.zoom) - origin.left,
    y: latToY(lat, PANEL.zoom) - origin.top,
  };
}

// The tiles covering one panel, each with the offset it is drawn at. x wraps
// around the antimeridian; y beyond the poles doesn't exist, so it is dropped
// and the sea beneath shows through.
function tilesFor(lat, lon) {
  const { left, top } = panelOrigin(lat, lon);
  const span = 2 ** PANEL.zoom;
  const tiles = [];
  for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + PANEL.width) / TILE); tx++) {
    for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + PANEL.height) / TILE); ty++) {
      if (ty < 0 || ty >= span) continue;
      tiles.push({
        z: PANEL.zoom,
        x: ((tx % span) + span) % span,
        y: ty,
        dx: tx * TILE - left,
        dy: ty * TILE - top,
      });
    }
  }
  return tiles;
}

// The baked picture for a port, or null when there isn't one — a port added by
// a refresh since the last bake, which the card draws without a map rather than
// not at all.
function readPanel(lat, lon) {
  const file = panelFile(lat, lon);
  try {
    return fs.readFileSync(file);
  } catch {
    return null;
  }
}

module.exports = {
  PANEL, TILE, BASEMAP_DIR,
  lonToX, latToY, panelCentre, panelKey, panelFile, panelOrigin, project, tilesFor,
  readPanel, hasCoords, isCoord,
};
