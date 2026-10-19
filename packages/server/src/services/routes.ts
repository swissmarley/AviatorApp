import { config } from '../config.js';
import { log } from '../log.js';
import { cached } from './cache.js';
import { fetchJson, RateLimiter } from './http.js';
import { store } from '../store/aircraftStore.js';
import { getFlightInfo } from './flightInfo.js';

/**
 * Origin/destination lookup for live callsigns.
 * 1. adsb.lol's free routeset endpoint (backed by adsbdb) — batched, no key.
 * 2. AeroDataBox / AviationStack when configured (also fills schedule times).
 */
interface RouteSetEntry { callsign: string; airport_codes?: string; _airport_codes_iata?: string; airports?: { icao: string; iata?: string }[]; plausible?: number }

const limiter = new RateLimiter(2000);
const queue = new Set<string>();
let timer: NodeJS.Timeout | undefined;

export function startRouteLookup(): void {
  if (!config.ROUTE_LOOKUP) return;
  store.on((e) => {
    if (e.type === 'appear' || e.type === 'callsign') enqueue(e.a.hex);
  });
  timer = setInterval(() => void drain(), 3000);
  log.info('route lookup started');
}

export function stopRouteLookup(): void { if (timer) clearInterval(timer); }

function enqueue(hex: string): void {
  const e = store.entry(hex);
  if (!e) return;
  const a = e.state;
  if (!a.callsign || !a.operator || a.origin) return;
  if (a.feed === 'synthetic') return;
  if (e.routeChecked && Date.now() - e.routeChecked < 30 * 60_000) return;
  queue.add(hex);
}

async function drain(): Promise<void> {
  if (!queue.size) return;
  const batch = [...queue].slice(0, 100);
  for (const h of batch) queue.delete(h);
  const entries = batch.map((h) => store.entry(h)).filter((e): e is NonNullable<typeof e> => !!e && !!e.state.callsign);
  if (!entries.length) return;
  const now = Date.now();
  for (const e of entries) e.routeChecked = now;

  const callsigns = [...new Set(entries.map((e) => e.state.callsign!))];
  const routes = await cached(`routeset:${callsigns.sort().join(',')}`, 6 * 3600, async () => {
    try {
      const res = await fetchJson<RouteSetEntry[]>(config.ROUTESET_URL, {
        method: 'POST', body: JSON.stringify({ planes: callsigns.map((c) => ({ callsign: c, lat: 0, lng: 0 })) }),
        headers: { 'content-type': 'application/json' }, limiter, timeoutMs: 20000,
      });
      const out: Record<string, { origin: string; dest: string }> = {};
      for (const r of res) {
        const codes = r.airports?.map((a) => a.icao) ?? r.airport_codes?.split('-');
        if (codes && codes.length >= 2 && codes[0] !== 'unknown') out[r.callsign] = { origin: codes[0], dest: codes[codes.length - 1] };
      }
      return out;
    } catch (err) {
      log.debug({ err: (err as Error).message }, 'routeset lookup failed');
      return {};
    }
  });
  for (const e of entries) {
    const r = routes[e.state.callsign!];
    if (r) { e.state.origin = r.origin; e.state.dest = r.dest; }
  }
  // For aircraft still without a route, try the schedule providers one at a time (they are rate limited and paid).
  if (config.AERODATABOX_API_KEY || config.AVIATIONSTACK_API_KEY) {
    for (const e of entries.filter((x) => !x.state.origin).slice(0, 5)) {
      try {
        const info = await getFlightInfo(e.state.callsign!, e.state.flightNo);
        if (info?.departure?.airport) e.state.origin = info.departure.airport;
        if (info?.arrival?.airport) e.state.dest = info.arrival.airport;
      } catch { /* ignore */ }
    }
  }
}
