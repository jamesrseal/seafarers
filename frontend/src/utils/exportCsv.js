import { statusLabel } from './statusColors';

// Columns exported, in order. [header, accessor]
const CSV_COLUMNS = [
  ['Abandonment ID',      s => s.abandonment_id],
  ['Ship Name',           s => s.ship_name],
  ['Status',              s => statusLabel(s.ship_status)],
  ['Flag',                s => s.flag],
  ['IMO Number',          s => s.imo_number],
  ['Port of Abandonment', s => s.port_of_abandonment],
  ['Latitude',            s => s.port_latitude],
  ['Longitude',           s => s.port_longitude],
  ['Seafarers',           s => s.num_seafarers],
  ['Abandonment Date',    s => s.abandonment_date],
  ['Notification Date',   s => s.notification_date],
  ['Last Activity',       s => s.last_activity_date],
  ['Reporting Org.',      s => s.reporting_member],
  ['Fishing Vessel',      s => (s.fishing_vessel ? 'Yes' : 'No')],
  ['ILO URL',             s => s.ilo_url],
];

function escapeCell(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // Quote if the value contains a comma, quote, or newline; double embedded quotes.
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export function shipsToCsv(ships) {
  const header = CSV_COLUMNS.map(([h]) => h).join(',');
  const rows = ships.map(s => CSV_COLUMNS.map(([, fn]) => escapeCell(fn(s))).join(','));
  return [header, ...rows].join('\n');
}

export function downloadShipsCsv(ships, filename = 'abandoned-seafarers.csv') {
  const csv = shipsToCsv(ships);
  // Prepend a BOM so Excel reads UTF-8 ship/port names correctly.
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
