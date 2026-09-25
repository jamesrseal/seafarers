import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shipsToCsv } from '../src/utils/exportCsv.js';

// One CSV line to { header: cell }, honouring quoted cells.
function rows(csv) {
  const split = line => [...line.matchAll(/(?:^|,)("(?:[^"]|"")*"|[^,]*)/g)]
    .map(([, cell]) => (cell.startsWith('"') ? cell.slice(1, -1).replace(/""/g, '"') : cell));
  const [header, ...lines] = csv.split('\n').map(split);
  return lines.map(cells => Object.fromEntries(header.map((h, i) => [h, cells[i]])));
}

const captured = {
  abandonment_id: '1821',
  ship_name: 'Nikolay Meshkov',
  ship_status: '',
  vessel_type: 'General Cargo Ship',
  nationalities: JSON.stringify([
    { country: 'Azerbaijan', count: 11 },
    { country: 'Russian Federation', count: 1 },
    { country: 'Georgia', count: null },
  ]),
  payment_latest: 'Payment Pending',
  repatriation_latest: 'Repatriation pending',
  actions_taken: JSON.stringify([
    { date: '2026-08-12', dateText: '12 August 2026', status: 'Flag State informed', detail: '' },
    { date: '2026-08-01', dateText: '1 August 2026', status: 'Other', detail: '' },
  ]),
  financial_security_provider: 'Hydor, AS',
};

test('the ILO fields export as the table shows them', () => {
  const [row] = rows(shipsToCsv([captured]));
  assert.equal(row['Vessel Type'], 'General Cargo Ship');
  assert.equal(row['Nationalities'], 'Azerbaijan (11); Russian Federation (1); Georgia');
  assert.equal(row['Payment'], 'Payment Pending');
  assert.equal(row['Repatriation'], 'Repatriation pending');
  assert.equal(row['Latest Action'], 'Flag State informed');
  assert.equal(row['Insurer'], 'Hydor, AS');
  assert.equal(row['Status'], 'Unresolved');
});

test('a case before a refresh has captured the ILO fields exports them blank', () => {
  const uncaptured = { abandonment_id: '5', ship_name: 'Alma', ship_status: 'resolved',
    vessel_type: null, nationalities: null, payment_latest: null,
    repatriation_latest: null, actions_taken: null, financial_security_provider: null };
  const [row] = rows(shipsToCsv([uncaptured]));
  for (const header of ['Vessel Type', 'Nationalities', 'Payment', 'Repatriation', 'Latest Action', 'Insurer']) {
    assert.equal(row[header], '', header);
  }
  assert.equal(row['Ship Name'], 'Alma');
});
