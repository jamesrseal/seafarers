const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { queryLatestShips } = require('../src/load');
const { REPO_ROOT } = require('../src/config');

const iloUrl = id => `https://wwwex.ilo.org/dyn/r/abandonment/seafarers/details?p3_abandonment_id=${id}`;

test('reads the latest row of each case, and leaves out rows a post cannot use', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.join(REPO_ROOT, 'backend', 'src', 'db', 'schema.sql'), 'utf8'));
  const insert = db.prepare('INSERT INTO ships (abandonment_id, scraped_at, ship_name, ship_status, ilo_url, num_seafarers) VALUES (?, ?, ?, ?, ?, ?)');
  insert.run('1821', '2026-01-01T00:00:00.000Z', 'Nikolay Meshkov', '', iloUrl(1821), 12);
  insert.run('1821', '2026-09-14T17:53:37.142Z', 'Nikolay Meshkov', 'resolved', iloUrl(1821), 13);
  insert.run('7', '2026-09-14T17:53:37.142Z', '', '', iloUrl(7), 3);
  insert.run('8', '2026-09-14T17:53:37.142Z', 'Odd Status', 'pending', iloUrl(8), 3);
  insert.run('9', '2026-09-14T17:53:37.142Z', 'Wrong Link', '', iloUrl(10), 3);
  db.prepare('INSERT INTO scrape_runs (scraped_at, received, inserted) VALUES (?, ?, ?)').run('2026-09-15T10:09:20.322Z', 4, 0);

  const { ships, dropped, dataAsOf } = queryLatestShips(db);
  assert.deepEqual(ships.map(s => [s.abandonment_id, s.ship_status, s.num_seafarers]), [['1821', 'resolved', 13]]);
  assert.deepEqual(dropped.map(d => d.id), ['7', '8', '9']);
  assert.equal(dataAsOf, '2026-09-15T10:09:20.322Z');
  db.close();
});
