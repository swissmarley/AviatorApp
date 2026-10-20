import { useEffect, useState } from 'react';
import clsx from 'clsx';
import type { StatsSummary, PositionSource } from '@contrail/shared';
import { POSITION_SOURCES } from '@contrail/shared';
import { getStats } from '@/lib/api';
import { TopBar, MobileNav } from '@/components/TopBar';
import { BarList, TimeSeries } from '@/components/Chart';
import { CATEGORY_COLORS_CSS, sourceColor, sourceLabel } from '@/lib/aircraftStyle';

type Range = '1h' | '24h' | '7d';
const CATEGORY_ORDER = ['passenger', 'cargo', 'private', 'military', 'helicopter', 'glider', 'ground', 'unknown'];

export function StatsPage() {
  const [range, setRange] = useState<Range>('24h');
  const [stats, setStats] = useState<StatsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = () => getStats(range).then((s) => { if (!cancelled) { setStats(s); setError(null); } }).catch((e) => { if (!cancelled) setError((e as Error).message); });
    load();
    const id = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [range]);

  const live = stats?.live;
  const feedsHealthy = stats ? stats.feeds.filter((f) => f.healthy).length : 0;
  const sourceRows = (POSITION_SOURCES as PositionSource[]).map((s) => ({ key: s, label: sourceLabel(s), value: live?.bySource[s] ?? 0, color: sourceColor(s) })).filter((r) => r.value > 0);
  const catRows = CATEGORY_ORDER.map((c) => ({ key: c, label: c, value: live?.byCategory[c] ?? 0, color: CATEGORY_COLORS_CSS[c] ?? '#94a3b8' })).filter((r) => r.value > 0);

  return (
    <div className="h-full overflow-auto scroll-thin">
      <TopBar />
      <main className="pt-16 md:pt-20 pb-24 md:pb-10 px-3 md:px-6 max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-2xl font-bold">Statistics</h1>
          <div className="flex gap-1 panel p-1">{(['1h', '24h', '7d'] as Range[]).map((r) => <button key={r} onClick={() => setRange(r)} className={clsx('px-3 py-1 rounded-lg text-sm', range === r ? 'bg-accent text-ink font-semibold' : 'text-slate-300 hover:bg-ink-3')}>{r}</button>)}</div>
        </div>
        {error && <div className="panel p-3 text-sm text-red-300">{error}</div>}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi label="Tracked now" value={live?.total} />
          <Kpi label="Airborne" value={live?.airborne} />
          <Kpi label="On ground" value={live?.onGround} />
          <Kpi label="Feeds healthy" value={stats ? feedsHealthy : undefined} suffix={stats ? ` / ${stats.feeds.length}` : ''} />
        </section>
        <section className="panel p-4">
          <h2 className="font-semibold mb-1">Tracked aircraft over time</h2>
          <p className="text-xs text-slate-400 mb-3">Aircraft in the live store, sampled every minute · last {range}</p>
          {stats ? <TimeSeries data={stats.trackedOverTime} label="Tracked aircraft over time" color="#3987e5" /> : <div className="h-40 animate-pulse" />}
        </section>
        <section className="grid md:grid-cols-2 gap-4">
          <div className="panel p-4"><h2 className="font-semibold mb-3">Busiest airports <span className="text-xs text-slate-400 font-normal">· flights by origin/destination</span></h2>
            {stats ? <BarList color="#3987e5" items={stats.busiestAirports.map((a) => ({ label: a.icao, sub: a.name, value: a.count, href: `/airport/${a.icao}` }))} /> : <div className="h-40 animate-pulse" />}</div>
          <div className="panel p-4"><h2 className="font-semibold mb-3">Busiest airlines <span className="text-xs text-slate-400 font-normal">· by callsign prefix</span></h2>
            {stats ? <BarList color="#d95926" items={stats.busiestAirlines.map((a) => ({ label: a.icao, sub: a.name, value: a.count }))} /> : <div className="h-40 animate-pulse" />}</div>
        </section>
        <section className="grid md:grid-cols-2 gap-4">
          <div className="panel p-4"><h2 className="font-semibold mb-3">By data source</h2><Breakdown rows={sourceRows} total={live?.total ?? 0} /></div>
          <div className="panel p-4"><h2 className="font-semibold mb-3">By category</h2><Breakdown rows={catRows} total={live?.total ?? 0} /></div>
        </section>
        <section className="panel p-4">
          <h2 className="font-semibold mb-3">Feeds</h2>
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-slate-400 text-left"><tr><th className="py-1.5 pr-3">Feed</th><th className="pr-3">Aircraft</th><th className="pr-3">Last update</th><th>Status</th></tr></thead>
            <tbody>
              {stats?.feeds.map((f) => (
                <tr key={f.name} className="border-t border-line/60">
                  <td className="py-1.5 pr-3 font-mono">{f.name}</td>
                  <td className="pr-3 font-mono tabular-nums">{f.aircraft.toLocaleString()}</td>
                  <td className="pr-3 font-mono text-slate-300">{f.lastUpdate ? new Date(f.lastUpdate).toLocaleTimeString() : '—'}</td>
                  <td>{f.healthy ? <span className="chip border-emerald-500 text-emerald-300">healthy</span> : <span className="chip border-red-500 text-red-300" title={f.error}>error{f.error ? `: ${f.error}` : ''}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {stats && <div className="text-[10px] text-slate-500 mt-2">Generated {new Date(stats.generatedAt).toLocaleTimeString()}</div>}
        </section>
      </main>
      <MobileNav />
    </div>
  );
}

function Kpi({ label, value, suffix = '' }: { label: string; value?: number; suffix?: string }) {
  return (
    <div className="panel p-4">
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-2xl font-bold font-mono tabular-nums mt-1">{value === undefined ? <span className="inline-block w-16 h-6 bg-ink-3 animate-pulse rounded" /> : value.toLocaleString()}{suffix}</div>
    </div>
  );
}

function Breakdown({ rows, total }: { rows: { key: string; label: string; value: number; color: string }[]; total: number }) {
  if (!rows.length) return <div className="text-xs text-slate-500 py-4 text-center">No data yet.</div>;
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.key} className="text-xs">
          <div className="flex justify-between mb-0.5"><span className="flex items-center gap-1.5 capitalize"><i className="w-2.5 h-2.5 rounded-sm" style={{ background: r.color }} />{r.label}</span><span className="font-mono tabular-nums text-slate-300">{r.value.toLocaleString()} · {total ? Math.round((r.value / total) * 100) : 0}%</span></div>
          <div className="h-1.5 rounded-sm bg-ink-3 overflow-hidden"><div className="h-full rounded-sm" style={{ width: `${total ? (r.value / total) * 100 : 0}%`, background: r.color }} /></div>
        </li>
      ))}
    </ul>
  );
}
