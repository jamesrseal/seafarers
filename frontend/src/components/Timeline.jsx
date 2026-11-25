import { useCallback, useEffect, useMemo, useState } from 'react';
import Map from './Map';
import { useWidth } from '../hooks/useWidth';
import {
  buildTimeline, visibleAt, ageStyle, summaryAt, monthOfDate, monthLabel, AGE_STYLES, WINDOW_MONTHS,
} from '../utils/timeline';

// Milliseconds per month while playing: a year takes 4s, 2s or 1s.
const SPEEDS = [
  { label: '½×', ms: 333, title: 'Slow: a year every 4 seconds' },
  { label: '1×', ms: 167, title: 'Normal: a year every 2 seconds' },
  { label: '2×', ms: 83, title: 'Fast: a year every second' },
];
const MODES = [
  { value: 'all', label: 'All so far', title: 'Every case abandoned by the month shown' },
  { value: 'window', label: 'Last 12 months', title: 'Only the cases abandoned in the 12 months up to the month shown' },
];

const PAST = '#2a78d6';   // the dashboard's new-cases blue
const FUTURE = '#e5e7eb'; // gray-200
const CURSOR = '#1f2937'; // gray-800
const TICK_TEXT = '#6b7280';

const plural = (n, word) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;

function Icon({ d }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="currentColor"><path d={d} /></svg>
  );
}
const ICONS = {
  start: 'M3 3h2v10H3zM13 3v10L6 8z',
  back: 'M12 3v10L5 8zM3 3h2v10H3z',
  play: 'M4 2.5v11L13.5 8z',
  pause: 'M4 3h3v10H4zM9 3h3v10H9z',
  forward: 'M4 3v10l7-5zM11 3h2v10h-2z',
  collapse: 'M3.5 5.5 8 10l4.5-4.5 1 1L8 12 2.5 6.5z',
  expand: 'M3.5 10.5 8 6l4.5 4.5 1-1L8 4 2.5 9.5z',
};

// Whether the player is expanded, remembered in this browser. Open unless the
// viewer minimised it; storage can be missing or blocked, so it's only a default.
const DRAWER_KEY = 'timeline-drawer';
function drawerOpen() {
  try { return localStorage.getItem(DRAWER_KEY) !== 'closed'; } catch { return true; }
}
function saveDrawerOpen(open) {
  try { localStorage.setItem(DRAWER_KEY, open ? 'open' : 'closed'); } catch { /* not remembered */ }
}

function ToolButton({ label, icon, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="p-1.5 rounded text-gray-600 hover:bg-gray-100 disabled:text-gray-300 disabled:hover:bg-transparent"
    >
      <Icon d={ICONS[icon]} />
    </button>
  );
}

function Segmented({ label, options, value, onChange }) {
  return (
    <div className="flex text-xs border border-gray-300 rounded overflow-hidden shrink-0" role="group" aria-label={label}>
      {options.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          title={o.title}
          className={`px-2.5 py-1 whitespace-nowrap ${value === o.value ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Cases abandoned per month, blue up to the month shown. Dragging across it
// moves the month, like the slider under it. Inset by half the slider's thumb
// on each side, so the cursor sits over the thumb.
const INSET = 8;

function Histogram({ timeline, month, mode, onScrub }) {
  const [ref, width] = useWidth();
  const { perMonth, first } = timeline;
  const n = perMonth.length;
  const H = 52;
  const plotW = Math.max(width - 2 * INSET, 1);
  const plotH = H - 14;
  const band = plotW / n;
  const max = Math.max(...perMonth, 1);
  const at = month - first;
  const from = mode === 'window' ? at - WINDOW_MONTHS + 1 : -Infinity;

  const pxPerYear = band * 12;
  const yearStep = [1, 2, 5, 10].find(s => pxPerYear * s >= 36) ?? 10;
  const years = [];
  for (let i = 0; i < n; i++) {
    const m = first + i;
    if (m % 12 === 0 && Math.floor(m / 12) % yearStep === 0) years.push({ i, year: Math.floor(m / 12) });
  }

  function scrubTo(e) {
    const { left } = e.currentTarget.getBoundingClientRect();
    const i = Math.floor((e.clientX - left - INSET) / band);
    onScrub(first + Math.min(n - 1, Math.max(0, i)));
  }

  return (
    <div ref={ref}>
      {width > 0 && (
        <svg
          width={width}
          height={H}
          className="block cursor-pointer touch-none select-none"
          aria-hidden="true"
          onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); scrubTo(e); }}
          onPointerMove={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) scrubTo(e); }}
        >
          {perMonth.map((count, i) => {
            if (!count) return null;
            const h = Math.max(1, (count / max) * plotH);
            const shown = i <= at && i >= from;
            return (
              <rect
                key={i}
                x={INSET + i * band}
                y={plotH - h}
                width={Math.max(band - (band > 3 ? 1 : 0), 0.75)}
                height={h}
                fill={shown ? PAST : FUTURE}
              />
            );
          })}
          <line x1={INSET} x2={width - INSET} y1={plotH + 0.5} y2={plotH + 0.5} stroke="#d1d5db" />
          <line
            x1={INSET + (at + 0.5) * band}
            x2={INSET + (at + 0.5) * band}
            y1={0}
            y2={plotH}
            stroke={CURSOR}
            strokeWidth="1.5"
          />
          {years.map(({ i, year }) => (
            <text key={year} x={INSET + i * band} y={H - 2} fontSize="10" fill={TICK_TEXT}>{year}</text>
          ))}
        </svg>
      )}
    </div>
  );
}

export default function Timeline({ ships, onSelect, portFilter, countryFilter }) {
  const timeline = useMemo(() => buildTimeline(ships, new Date()), [ships]);
  const { first, last } = timeline;
  const [chosen, setChosen] = useState(() => monthOfDate(new Date()));
  const [mode, setMode] = useState('all');
  const [speed, setSpeed] = useState('1×');
  const [playing, setPlaying] = useState(false);
  const [open, setOpen] = useState(drawerOpen);
  // A filter can narrow the months, so the month shown is kept inside them.
  const month = Math.min(last, Math.max(first, chosen));

  const ms = SPEEDS.find(s => s.label === speed).ms;
  useEffect(() => {
    if (!playing) return undefined;
    const timer = setInterval(() => setChosen(m => Math.min(last, Math.max(first, m) + 1)), ms);
    return () => clearInterval(timer);
  }, [playing, ms, first, last]);
  // Playback stops on the current month.
  useEffect(() => { if (playing && month >= last) setPlaying(false); }, [playing, month, last]);

  const play = () => {
    if (month >= last) setChosen(first);
    setPlaying(true);
  };
  const goTo = m => { setPlaying(false); setChosen(Math.min(last, Math.max(first, m))); };

  const shown = useMemo(() => visibleAt(timeline, month, mode), [timeline, month, mode]);
  const shownShips = useMemo(() => shown.map(i => i.ship), [shown]);
  const { cases, seafarers, thisMonth } = useMemo(() => summaryAt(timeline, month, mode), [timeline, month, mode]);
  const monthById = useMemo(() => new globalThis.Map(timeline.items.map(i => [i.ship.abandonment_id, i.month])), [timeline]);
  const markerStyle = useCallback(ship => ageStyle(month - monthById.get(ship.abandonment_id)), [month, monthById]);
  const legendSection = useMemo(() => ({
    title: 'Abandoned',
    items: AGE_STYLES.slice(0, mode === 'window' ? 2 : 3).map(s => ({ ...s, strokeColor: s.color })),
  }), [mode]);

  const label = monthLabel(month);
  const scope = mode === 'window' ? `in the 12 months to ${label}` : `by ${label}`;

  // Space plays and pauses, except on a button, where it presses the button.
  function onKeyDown(e) {
    if (e.key !== ' ' || e.target.tagName === 'BUTTON') return;
    e.preventDefault();
    if (playing) setPlaying(false); else play();
  }

  const toggleDrawer = () => { saveDrawerOpen(!open); setOpen(!open); };

  const playButton = (
    <button
      onClick={() => (playing ? setPlaying(false) : play())}
      aria-label={playing ? 'Pause' : 'Play'}
      title={playing ? 'Pause' : 'Play'}
      className="mx-1 p-2 rounded-full bg-blue-600 text-white hover:bg-blue-700 shrink-0"
    >
      <Icon d={ICONS[playing ? 'pause' : 'play']} />
    </button>
  );
  const slider = (
    <input
      type="range"
      min={first}
      max={last}
      step={1}
      value={month}
      onChange={e => goTo(Number(e.target.value))}
      aria-label="Month"
      aria-valuetext={`${label}, ${plural(cases, 'case')}`}
      className={`block w-full accent-blue-600 ${open ? '-mt-0.5' : ''}`}
    />
  );
  const drawerButton = (
    <button
      onClick={toggleDrawer}
      aria-expanded={open}
      aria-controls="timeline-drawer"
      aria-label={open ? 'Minimise the player' : 'Expand the player'}
      title={open ? 'Minimise the player' : 'Expand the player'}
      className="p-1.5 rounded text-gray-500 hover:bg-gray-100 shrink-0"
    >
      <Icon d={ICONS[open ? 'collapse' : 'expand']} />
    </button>
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0">
        <Map
          ships={shownShips}
          fitShips={ships}
          onSelect={onSelect}
          highlighted={null}
          view="timeline"
          portFilter={portFilter}
          countryFilter={countryFilter}
          markerStyle={markerStyle}
          legendSection={legendSection}
        />
      </div>

      <div
        id="timeline-drawer"
        className={`shrink-0 bg-white border-t border-gray-200 px-4 sm:px-6 ${open ? 'pt-2 pb-2' : 'py-1'}`}
        onKeyDown={onKeyDown}
      >
        <div className="max-w-7xl mx-auto">
          {open ? (
            <>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="flex items-center gap-0.5">
                  <ToolButton label="First month" icon="start" onClick={() => goTo(first)} disabled={month <= first} />
                  <ToolButton label="Previous month" icon="back" onClick={() => goTo(month - 1)} disabled={month <= first} />
                  {playButton}
                  <ToolButton label="Next month" icon="forward" onClick={() => goTo(month + 1)} disabled={month >= last} />
                </div>

                {/* Two lines of fixed height that never wrap: the numbers and month
                    names change length as it plays, and a line that wrapped would
                    resize the drawer, and the map with it, every few months on a phone.
                    The scope is left to the mode toggle there. */}
                <div className="min-w-0 flex-1 tabular-nums">
                  <div className="h-5 leading-5 truncate">
                    <span className="text-sm font-semibold text-gray-900">{label}</span>
                    {thisMonth > 0 && <span className="text-xs text-gray-900 font-medium"> · +{thisMonth} this month</span>}
                  </div>
                  <div className="h-4 leading-4 truncate text-xs text-gray-600">
                    {plural(cases, 'case')} · {plural(seafarers, 'seafarer')}
                    <span className="hidden sm:inline"> {scope}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Segmented label="Cases shown" options={MODES} value={mode} onChange={setMode} />
                  <Segmented label="Speed" options={SPEEDS.map(s => ({ ...s, value: s.label }))} value={speed} onChange={setSpeed} />
                  {drawerButton}
                </div>
              </div>

              <div className="mt-1">
                <Histogram timeline={timeline} month={month} mode={mode} onScrub={goTo} />
                {slider}
              </div>

              <p className="text-xs text-gray-400 mt-1 text-center">
                Ships plotted by the month each was abandoned. Colours show each case’s status as of the last updated date.
              </p>
            </>
          ) : (
            // Minimised: one line that still plays, pauses and scrubs.
            <div className="flex items-center gap-3">
              {playButton}
              <div className="shrink-0 text-xs tabular-nums whitespace-nowrap">
                <span className="font-semibold text-gray-900">{label}</span>
                <span className="hidden sm:inline text-gray-600"> · {plural(cases, 'case')}</span>
                {thisMonth > 0 && <span className="hidden sm:inline text-gray-900 font-medium"> · +{thisMonth}</span>}
              </div>
              <div className="flex-1 min-w-0">{slider}</div>
              {drawerButton}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
