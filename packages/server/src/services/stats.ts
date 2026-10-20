import type { StatsSummary } from '@contrail/shared';
import { airlineByIcao } from '@contrail/shared';
import { dbAvailable, query } from '../db/pool.js';
import { store } from '../store/aircraftStore.js';
import { reference } from '../data/reference.js';
import { log } from '../log.js';
import type { FeedManager } from '../feeds/index.js';

const memSamples: { ts: string; count: number }[] = [];
let timer: NodeJS.Timeout | undefined;

function topAirports(limit = 10): { icao: string; name?: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const a of store.all()) for (const c of [a.origin, a.dest]) if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
  return [...counts.entries()].sort((x, y) => y[1] - x[1]).slice(0, limit).map(([icao, count]) => ({ icao, name: reference.airport(icao)?.name, count }));
}

function topAirlines(limit = 10): { icao: string; name?: string; count: number }[] {
  const { byOperator } = store.summary();
  return [...byOperator.entries()].sort((x, y) => y[1] - x[1]).slice(0, limit).map(([icao, count]) => ({ icao, name: airlineByIcao(icao)?.name, count }));
}

export function startStats(): void {
  const sample = async () => {
    const s = store.summary();
    const ts = new Date();
    ts.setSeconds(0, 0);
    memSamples.push({ ts: ts.toISOString(), count: s.total });
    if (memSamples.length > 24 * 60) memSamples.shift();
    if (dbAvailable()) {
      try {
        await query('INSERT INTO stats_samples (ts, total, airborne, on_ground, by_source, by_category, top_airlines, top_airports) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (ts) DO NOTHING',
          [ts, s.total, s.airborne, s.onGround, JSON.stringify(s.bySource), JSON.stringify(s.byCategory), JSON.stringify(topAirlines(20)), JSON.stringify(topAirports(20))]);
      } catch (err) { log.debug({ err: (err as Error).message }, 'stats sample failed'); }
    }
  };
  timer = setInterval(() => void sample(), 60_000);
  setTimeout(() => void sample(), 15_000);
}

export function stopStats(): void { if (timer) clearInterval(timer); }

export async function getStats(feeds: FeedManager, range: '1h' | '24h' | '7d' = '24h'): Promise<StatsSummary> {
  const s = store.summary();
  let trackedOverTime = memSamples;
  let busiestAirports = topAirports();
  let busiestAirlines = topAirlines();
  if (dbAvailable()) {
    try {
      const bucket = range === '1h' ? '1 minute' : range === '24h' ? '10 minutes' : '1 hour';
      const interval = range === '1h' ? '1 hour' : range === '24h' ? '24 hours' : '7 days';
      const r = await query<{ ts: Date; count: string }>(
        `SELECT date_bin($1::interval, ts, '2000-01-01') AS ts, round(avg(total)) AS count FROM stats_samples WHERE ts > now() - $2::interval GROUP BY 1 ORDER BY 1`, [bucket, interval]);
      if (r.rows.length) trackedOverTime = r.rows.map((x) => ({ ts: new Date(x.ts).toISOString(), count: Number(x.count) }));
      const ap = await query<{ icao: string; count: string }>(
        `SELECT code AS icao, count(*) AS count FROM (SELECT origin AS code FROM flights WHERE last_seen > now() - $1::interval UNION ALL SELECT dest FROM flights WHERE last_seen > now() - $1::interval) t WHERE code IS NOT NULL GROUP BY code ORDER BY count DESC LIMIT 10`, [interval]);
      if (ap.rows.length) busiestAirports = ap.rows.map((x) => ({ icao: x.icao.trim(), name: reference.airport(x.icao.trim())?.name, count: Number(x.count) }));
      const al = await query<{ operator: string; count: string }>(`SELECT operator, count(*) AS count FROM flights WHERE operator IS NOT NULL AND last_seen > now() - $1::interval GROUP BY operator ORDER BY count DESC LIMIT 10`, [interval]);
      if (al.rows.length) busiestAirlines = al.rows.map((x) => ({ icao: x.operator, name: airlineByIcao(x.operator)?.name, count: Number(x.count) }));
    } catch (err) { log.debug({ err: (err as Error).message }, 'stats query failed'); }
  }
  return {
    generatedAt: new Date().toISOString(),
    live: { total: s.total, airborne: s.airborne, onGround: s.onGround, bySource: s.bySource, byCategory: s.byCategory },
    trackedOverTime, busiestAirports, busiestAirlines,
    feeds: feeds.statuses().map((f) => ({ name: f.name, aircraft: f.aircraft, lastUpdate: f.lastSuccess ? new Date(f.lastSuccess).toISOString() : undefined, healthy: f.healthy, error: f.lastError })),
  };
}
