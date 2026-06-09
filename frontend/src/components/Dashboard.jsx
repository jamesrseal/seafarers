import { useState, useEffect } from 'react';
import { STATUS_COLORS, statusLabel, RECENCY_LEGEND } from '../utils/statusColors';

const MS_PER_DAY = 86_400_000;

function recencyTier(lastActivityDate) {
  if (!lastActivityDate) return 2;
  const ageDays = (Date.now() - new Date(lastActivityDate).getTime()) / MS_PER_DAY;
  if (ageDays <= 365)  return 0;
  if (ageDays <= 1095) return 1;
  return 2;
}

function portCountry(port) {
  if (!port) return null;
  const parts = port.split(',');
  return parts.length > 1 ? parts[parts.length - 1].trim() : null;
}

function topN(ships, keyFn, valueFn, n = 10) {
  const map = {};
  for (const ship of ships) {
    const key = keyFn(ship) || 'Unknown';
    if (!map[key]) map[key] = 0;
    map[key] += valueFn(ship);
  }
  return Object.entries(map)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, n);
}

function StatCard({ label, value, sub }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 px-5 py-4">
      <div className="text-2xl font-semibold text-gray-900">{value}</div>
      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mt-0.5">{label}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}

function BarChart({ data, color = '#60a5fa' }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="space-y-1.5">
      {data.map(d => (
        <div key={d.name} className="flex items-center gap-2 text-xs">
          <div className="w-36 text-right text-gray-600 truncate shrink-0" title={d.name}>{d.name}</div>
          <div className="flex-1 h-4 bg-gray-100 rounded overflow-hidden">
            <div
              className="h-full rounded transition-all duration-300"
              style={{ width: `${(d.value / max) * 100}%`, backgroundColor: color }}
            />
          </div>
          <div className="w-8 text-right text-gray-700 shrink-0">{d.value}</div>
        </div>
      ))}
    </div>
  );
}

function StatusBreakdown({ ships }) {
  const total = ships.length;
  if (!total) return null;
  const counts = {};
  for (const s of ships) {
    const k = s.ship_status ?? '';
    counts[k] = (counts[k] || 0) + 1;
  }
  const order = ['', 'disputed', 'inactive', 'resolved'];
  return (
    <div className="space-y-2">
      {order.filter(k => counts[k]).map(k => {
        const pct = Math.round((counts[k] / total) * 100);
        const { fill, label } = STATUS_COLORS[k];
        return (
          <div key={k} className="flex items-center gap-2 text-xs">
            <div className="w-20 text-right text-gray-600 shrink-0">{label}</div>
            <div className="flex-1 h-4 bg-gray-100 rounded overflow-hidden">
              <div className="h-full rounded" style={{ width: `${pct}%`, backgroundColor: fill }} />
            </div>
            <div className="w-20 text-gray-500 shrink-0">{counts[k]} ({pct}%)</div>
          </div>
        );
      })}
    </div>
  );
}

function RecencyBreakdown({ ships }) {
  const total = ships.length;
  if (!total) return null;
  const counts = [0, 0, 0];
  for (const s of ships) counts[recencyTier(s.last_activity_date)]++;
  return (
    <div className="space-y-2">
      {RECENCY_LEGEND.map(({ label, fillOpacity, strokeColor }, i) => {
        const pct = Math.round((counts[i] / total) * 100);
        return (
          <div key={label} className="flex items-center gap-2 text-xs">
            <div className="w-32 text-right text-gray-600 shrink-0">{label}</div>
            <div className="flex-1 h-4 bg-gray-100 rounded overflow-hidden">
              <div className="h-full rounded transition-all duration-300"
                style={{ width: `${pct}%`, backgroundColor: '#9ca3af', opacity: fillOpacity }} />
            </div>
            <div className="w-24 text-gray-500 shrink-0">{counts[i].toLocaleString()} ({pct}%)</div>
          </div>
        );
      })}
    </div>
  );
}

function RecentlyUpdated({ ships }) {
  const recent = [...ships]
    .filter(s => s.last_activity_date)
    .sort((a, b) => b.last_activity_date.localeCompare(a.last_activity_date))
    .slice(0, 10);
  if (!recent.length) return <p className="text-xs text-gray-400">No activity dates available.</p>;
  const cols = [recent.slice(0, 5), recent.slice(5)];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
      {cols.map((col, ci) => (
        <div key={ci} className="space-y-2">
          {col.map(s => {
            const { badge } = STATUS_COLORS[s.ship_status ?? ''] ?? STATUS_COLORS[''];
            return (
              <div key={s.abandonment_id} className="flex items-center gap-2 text-xs">
                <span className="text-gray-400 shrink-0">{s.last_activity_date}</span>
                <span className={`px-1.5 py-0.5 rounded-full font-medium shrink-0 ${badge}`}>
                  {statusLabel(s.ship_status)}
                </span>
                <span className="text-gray-800 truncate" title={s.ship_name}>{s.ship_name}</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">{title}</h2>
      {children}
    </div>
  );
}

const LIMIT_OPTIONS = [5, 10, 20, 50];

export default function Dashboard() {
  const [ships, setShips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(10);

  useEffect(() => {
    fetch('/api/ships')
      .then(r => r.json())
      .then(data => { setShips(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex-1 flex items-center justify-center text-gray-400">Loading…</div>;

  const totalSeafarers = ships.reduce((s, r) => s + (parseInt(r.num_seafarers) || 0), 0);
  const resolved = ships.filter(s => s.ship_status === 'resolved').length;
  const resolvedPct = ships.length ? Math.round((resolved / ships.length) * 100) : 0;
  const activeRecently = ships.filter(s => recencyTier(s.last_activity_date) === 0).length;

  const topPorts            = topN(ships, s => s.port_of_abandonment,             () => 1,                               limit);
  const topCountries        = topN(ships, s => portCountry(s.port_of_abandonment), () => 1,                               limit);
  const topFlagsByShips     = topN(ships, s => s.flag,                             () => 1,                               limit);
  const topFlagsBySeafarers = topN(ships, s => s.flag,                             s => parseInt(s.num_seafarers) || 0,   limit);

  return (
    <div className="flex-1 overflow-auto bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto space-y-5">

        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <StatCard label="Total ships" value={ships.length.toLocaleString()} />
          <StatCard label="Total seafarers" value={totalSeafarers.toLocaleString()} />
          <StatCard label="Resolved" value={resolved.toLocaleString()} sub={`${resolvedPct}% of all cases`} />
          <StatCard label="Unresolved / Disputed"
            value={(ships.filter(s => s.ship_status === '' || s.ship_status === 'disputed').length).toLocaleString()}
            sub="Active cases" />
          <StatCard label="Active in last year" value={activeRecently.toLocaleString()} sub="Recent activity recorded" />
        </div>

        {/* Status + recency breakdown side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Section title="Cases by status">
            <StatusBreakdown ships={ships} />
          </Section>
          <Section title="Cases by activity recency">
            <RecencyBreakdown ships={ships} />
          </Section>
        </div>

        {/* Recently updated */}
        <Section title="Most recently updated cases">
          <RecentlyUpdated ships={ships} />
        </Section>

        {/* Chart controls */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Show top</span>
          {LIMIT_OPTIONS.map(n => (
            <button
              key={n}
              onClick={() => setLimit(n)}
              className={`text-xs px-3 py-1 rounded border ${limit === n ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:bg-gray-100'}`}
            >
              {n}
            </button>
          ))}
        </div>

        {/* 2-column charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Section title="Ports by ships abandoned">
            <BarChart data={topPorts} color="#60a5fa" />
          </Section>
          <Section title="Countries by ships abandoned">
            <BarChart data={topCountries} color="#34d399" />
          </Section>
          <Section title="Flags by ships abandoned">
            <BarChart data={topFlagsByShips} color="#f472b6" />
          </Section>
          <Section title="Flags by seafarers abandoned">
            <BarChart data={topFlagsBySeafarers} color="#fb923c" />
          </Section>
        </div>

      </div>
    </div>
  );
}
