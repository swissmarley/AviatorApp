import type { FlightInfo, FlightLeg, FlightStatus } from '@contrail/shared';
import { airlineByIata, airlineByIcao, haversineKm, parseCallsign } from '@contrail/shared';
import { config } from '../config.js';
import { log } from '../log.js';
import { cached } from './cache.js';
import { fetchJson, RateLimiter } from './http.js';
import { reference } from '../data/reference.js';
import { store } from '../store/aircraftStore.js';

/**
 * Schedule / route information for a flight.
 * Providers (in order): AeroDataBox (RapidAPI), AviationStack, synthetic (demo feed only).
 */

const adbLimiter = new RateLimiter(600);
const avsLimiter = new RateLimiter(1000);

// ---------- AeroDataBox ----------
interface AdbTime { utc?: string; local?: string }
interface AdbLeg { airport?: { icao?: string; iata?: string; name?: string; location?: { lat: number; lon: number } }; scheduledTime?: AdbTime; revisedTime?: AdbTime; predictedTime?: AdbTime; runwayTime?: AdbTime; terminal?: string; gate?: string; runway?: string }
export interface AdbFlight { number?: string; callSign?: string; status?: string; isCargo?: boolean; departure?: AdbLeg; arrival?: AdbLeg; aircraft?: { reg?: string; modeS?: string; model?: string }; airline?: { name?: string; iata?: string; icao?: string }; greatCircleDistance?: { km?: number } }

export function adbStatus(s?: string): FlightStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'expected': case 'checkin': return 'scheduled';
    case 'boarding': case 'gateclosed': return 'boarding';
    case 'departed': return 'departed';
    case 'enroute': case 'approaching': return 'enroute';
    case 'arrived': return 'arrived';
    case 'delayed': return 'delayed';
    case 'canceled': case 'cancelled': case 'canceleduncertain': return 'cancelled';
    case 'diverted': return 'diverted';
    default: return 'unknown';
  }
}

export function adbLeg(l?: AdbLeg): FlightLeg | undefined {
  if (!l?.airport) return undefined;
  const ap = reference.airport(l.airport.icao ?? l.airport.iata);
  return {
    airport: l.airport.icao ?? ap?.icao ?? l.airport.iata ?? '',
    iata: l.airport.iata ?? ap?.iata,
    name: l.airport.name ?? ap?.name,
    scheduled: l.scheduledTime?.utc,
    estimated: l.revisedTime?.utc ?? l.predictedTime?.utc,
    actual: l.runwayTime?.utc,
    terminal: l.terminal, gate: l.gate, runway: l.runway,
    lat: l.airport.location?.lat ?? ap?.lat, lon: l.airport.location?.lon ?? ap?.lon,
  };
}

export function adbToFlightInfo(f: AdbFlight): FlightInfo {
  const dep = adbLeg(f.departure), arr = adbLeg(f.arrival);
  const delayMin = legDelay(arr) ?? legDelay(dep);
  return {
    callsign: f.callSign, flightNo: f.number?.replace(/\s+/g, ''),
    airline: { icao: f.airline?.icao, iata: f.airline?.iata, name: f.airline?.name },
    aircraft: { reg: f.aircraft?.reg, model: f.aircraft?.model },
    departure: dep, arrival: arr, status: adbStatus(f.status), delayMin, source: 'aerodatabox', distanceKm: f.greatCircleDistance?.km,
  };
}

export function legDelay(l?: FlightLeg): number | undefined {
  if (!l?.scheduled) return undefined;
  const ref = l.actual ?? l.estimated;
  if (!ref) return undefined;
  return Math.round((new Date(ref).getTime() - new Date(l.scheduled).getTime()) / 60000);
}

async function adbByCallsign(callsign: string): Promise<FlightInfo | undefined> {
  const url = `https://${config.AERODATABOX_HOST}/flights/callsign/${encodeURIComponent(callsign)}?withAircraftImage=false&withLocation=false`;
  const res = await fetchJson<AdbFlight[]>(url, { headers: { 'x-rapidapi-key': config.AERODATABOX_API_KEY!, 'x-rapidapi-host': config.AERODATABOX_HOST }, limiter: adbLimiter });
  if (!Array.isArray(res) || !res.length) return undefined;
  // Prefer the flight closest to now.
  const now = Date.now();
  const scored = res.map((f) => ({ f, d: Math.abs(new Date(f.departure?.scheduledTime?.utc ?? 0).getTime() - now) })).sort((a, b) => a.d - b.d);
  return adbToFlightInfo(scored[0].f);
}

// ---------- AviationStack ----------
interface AvsLeg { airport?: string; timezone?: string; iata?: string; icao?: string; terminal?: string; gate?: string; delay?: number; scheduled?: string; estimated?: string; actual?: string }
export interface AvsFlight { flight_date?: string; flight_status?: string; departure?: AvsLeg; arrival?: AvsLeg; airline?: { name?: string; iata?: string; icao?: string }; flight?: { number?: string; iata?: string; icao?: string }; aircraft?: { registration?: string; iata?: string; icao?: string; icao24?: string } | null }

export function avsStatus(s?: string): FlightStatus {
  switch (s) {
    case 'scheduled': return 'scheduled';
    case 'active': return 'enroute';
    case 'landed': return 'landed';
    case 'cancelled': return 'cancelled';
    case 'diverted': return 'diverted';
    default: return 'unknown';
  }
}

export function avsLeg(l?: AvsLeg): FlightLeg | undefined {
  if (!l) return undefined;
  const ap = reference.airport(l.icao ?? l.iata);
  return { airport: l.icao ?? ap?.icao ?? '', iata: l.iata ?? ap?.iata, name: l.airport ?? ap?.name, scheduled: l.scheduled ?? undefined, estimated: l.estimated ?? undefined, actual: l.actual ?? undefined, terminal: l.terminal ?? undefined, gate: l.gate ?? undefined, lat: ap?.lat, lon: ap?.lon };
}

export function avsToFlightInfo(f: AvsFlight): FlightInfo {
  const dep = avsLeg(f.departure), arr = avsLeg(f.arrival);
  return {
    callsign: f.flight?.icao, flightNo: f.flight?.iata,
    airline: { icao: f.airline?.icao, iata: f.airline?.iata, name: f.airline?.name },
    aircraft: { reg: f.aircraft?.registration ?? undefined, type: f.aircraft?.icao ?? undefined },
    departure: dep, arrival: arr, status: avsStatus(f.flight_status), delayMin: f.arrival?.delay ?? f.departure?.delay ?? legDelay(arr) ?? legDelay(dep), source: 'aviationstack',
  };
}

export function avsBaseUrl(): string {
  return process.env.AVIATIONSTACK_BASE_URL ?? 'http://api.aviationstack.com/v1';
}

async function avsByCallsign(callsign: string, flightNo?: string): Promise<FlightInfo | undefined> {
  const params = new URLSearchParams({ access_key: config.AVIATIONSTACK_API_KEY!, limit: '5' });
  if (flightNo) params.set('flight_iata', flightNo); else params.set('flight_icao', callsign);
  const res = await fetchJson<{ data?: AvsFlight[] }>(`${avsBaseUrl()}/flights?${params}`, { limiter: avsLimiter });
  const f = res.data?.find((x) => x.flight_status === 'active') ?? res.data?.[0];
  return f ? avsToFlightInfo(f) : undefined;
}

// ---------- synthetic ----------
function syntheticInfo(hex: string): FlightInfo | undefined {
  const a = store.get(hex);
  if (!a || a.feed !== 'synthetic' || !a.origin || !a.dest) return undefined;
  const o = reference.airport(a.origin), d = reference.airport(a.dest);
  if (!o || !d) return undefined;
  const distKm = haversineKm(o.lat, o.lon, d.lat, d.lon);
  const flown = Math.min(distKm, haversineKm(o.lat, o.lon, a.lat, a.lon));
  const remaining = Math.max(0, haversineKm(a.lat, a.lon, d.lat, d.lon));
  const cruiseKmh = 800;
  const now = Date.now();
  const seed = parseInt(hex, 16);
  const atOrigin = a.onGround && flown < 5;
  const atDest = a.onGround && haversineKm(a.lat, a.lon, d.lat, d.lon) < 5;
  // deterministic delay profile: most flights on time, some 20–70 min, a few 45–135 min
  const delay = seed % 7 === 0 ? 20 + (seed % 50) : seed % 11 === 0 ? 45 + (seed % 90) : seed % 3;
  const blockMs = (distKm / cruiseKmh) * 3600_000 + 25 * 60_000;
  // ETA uses at least ~85 % of cruise speed so a climbing or taxiing aircraft is not projected at taxi speed for 9,000 km
  const airSpeedKmh = Math.max(cruiseKmh * 0.85, (a.gs ?? 0) * 1.852);
  const elapsedMs = atOrigin ? 0 : (flown / cruiseKmh) * 3600_000 + 10 * 60_000;
  const depActual = atOrigin ? now + 12 * 60_000 : now - elapsedMs;      // on the ground at origin: pushback in ~12 min
  const depSched = depActual - delay * 60_000;
  const arrSched = depSched + blockMs;
  const etaMs = atDest ? now - 5 * 60_000 : atOrigin ? depActual + blockMs : now + (remaining / airSpeedKmh) * 3600_000 + 8 * 60_000;
  const status: FlightStatus = atDest ? 'arrived' : atOrigin ? (delay > 15 ? 'delayed' : 'boarding') : a.onGround ? 'departed' : 'enroute';
  const gateFor = (n: number) => `${String.fromCharCode(65 + (n % 6))}${1 + (n % 40)}`;
  return {
    callsign: a.callsign, flightNo: a.flightNo,
    airline: { icao: a.operator, iata: airlineByIcao(a.operator)?.iata, name: airlineByIcao(a.operator)?.name },
    aircraft: { reg: a.reg, type: a.type },
    departure: { airport: o.icao ?? o.ident, iata: o.iata, name: o.name, scheduled: new Date(depSched).toISOString(), estimated: new Date(depActual).toISOString(), actual: atOrigin ? undefined : new Date(depActual).toISOString(), terminal: String(1 + (seed % 5)), gate: gateFor(seed), lat: o.lat, lon: o.lon },
    arrival: { airport: d.icao ?? d.ident, iata: d.iata, name: d.name, scheduled: new Date(arrSched).toISOString(), estimated: new Date(etaMs).toISOString(), actual: atDest ? new Date(now - 5 * 60_000).toISOString() : undefined, terminal: String(1 + (seed % 3)), gate: gateFor(seed >> 3), lat: d.lat, lon: d.lon },
    status, delayMin: Math.max(-30, Math.round((etaMs - arrSched) / 60000)), source: 'synthetic', distanceKm: distKm,
  };
}

export async function getFlightInfo(callsign?: string, flightNo?: string, hex?: string): Promise<FlightInfo | undefined> {
  if (hex) {
    const syn = syntheticInfo(hex);
    if (syn) return syn;
  }
  if (!callsign && !flightNo) return undefined;
  const key = `flight:${callsign ?? ''}:${flightNo ?? ''}`;
  return cached(key, 10 * 60, async () => {
    if (config.AERODATABOX_API_KEY && callsign) {
      try { const r = await adbByCallsign(callsign); if (r) return r; } catch (err) { log.warn({ err: (err as Error).message }, 'aerodatabox lookup failed'); }
    }
    if (config.AVIATIONSTACK_API_KEY) {
      try { const r = await avsByCallsign(callsign ?? '', flightNo); if (r) return r; } catch (err) { log.warn({ err: (err as Error).message }, 'aviationstack lookup failed'); }
    }
    // Minimal fallback: route only, from the live state.
    const live = hex ? store.get(hex) : callsign ? store.search(callsign, 1)[0] : undefined;
    if (live?.origin || live?.dest) {
      const o = reference.airport(live.origin), d = reference.airport(live.dest);
      const parsed = parseCallsign(live.callsign);
      return {
        callsign: live.callsign, flightNo: live.flightNo,
        airline: { icao: parsed.operator, iata: parsed.airline?.iata ?? airlineByIata(parsed.airline?.iata)?.iata, name: parsed.airline?.name },
        aircraft: { reg: live.reg, type: live.type },
        departure: o ? { airport: o.icao ?? o.ident, iata: o.iata, name: o.name, lat: o.lat, lon: o.lon } : undefined,
        arrival: d ? { airport: d.icao ?? d.ident, iata: d.iata, name: d.name, lat: d.lat, lon: d.lon } : undefined,
        status: live.onGround ? 'unknown' : 'enroute', source: 'route-only',
        distanceKm: o && d ? haversineKm(o.lat, o.lon, d.lat, d.lon) : undefined,
      } satisfies FlightInfo;
    }
    return undefined as unknown as FlightInfo;
  });
}
