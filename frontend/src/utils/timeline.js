// The Timeline view: the cases placed by the month each ship was abandoned, and
// what the map shows at any month. Pure, so the tests can run it on its own.
import { formatIloDate } from './formatDate.js';

export const WINDOW_MONTHS = 12;
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

// A month as one number, so months can be counted and compared.
export const monthIndex = (year, month) => year * 12 + month; // month 0–11
export const monthOfDate = date => monthIndex(date.getUTCFullYear(), date.getUTCMonth());
export const monthLabel = i => `${MONTH_NAMES[i % 12]} ${Math.floor(i / 12)}`;

// The month a ship was abandoned. The ILO gives a day, a month or only a year;
// a year alone is placed at its January. null when there's no usable date.
export function abandonmentMonth(ship) {
  const m = /^(\d{4})(?:-(\d{2}))?/.exec(formatIloDate(ship.abandonment_date) || '');
  return m ? monthIndex(Number(m[1]), m[2] ? Number(m[2]) - 1 : 0) : null;
}

const mappable = ship => ship.port_latitude && ship.port_longitude;

// Every case that can go on the map, sorted by month, and the months from the
// first of them to the current one. `undated` and `unmapped` are the cases left
// out, for the note.
export function buildTimeline(ships, now = new Date()) {
  const items = [];
  let undated = 0;
  let unmapped = 0;
  for (const ship of ships) {
    const month = abandonmentMonth(ship);
    if (month === null) undated++;
    else if (!mappable(ship)) unmapped++;
    else items.push({ ship, month });
  }
  items.sort((a, b) => a.month - b.month);
  const current = monthOfDate(now);
  if (!items.length) return { items, first: current, last: current, perMonth: [0], undated, unmapped };
  const first = Math.min(items[0].month, current);
  const last = Math.max(items[items.length - 1].month, current);
  const perMonth = Array(last - first + 1).fill(0);
  for (const { month } of items) perMonth[month - first]++;
  return { items, first, last, perMonth, undated, unmapped };
}

// The cases on the map at month `at`: every one abandoned by then ('all'), or
// only those abandoned in the 12 months up to it ('window').
export function visibleAt(timeline, at, mode = 'all') {
  const from = mode === 'window' ? at - WINDOW_MONTHS + 1 : -Infinity;
  return timeline.items.filter(({ month }) => month <= at && month >= from);
}

// How a case is drawn by how long before the shown month it was abandoned:
// ringed in its own month, full strength for a year, faded after that.
export const AGE_STYLES = [
  { label: 'This month', fillOpacity: 1, weight: 2.5, color: '#111827' },
  { label: 'In the last 12 months', fillOpacity: 0.9, weight: 0.8, color: '#555' },
  { label: 'Earlier', fillOpacity: 0.3, weight: 0.3, color: '#888' },
];

export function ageStyle(age) {
  const { fillOpacity, weight, color } = AGE_STYLES[age <= 0 ? 0 : age < WINDOW_MONTHS ? 1 : 2];
  return { fillOpacity, weight, color };
}

// What the readout says at month `at`.
export function summaryAt(timeline, at, mode = 'all') {
  const shown = visibleAt(timeline, at, mode);
  return {
    cases: shown.length,
    seafarers: shown.reduce((sum, { ship }) => sum + (parseInt(ship.num_seafarers, 10) || 0), 0),
    thisMonth: shown.filter(({ month }) => month === at).length,
  };
}
