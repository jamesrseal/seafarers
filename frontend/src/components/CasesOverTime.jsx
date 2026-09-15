import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { formatIloDate } from '../utils/formatDate';
import { STATUS_COLORS } from '../utils/statusColors';

// Chart colours, checked with the dataviz palette validator against the white
// card, in stack order: the four status hues clear the lightness, chroma,
// colour-blind and normal-vision checks for neighbouring segments. Yellow is
// under 3:1 on white, so every value is also in the legend, tooltip and table
// view. The map's own status fills are too pale for thin chart marks (its
// yellow is 1.3:1), so these are deeper hues with the same meanings: green
// resolved, red disputed, yellow unresolved. Inactive is violet rather than the
// map's gray, because a gray segment reads as missing data.
const NEW_CASES_COLOR = '#2a78d6';
const CHANGE_TYPES = [ // bottom of the stack first
  { status: 'resolved', color: '#008300' },
  { status: 'inactive', color: '#4a3aa7' },
  { status: 'disputed', color: '#e34948' },
  { status: '', color: '#eda100' },
];
const GRID = '#e5e7eb';       // gray-200
const AXIS = '#d1d5db';       // gray-300
const TICK_TEXT = '#6b7280';  // gray-500
const NO_DATA = '#f3f4f6';    // gray-100

const DAY = 86_400_000;
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const statusName = status => STATUS_COLORS[status].label;
const plural = (n, word) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;
const fmtDay = t => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const fmtMonth = (year, month) => new Date(Date.UTC(year, month, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

// Round axis ticks: whole numbers only, about four of them.
function niceTicks(max, target = 4) {
  const raw = Math.max(max, 1) / target;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(1, [1, 2, 5, 10].map(m => m * magnitude).find(s => s >= raw));
  const top = Math.max(step, Math.ceil(max / step) * step);
  const ticks = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  return { top, ticks };
}

// Width of an element, kept current as the layout changes, so the SVG is drawn
// at real pixels and its text stays the same size at every screen width.
function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

// New cases per month, by the ILO notification date, from the first month with
// a case to the current month (which is still in progress).
function monthlyNewCases(ships, now) {
  const counts = new Map();
  let undated = 0;
  for (const ship of ships) {
    const match = /^(\d{4})-(\d{2})/.exec(formatIloDate(ship.notification_date) || '');
    if (!match) { undated++; continue; }
    const key = `${match[1]}-${match[2]}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  if (!counts.size) return { months: [], undated };

  const first = [...counts.keys()].sort()[0];
  let year = Number(first.slice(0, 4));
  let month = Number(first.slice(5, 7)) - 1;
  const months = [];
  while (year < now.getUTCFullYear() || (year === now.getUTCFullYear() && month <= now.getUTCMonth())) {
    const key = `${year}-${String(month + 1).padStart(2, '0')}`;
    months.push({ year, month, count: counts.get(key) || 0 });
    if (++month === 12) { month = 0; year++; }
  }
  return { months, undated };
}

function weekStart(t) {
  const d = new Date(t);
  const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return day - ((new Date(day).getUTCDay() + 6) % 7) * DAY; // Monday, UTC
}

// Status changes per week (Monday to Sunday, UTC), counted in the week a
// refresh first saw the new status. A week with no refresh is kept, marked
// runs: 0, so a gap never passes for a quiet week. `since` is the earliest
// moment the old status was last seen: a change found after a gap happened
// some time after it, not necessarily in the week it is counted.
function weeklyChanges(runs, changes, now) {
  if (!runs.length) return [];
  const first = weekStart(runs[0]);
  const weeks = [];
  for (let t = first; t <= weekStart(now); t += 7 * DAY) {
    weeks.push({ start: t, runs: 0, counts: Object.fromEntries(CHANGE_TYPES.map(c => [c.status, 0])), total: 0, since: null });
  }
  const weekOf = t => weeks[Math.round((weekStart(t) - first) / (7 * DAY))];
  for (const run of runs) {
    const week = weekOf(run);
    if (week) week.runs++;
  }
  for (const change of changes) {
    const week = weekOf(change.scraped_at);
    if (!week || !(change.to in week.counts)) continue;
    week.counts[change.to]++;
    week.total++;
    const since = Date.parse(change.previous_scraped_at);
    if (week.since === null || since < week.since) week.since = since;
  }
  return weeks;
}

// Only worth saying when the old status was last seen more than a week before
// this week began, i.e. the refreshes had missed weeks. Otherwise every week
// would carry a note about last week.
function sinceNote(week) {
  return week.since !== null && week.since < week.start - 7 * DAY ? `Includes changes since ${fmtDay(week.since)}` : '';
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function ChartCard({ title, summary, view, onView, children }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <div>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</h2>
          {summary && <p className="text-xs text-gray-600 mt-1">{summary}</p>}
        </div>
        <div className="flex text-xs border border-gray-300 rounded overflow-hidden shrink-0" role="group" aria-label={`${title} view`}>
          {['chart', 'table'].map(v => (
            <button
              key={v}
              onClick={() => onView(v)}
              aria-pressed={view === v}
              className={`px-2.5 py-1 capitalize ${view === v ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
      {children}
    </div>
  );
}

const TOOLTIP_WIDTH = 210;

// Sits beside the hovered position, flipping left near the right edge.
function Tooltip({ x, containerWidth, children }) {
  const left = x + 14 + TOOLTIP_WIDTH > containerWidth ? Math.max(0, x - 14 - TOOLTIP_WIDTH) : x + 14;
  return (
    <div
      className="absolute top-2 z-10 pointer-events-none bg-white border border-gray-200 rounded-md shadow-md px-3 py-2 text-xs"
      style={{ left, width: TOOLTIP_WIDTH }}
    >
      {children}
    </div>
  );
}

// Arrow keys step through positions; Page Up/Down jump by `page`.
function keyboardStepper(n, page, setActive) {
  return e => {
    const moves = { ArrowLeft: -1, ArrowRight: 1, PageUp: -page, PageDown: page };
    let next;
    if (e.key in moves) next = a => Math.min(n - 1, Math.max(0, (a ?? n - 1) + moves[e.key]));
    else if (e.key === 'Home') next = () => 0;
    else if (e.key === 'End') next = () => n - 1;
    else return;
    e.preventDefault();
    setActive(next);
  };
}

function YGrid({ ticks, y, left, right }) {
  return ticks.map(t => (
    <g key={t}>
      <line x1={left} x2={right} y1={y(t)} y2={y(t)} stroke={t === 0 ? AXIS : GRID} shapeRendering="crispEdges" />
      <text x={left - 6} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize="10" fill={TICK_TEXT} style={{ fontVariantNumeric: 'tabular-nums' }}>
        {t}
      </text>
    </g>
  ));
}

// ---------------------------------------------------------------------------
// New cases per month
// ---------------------------------------------------------------------------

function NewCasesChart({ months, width }) {
  const [active, setActive] = useState(null);
  const n = months.length;
  if (!width || !n) return null;

  const H = 190;
  const M = { top: 10, right: 16, bottom: 22, left: 34 };
  const plotW = width - M.left - M.right;
  const plotH = H - M.top - M.bottom;
  const { top, ticks } = niceTicks(Math.max(...months.map(m => m.count)));
  const x = i => M.left + (n === 1 ? plotW / 2 : (i * plotW) / (n - 1));
  const y = v => M.top + plotH - (v / top) * plotH;

  // The current month is still in progress, so the line stops at the last full
  // month and this month is a hollow dot on its own: joined to the line, its
  // partial count reads as new cases collapsing.
  const full = months.slice(0, -1);
  const current = n - 1;
  const line = full.map((m, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(m.count).toFixed(1)}`).join('');
  const area = full.length > 1 ? `${line}L${x(full.length - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z` : '';

  const pxPerYear = (plotW / Math.max(n - 1, 1)) * 12;
  const yearStep = [1, 2, 5, 10].find(s => pxPerYear * s >= 40) ?? 10;
  const yearTicks = months.flatMap((m, i) => (m.month === 0 && m.year % yearStep === 0 ? [{ i, year: m.year }] : []));

  function onPointerMove(e) {
    const { left } = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - left - M.left) / plotW) * (n - 1));
    setActive(Math.min(n - 1, Math.max(0, i)));
  }

  const hovered = active === null ? null : months[active];
  const hollow = i => i === current
    ? { fill: '#fff', stroke: NEW_CASES_COLOR }
    : { fill: NEW_CASES_COLOR, stroke: '#fff' };

  return (
    <div className="relative">
      <svg
        width={width}
        height={H}
        className="block focus:outline-none"
        role="img"
        tabIndex={0}
        aria-label="New cases per month. Arrow keys step through the months; the table view lists every value."
        onPointerMove={onPointerMove}
        onPointerLeave={() => setActive(null)}
        onFocus={() => setActive(a => a ?? n - 1)}
        onBlur={() => setActive(null)}
        onKeyDown={keyboardStepper(n, 12, setActive)}
      >
        <YGrid ticks={ticks} y={y} left={M.left} right={width - M.right} />
        {yearTicks.map(({ i, year }) => (
          <text key={year} x={x(i)} y={H - 6} textAnchor="middle" fontSize="10" fill={TICK_TEXT}>{year}</text>
        ))}
        {area && <path d={area} fill={NEW_CASES_COLOR} fillOpacity="0.1" />}
        {full.length > 1 && (
          <path d={line} fill="none" stroke={NEW_CASES_COLOR} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        )}
        <circle cx={x(current)} cy={y(months[current].count)} r="3.5" fill="#fff" stroke={NEW_CASES_COLOR} strokeWidth="2" />
        {hovered && (
          <g pointerEvents="none">
            <line x1={x(active)} x2={x(active)} y1={M.top} y2={M.top + plotH} stroke={AXIS} shapeRendering="crispEdges" />
            <circle cx={x(active)} cy={y(hovered.count)} r="4" strokeWidth="2" {...hollow(active)} />
          </g>
        )}
      </svg>
      {hovered && (
        <Tooltip x={x(active)} containerWidth={width}>
          <div className="text-sm font-semibold text-gray-900">{plural(hovered.count, 'new case')}</div>
          <div className="text-gray-500">
            {fmtMonth(hovered.year, hovered.month)}{active === current ? ' (so far)' : ''}
          </div>
        </Tooltip>
      )}
    </div>
  );
}

function NewCasesTable({ months }) {
  const byYear = new Map();
  for (const m of months) {
    if (!byYear.has(m.year)) byYear.set(m.year, Array(12).fill(null));
    byYear.get(m.year)[m.month] = m.count;
  }
  const years = [...byYear.entries()].sort((a, b) => b[0] - a[0]);
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs tabular-nums">
        <thead>
          <tr className="text-gray-500">
            <th className="text-left font-medium py-1 pr-3">Year</th>
            {MONTH_ABBR.map(mo => <th key={mo} className="text-right font-medium py-1 px-1.5">{mo}</th>)}
            <th className="text-right font-medium py-1 pl-3">Total</th>
          </tr>
        </thead>
        <tbody>
          {years.map(([year, counts]) => (
            <tr key={year} className="border-t border-gray-100">
              <td className="py-1 pr-3 text-gray-700">{year}</td>
              {counts.map((c, i) => <td key={i} className="text-right py-1 px-1.5 text-gray-800">{c ?? ''}</td>)}
              <td className="text-right py-1 pl-3 font-semibold text-gray-900">{counts.reduce((sum, c) => sum + (c ?? 0), 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status changes per week
// ---------------------------------------------------------------------------

function WeekDetail({ week }) {
  const present = CHANGE_TYPES.filter(t => week.counts[t.status]);
  const note = sinceNote(week);
  return (
    <>
      <div className="text-sm font-semibold text-gray-900">
        {!week.runs ? 'No refresh ran' : week.total ? plural(week.total, 'status change') : 'No status changes'}
      </div>
      <div className="text-gray-500">Week of {fmtDay(week.start)}</div>
      {present.length > 0 && (
        <div className="mt-1.5 space-y-0.5">
          {present.map(t => (
            <div key={t.status || 'unresolved'} className="flex items-center gap-2">
              <span className="inline-block w-3 h-0.5 shrink-0" style={{ backgroundColor: t.color }} />
              <span className="font-semibold text-gray-900 tabular-nums">{week.counts[t.status]}</span>
              <span className="text-gray-600">to {statusName(t.status)}</span>
            </div>
          ))}
        </div>
      )}
      {note && <div className="text-gray-500 mt-1.5">{note}, when a refresh last saw those cases.</div>}
    </>
  );
}

function StatusChangesChart({ weeks, width }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const [active, setActive] = useState(null);
  const n = weeks.length;
  if (!width || !n) return null;

  const H = 200;
  const M = { top: 10, right: 16, bottom: 22, left: 30 };
  const plotW = width - M.left - M.right;
  const plotH = H - M.top - M.bottom;
  const band = plotW / n;
  const barW = Math.max(3, Math.min(24, band * 0.7));
  const { top, ticks } = niceTicks(Math.max(...weeks.map(w => w.total)));
  const y = v => M.top + plotH - (v / top) * plotH;
  const cx = i => M.left + (i + 0.5) * band;
  const base = y(0);

  // Runs of weeks with no refresh, shaded so they never read as "no changes".
  const gaps = [];
  weeks.forEach((w, i) => {
    if (w.runs) return;
    const last = gaps[gaps.length - 1];
    if (last && last.to === i - 1) last.to = i;
    else gaps.push({ from: i, to: i });
  });

  // A label at the first week of each month, with the year on the first and on
  // January, skipped when it would crowd the one before.
  const monthTicks = [];
  weeks.forEach((w, i) => {
    const d = new Date(w.start);
    if (i && d.getUTCMonth() === new Date(weeks[i - 1].start).getUTCMonth()) return;
    const prev = monthTicks[monthTicks.length - 1];
    if (prev && (i - prev.i) * band < 48) return;
    const withYear = !prev || d.getUTCMonth() === 0;
    monthTicks.push({ i, text: `${MONTH_ABBR[d.getUTCMonth()]}${withYear ? ` ${d.getUTCFullYear()}` : ''}` });
  });

  function onPointerMove(e) {
    const { left } = e.currentTarget.getBoundingClientRect();
    const i = Math.floor((e.clientX - left - M.left) / band);
    setActive(i >= 0 && i < n ? i : null);
  }

  return (
    <div className="relative">
      <svg
        width={width}
        height={H}
        className="block focus:outline-none"
        role="img"
        tabIndex={0}
        aria-label="Status changes per week. Arrow keys step through the weeks; the table view lists every value."
        onPointerMove={onPointerMove}
        onPointerLeave={() => setActive(null)}
        onFocus={() => setActive(a => a ?? n - 1)}
        onBlur={() => setActive(null)}
        onKeyDown={keyboardStepper(n, 4, setActive)}
      >
        <defs>
          {weeks.map((w, i) => {
            if (!w.total) return null;
            const x0 = cx(i) - barW / 2;
            const yTop = y(w.total);
            const r = Math.min(4, barW / 2, base - yTop);
            // Rounded at the data end, square on the baseline.
            return (
              <clipPath key={i} id={`${uid}-bar${i}`}>
                <path d={`M${x0},${base}V${yTop + r}Q${x0},${yTop} ${x0 + r},${yTop}H${x0 + barW - r}Q${x0 + barW},${yTop} ${x0 + barW},${yTop + r}V${base}Z`} />
              </clipPath>
            );
          })}
        </defs>
        {gaps.map(g => {
          const gx = M.left + g.from * band;
          const gw = (g.to - g.from + 1) * band;
          return (
            <g key={g.from}>
              <rect x={gx} y={M.top} width={gw} height={plotH} fill={NO_DATA} />
              {gw >= 80 && <text x={gx + gw / 2} y={M.top + 14} textAnchor="middle" fontSize="10" fill={TICK_TEXT}>No refreshes</text>}
            </g>
          );
        })}
        <YGrid ticks={ticks} y={y} left={M.left} right={width - M.right} />
        {monthTicks.map(t => (
          <text key={t.i} x={M.left + t.i * band + 1} y={H - 6} fontSize="10" fill={TICK_TEXT}>{t.text}</text>
        ))}
        {weeks.map((w, i) => {
          if (!w.total) return null;
          const x0 = cx(i) - barW / 2;
          const present = CHANGE_TYPES.filter(t => w.counts[t.status]);
          let cursor = base;
          return (
            <g key={i} clipPath={`url(#${uid}-bar${i})`} opacity={active === null || active === i ? 1 : 0.55}>
              {present.map((t, k) => {
                const h = (w.counts[t.status] / top) * plotH;
                // A 2px surface gap between segments, taken from the lower one.
                const gap = k === present.length - 1 ? 0 : 2;
                const segment = (
                  <rect key={t.status || 'unresolved'} x={x0} y={cursor - h + gap} width={barW} height={Math.max(h - gap, 0.5)} fill={t.color} />
                );
                cursor -= h;
                return segment;
              })}
            </g>
          );
        })}
        {active !== null && !weeks[active].total && (
          <rect x={M.left + active * band} y={M.top} width={band} height={plotH} fill={AXIS} fillOpacity="0.35" pointerEvents="none" />
        )}
      </svg>
      {active !== null && (
        <Tooltip x={cx(active)} containerWidth={width}>
          <WeekDetail week={weeks[active]} />
        </Tooltip>
      )}
    </div>
  );
}

function ChangesTable({ weeks }) {
  // Newest first, with each run of weeks that had no refresh folded into one row.
  const rows = [];
  for (const week of [...weeks].reverse()) {
    const last = rows[rows.length - 1];
    if (!week.runs && last && !last.week.runs) last.from = week.start;
    else rows.push({ week, from: week.start });
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs tabular-nums">
        <thead>
          <tr className="text-gray-500">
            <th className="text-left font-medium py-1 pr-3">Week of</th>
            {CHANGE_TYPES.map(t => (
              <th key={t.status || 'unresolved'} className="text-right font-medium py-1 px-2 whitespace-nowrap">To {statusName(t.status).toLowerCase()}</th>
            ))}
            <th className="text-right font-medium py-1 px-2">Total</th>
            <th className="text-left font-medium py-1 pl-3">Note</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ week: w, from }) => (
            <tr key={w.start} className="border-t border-gray-100">
              <td className="py-1 pr-3 text-gray-700 whitespace-nowrap">
                {from === w.start ? fmtDay(w.start) : `${fmtDay(from)} – ${fmtDay(w.start)}`}
              </td>
              {CHANGE_TYPES.map(t => (
                <td key={t.status || 'unresolved'} className="text-right py-1 px-2 text-gray-800">{w.runs ? w.counts[t.status] : ''}</td>
              ))}
              <td className="text-right py-1 px-2 font-semibold text-gray-900">{w.runs ? w.total : ''}</td>
              <td className="py-1 pl-3 text-gray-500 whitespace-nowrap">{w.runs ? sinceNote(w) : 'No refresh ran'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function changesSummary(runs, weeks) {
  const totals = Object.fromEntries(CHANGE_TYPES.map(t => [t.status, 0]));
  for (const w of weeks) for (const t of CHANGE_TYPES) totals[t.status] += w.counts[t.status];
  const total = Object.values(totals).reduce((a, b) => a + b, 0);
  const parts = CHANGE_TYPES.filter(t => totals[t.status]).map(t => `${totals[t.status]} to ${statusName(t.status).toLowerCase()}`);
  return `${plural(total, 'status change')} since the site began tracking cases on ${fmtDay(runs[0])}${parts.length ? `: ${parts.join(', ')}` : ''}.`;
}

// ---------------------------------------------------------------------------

export default function CasesOverTime({ ships }) {
  const now = useMemo(() => new Date(), []);
  const [newView, setNewView] = useState('chart');
  const [changesView, setChangesView] = useState('chart');
  const [history, setHistory] = useState(null); // null while loading
  const [newRef, newWidth] = useWidth();
  const [changesRef, changesWidth] = useWidth();

  useEffect(() => {
    fetch('/api/ships/status-changes')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(setHistory)
      .catch(err => setHistory({ error: err.message }));
  }, []);

  const { months, undated } = useMemo(() => monthlyNewCases(ships, now), [ships, now]);
  const weeks = useMemo(() => (history?.runs ? weeklyChanges(history.runs, history.changes, now) : []), [history, now]);

  // The current month is still in progress, so the summary uses the 12 before it.
  const lastYear = months.slice(0, -1).slice(-12);
  const lastYearTotal = lastYear.reduce((sum, m) => sum + m.count, 0);
  const newSummary = lastYear.length === 12
    ? `${plural(lastYearTotal, 'new case')} in the 12 months to ${fmtMonth(lastYear[11].year, lastYear[11].month)}, about ${Math.round(lastYearTotal / 12)} a month.`
    : null;
  const currentMonth = months[months.length - 1];

  let changesBody;
  if (!history) changesBody = <p className="text-xs text-gray-400">Loading…</p>;
  else if (history.error) changesBody = <p className="text-xs text-gray-500">Couldn’t load the change history ({history.error}).</p>;
  else if (!weeks.length) changesBody = <p className="text-xs text-gray-500">No refreshes recorded yet.</p>;
  else if (changesView === 'table') changesBody = <ChangesTable weeks={weeks} />;
  else {
    changesBody = (
      <>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600 mb-2">
          <span className="text-gray-500">Changed to</span>
          {CHANGE_TYPES.map(t => (
            <span key={t.status || 'unresolved'} className="inline-flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: t.color }} />
              {statusName(t.status)}
            </span>
          ))}
        </div>
        <StatusChangesChart weeks={weeks} width={changesWidth} />
      </>
    );
  }

  return (
    <>
      <ChartCard title="New cases per month" summary={newSummary} view={newView} onView={setNewView}>
        <div ref={newRef}>
          {newView === 'chart' ? <NewCasesChart months={months} width={newWidth} /> : <NewCasesTable months={months} />}
        </div>
        <p className="text-xs text-gray-400 mt-2">
          By the date each case was notified to the ILO.
          {currentMonth && newView === 'chart' && ` The hollow dot is ${fmtMonth(currentMonth.year, currentMonth.month)} so far.`}
          {undated > 0 && ` ${plural(undated, 'case')} with no notification month ${undated === 1 ? 'isn’t' : 'aren’t'} shown.`}
        </p>
      </ChartCard>

      <ChartCard
        title="Status changes seen by the daily refresh"
        summary={history?.runs?.length ? changesSummary(history.runs, weeks) : null}
        view={changesView}
        onView={setChangesView}
      >
        <div ref={changesRef}>{changesBody}</div>
        <p className="text-xs text-gray-400 mt-2">
          Counted in the week a refresh first saw the new status. The ILO doesn’t publish when a status changed, so this starts when the site began tracking.
        </p>
      </ChartCard>
    </>
  );
}
