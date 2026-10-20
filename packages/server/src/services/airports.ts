import type { AirportBoard, BoardEntry, DelaySeverity, FlightStatus } from '@contrail/shared';
import { airlineByIcao, haversineKm } from '@contrail/shared';
import { config } from '../config.js';
import { log } from '../log.js';
import { cached } from './cache.js';
import { fetchJson, RateLimiter } from './http.js';
import { reference } from '../data/reference.js';
import { store } from '../store/aircraftStore.js';
import { adbStatus, adbLeg, legDelay, avsLeg, avsStatus, avsBaseUrl, getFlightInfo, type AdbFlight, type AvsFlight } from './flightInfo.js';
import { dbAvailable, query } from '../db/pool.js';

const adbLimiter = new RateLimiter(1000);
const avsLimiter = new RateLimiter(1000);

function delayIndexFrom(entries: BoardEntry[]): { delayIndex: number; avgDelayMin: number; cancelled: number } {
  const delays = entries.map((e) => e.delayMin).filter((d): d is number => d !== undefined && d > 0);
  const cancelled = entries.filter((e) => e.status === 'cancelled').length;
  const avg = delays.length ? delays.reduce((a, b) => a + b, 0) / delays.length : 0;
  const share = entries.length ? (delays.filter((d) => d >= 15).length + cancelled * 2) / entries.length : 0;
  // 0..10: half from average delay (60 min → 5), half from share of delayed/cancelled flights.
  const idx = Math.min(10, (Math.min(avg, 60) / 60) * 5 + Math.min(1, share) * 5);
  return { delayIndex: Math.round(idx * 10) / 10, avgDelayMin: Math.round(avg), cancelled };
}

function localWindow(offsetHoursFrom: number, offsetHoursTo: number): [string, string] {
  const fmt = (d: Date) => d.toISOString().slice(0, 16);
  return [fmt(new Date(Date.now() + offsetHoursFrom * 3600_000)), fmt(new Date(Date.now() + offsetHoursTo * 3600_000))];
}

async function adbBoard(icao: string): Promise<{ arrivals: BoardEntry[]; departures: BoardEntry[] } | undefined> {
  const [from, to] = localWindow(-3, 8);
  const url = `https://${config.AERODATABOX_HOST}/flights/airports/icao/${icao}/${from}/${to}?withLeg=true&direction=Both&withCancelled=true&withCodeshared=false&withCargo=true&withPrivate=true&withLocation=false`;
  const res = await fetchJson<{ departures?: AdbFlight[]; arrivals?: AdbFlight[] }>(url, { headers: { 'x-rapidapi-key': config.AERODATABOX_API_KEY!, 'x-rapidapi-host': config.AERODATABOX_HOST }, limiter: adbLimiter });
  const map = (f: AdbFlight, dir: 'arr' | 'dep'): BoardEntry => {
    const here = dir === 'arr' ? adbLeg(f.arrival) : adbLeg(f.departure);
    const other = dir === 'arr' ? adbLeg(f.departure) : adbLeg(f.arrival);
    return {
      flightNo: f.number?.replace(/\s+/g, ''), callsign: f.callSign, airline: f.airline?.name, airlineIcao: f.airline?.icao,
      counterpart: { icao: other?.airport, iata: other?.iata, name: other?.name },
      scheduled: here?.scheduled, estimated: here?.estimated, actual: here?.actual, terminal: here?.terminal, gate: here?.gate,
      status: adbStatus(f.status), delayMin: legDelay(here), aircraftType: f.aircraft?.model, reg: f.aircraft?.reg, hex: f.aircraft?.modeS?.toLowerCase(),
    };
  };
  return { arrivals: (res.arrivals ?? []).map((f) => map(f, 'arr')), departures: (res.departures ?? []).map((f) => map(f, 'dep')) };
}

async function avsBoard(icao: string): Promise<{ arrivals: BoardEntry[]; departures: BoardEntry[] } | undefined> {
  const base = avsBaseUrl();
  const get = async (p: Record<string, string>) => {
    const params = new URLSearchParams({ access_key: config.AVIATIONSTACK_API_KEY!, limit: '100', ...p });
    return (await fetchJson<{ data?: AvsFlight[] }>(`${base}/flights?${params}`, { limiter: avsLimiter })).data ?? [];
  };
  const [arr, dep] = await Promise.all([get({ arr_icao: icao }), get({ dep_icao: icao })]);
  const map = (f: AvsFlight, dir: 'arr' | 'dep'): BoardEntry => {
    const here = dir === 'arr' ? avsLeg(f.arrival) : avsLeg(f.departure);
    const other = dir === 'arr' ? avsLeg(f.departure) : avsLeg(f.arrival);
    return {
      flightNo: f.flight?.iata, callsign: f.flight?.icao, airline: f.airline?.name, airlineIcao: f.airline?.icao,
      counterpart: { icao: other?.airport, iata: other?.iata, name: other?.name },
      scheduled: here?.scheduled, estimated: here?.estimated, actual: here?.actual, terminal: here?.terminal, gate: here?.gate,
      status: avsStatus(f.flight_status), delayMin: (dir === 'arr' ? f.arrival?.delay : f.departure?.delay) ?? legDelay(here), aircraftType: f.aircraft?.icao ?? undefined, reg: f.aircraft?.registration ?? undefined, hex: f.aircraft?.icao24?.toLowerCase(),
    };
  };
  return { arrivals: arr.map((f) => map(f, 'arr')), departures: dep.map((f) => map(f, 'dep')) };
}

/** Board derived purely from what we are tracking right now (works with any feed, incl. synthetic). */
async function liveBoard(icao: string): Promise<{ arrivals: BoardEntry[]; departures: BoardEntry[] }> {
  const arrivals: BoardEntry[] = [];
  const departures: BoardEntry[] = [];
  const ap = reference.airport(icao);
  const code = ap?.icao ?? icao;
  const candidates = store.all().filter((a) => a.dest === code || a.origin === code || a.dest === ap?.ident || a.origin === ap?.ident);
  for (const a of candidates.slice(0, 150)) {
    const info = await getFlightInfo(a.callsign, a.flightNo, a.hex);
    const dir = a.dest === code || a.dest === ap?.ident ? 'arr' : 'dep';
    const leg = dir === 'arr' ? info?.arrival : info?.departure;
    const other = dir === 'arr' ? info?.departure : info?.arrival;
    const otherAp = reference.airport(dir === 'arr' ? a.origin : a.dest);
    const status: FlightStatus = info?.status ?? (a.onGround ? 'scheduled' : 'enroute');
    const entry: BoardEntry = {
      flightNo: a.flightNo, callsign: a.callsign, airline: airlineByIcao(a.operator)?.name, airlineIcao: a.operator,
      counterpart: { icao: other?.airport ?? otherAp?.icao, iata: other?.iata ?? otherAp?.iata, name: other?.name ?? otherAp?.name },
      scheduled: leg?.scheduled, estimated: leg?.estimated, actual: leg?.actual, terminal: leg?.terminal, gate: leg?.gate,
      status, delayMin: info?.delayMin ?? legDelay(leg), aircraftType: a.type, reg: a.reg, hex: a.hex,
    };
    (dir === 'arr' ? arrivals : departures).push(entry);
  }
  const byTime = (x: BoardEntry, y: BoardEntry) => (x.estimated ?? x.scheduled ?? '').localeCompare(y.estimated ?? y.scheduled ?? '');
  return { arrivals: arrivals.sort(byTime), departures: departures.sort(byTime) };
}

export async function getAirportBoard(code: string): Promise<AirportBoard | undefined> {
  const ap = reference.airport(code);
  if (!ap) return undefined;
  const icao = ap.icao ?? ap.ident;
  return cached(`board:${icao}`, 120, async () => {
    let board: { arrivals: BoardEntry[]; departures: BoardEntry[] } | undefined;
    let source = 'live';
    if (config.AERODATABOX_API_KEY) {
      try { board = await adbBoard(icao); source = 'aerodatabox'; } catch (err) { log.warn({ err: (err as Error).message, icao }, 'aerodatabox board failed'); }
    }
    if (!board && config.AVIATIONSTACK_API_KEY) {
      try { board = await avsBoard(icao); source = 'aviationstack'; } catch (err) { log.warn({ err: (err as Error).message, icao }, 'aviationstack board failed'); }
    }
    if (!board) {
      board = await liveBoard(icao);
      source = config.feeds.includes('synthetic') ? 'synthetic' : 'live';
    }
    const onGround = store.all()
      .filter((a) => a.onGround && haversineKm(a.lat, a.lon, ap.lat, ap.lon) < 6)
      .map((a) => ({ hex: a.hex, callsign: a.callsign, reg: a.reg, type: a.type, category: a.category }));
    const stats = delayIndexFrom([...board.arrivals, ...board.departures]);
    const result: AirportBoard = { icao, generatedAt: new Date().toISOString(), source, arrivals: board.arrivals, departures: board.departures, onGround, ...stats };
    if (dbAvailable()) {
      query('INSERT INTO airport_delay_samples (ts, icao, delay_index, avg_delay, cancelled, sampled) VALUES (date_trunc(\'minute\', now()), $1, $2, $3, $4, $5) ON CONFLICT DO NOTHING',
        [icao, stats.delayIndex, stats.avgDelayMin, stats.cancelled, board.arrivals.length + board.departures.length]).catch(() => undefined);
    }
    return result;
  });
}

/**
 * Delay severity for the busiest airports (for the global disruption map). With a schedule
 * provider this costs one board request per airport, so it is sampled slowly and cached.
 */
export async function getDisruptionMap(limit = 60): Promise<DelaySeverity[]> {
  return cached(`disruption:${limit}`, 300, async () => {
    const majors = rankedAirports(limit);
    const out: DelaySeverity[] = [];
    const concurrency = config.AERODATABOX_API_KEY || config.AVIATIONSTACK_API_KEY ? 2 : 8;
    let i = 0;
    await Promise.all(Array.from({ length: concurrency }, async () => {
      while (i < majors.length) {
        const ap = majors[i++];
        try {
          const b = await getAirportBoard(ap.icao ?? ap.ident);
          if (!b) continue;
          out.push({ icao: b.icao, iata: ap.iata, name: ap.name, lat: ap.lat, lon: ap.lon, delayIndex: b.delayIndex, avgDelayMin: b.avgDelayMin, cancelled: b.cancelled, sampled: b.arrivals.length + b.departures.length });
        } catch { /* skip */ }
      }
    }));
    return out.sort((a, b) => b.delayIndex - a.delayIndex);
  });
}

/** Major airports ranked by current live traffic around them, falling back to a static set. */
export function rankedAirports(limit: number) {
  const counts = new Map<string, number>();
  for (const a of store.all()) {
    for (const c of [a.origin, a.dest]) if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  const majors = reference.majorAirports(2000);
  return majors
    .map((ap) => ({ ap, n: counts.get(ap.icao ?? ap.ident) ?? 0 }))
    .sort((x, y) => y.n - x.n)
    .slice(0, limit)
    .map((x) => x.ap);
}
