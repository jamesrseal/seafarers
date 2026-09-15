import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { FLAG_CODES, flagCode } from '../src/utils/flags.js';

const DB_PATH = fileURLToPath(new URL('../../backend/data/seafarers.db', import.meta.url));
const SVG_DIR = new URL('../node_modules/flag-icons/flags/4x3/', import.meta.url);

test('every flag name in the committed database has a flag code', () => {
  const db = new DatabaseSync(DB_PATH, { readOnly: true });
  const names = db.prepare(`SELECT DISTINCT flag FROM ships WHERE TRIM(COALESCE(flag, '')) <> ''`)
    .all().map(r => r.flag);
  db.close();
  assert.ok(names.length > 0);
  const missing = names.filter(name => !flagCode(name));
  assert.deepEqual(missing, [], 'add these names to FLAG_CODES in src/utils/flags.js');
});

test('every flag code has a flag-icons SVG', () => {
  const missing = [...new Set(Object.values(FLAG_CODES))]
    .filter(code => !existsSync(new URL(`${code}.svg`, SVG_DIR)));
  assert.deepEqual(missing, []);
});

test('flagCode trims, and returns null for blank or unknown names', () => {
  assert.equal(flagCode(' Panama '), 'pa');
  assert.equal(flagCode(''), null);
  assert.equal(flagCode(null), null);
  assert.equal(flagCode('Unknown'), null);
  assert.equal(flagCode('toString'), null);
});
