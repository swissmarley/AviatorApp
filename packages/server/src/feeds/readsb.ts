import type { BBox, EmergencyKind, PositionSource } from '@contrail/shared';
import { haversineKm, nmToKm } from '@contrail/shared';
import type { FeedAdapter, FeedAircraft, FeedPollResult, FeedStatus, InterestArea } from './types.js';
import { fetchJson, HttpError, RateLimiter } from '../services/http.js';
import { log } from '../log.js';

/**
 * Adapter for readsb/tar1090-style JSON APIs: adsb.lol and airplanes.live share this format.
 *
 * Both services ask for no more than ~1 request/second and a descriptive User-Agent.
 * The adapter first tries the global `/v2/all` endpoint (adsb.lol). If the service does not
 * offer it, it falls back to polling 250 nm circles via `/v2/point/{lat}/{lon}/{radius}`:
 * the configured regions plus whatever areas connected clients are currently looking at.
 */

interface ReadsbAircraft {
  hex: string;
  type?: string;
  flight?: string;
  r?: string;
  t?: string;
  desc?: string;
  dbFlags?: number;
  alt_baro?: number | 'ground';
  alt_geom?: number;
  gs?: number;
  tas?: number;
  track?: number;
  true_heading?: number;
  baro_rate?: number;
  geom_rate?: number;
  squawk?: string;
  emergency?: string;
  category?: string;
  lat?: number;
  lon?: number;
  seen_pos?: number;
  seen?: number;
  rssi?: number;
  mlat?: string[];
  tisb?: string[];
}

interface ReadsbResponse { ac?: ReadsbAircraft[]; now?: number; total?: number; msg?: string }

export interface ReadsbOptions {
  name: string;
  baseUrl: string;
  intervalMs: number;
  minRequestIntervalMs: number;
  /** Static circles to poll when the service has no global endpoint. */
  regions: { lat: number; lon: number; radiusNm: number }[];
  /** Only poll regions intersecting this box (and ignore aircraft outside it). */
  bbox?: BBox;
  /** Try `/v2/all` first. */
  tryGlobal: boolean;
}

export const DEFAULT_REGIONS: { lat: number; lon: number; radiusNm: number }[] = [
  // Europe
  { lat: 51.5, lon: -0.5, radiusNm: 250 }, { lat: 48.5, lon: 7.5, radiusNm: 250 }, { lat: 52.5, lon: 13.5, radiusNm: 250 },
  { lat: 45.5, lon: 2.0, radiusNm: 250 }, { lat: 43.0, lon: 12.0, radiusNm: 250 }, { lat: 40.5, lon: -3.5, radiusNm: 250 },
  { lat: 59.5, lon: 15.0, radiusNm: 250 }, { lat: 47.0, lon: 20.0, radiusNm: 250 }, { lat: 39.0, lon: 25.0, radiusNm: 250 },
  // North America
  { lat: 40.5, lon: -74.5, radiusNm: 250 }, { lat: 41.5, lon: -87.5, radiusNm: 250 }, { lat: 33.5, lon: -84.5, radiusNm: 250 },
  { lat: 32.5, lon: -97.0, radiusNm: 250 }, { lat: 39.5, lon: -105.0, radiusNm: 250 }, { lat: 34.0, lon: -118.0, radiusNm: 250 },
  { lat: 37.5, lon: -122.0, radiusNm: 250 }, { lat: 47.5, lon: -122.0, radiusNm: 250 }, { lat: 27.0, lon: -81.0, radiusNm: 250 },
  { lat: 44.0, lon: -79.5, radiusNm: 250 }, { lat: 45.5, lon: -73.5, radiusNm: 250 },
  // Asia-Pacific & Middle East
  { lat: 35.5, lon: 139.5, radiusNm: 250 }, { lat: 34.5, lon: 135.0, radiusNm: 250 }, { lat: 37.5, lon: 127.0, radiusNm: 250 },
  { lat: 22.5, lon: 114.0, radiusNm: 250 }, { lat: 31.0, lon: 121.5, radiusNm: 250 }, { lat: 40.0, lon: 116.5, radiusNm: 250 },
  { lat: 1.5, lon: 103.8, radiusNm: 250 }, { lat: 13.7, lon: 100.7, radiusNm: 250 }, { lat: 25.2, lon: 55.3, radiusNm: 250 },
  { lat: 19.0, lon: 73.0, radiusNm: 250 }, { lat: 28.5, lon: 77.0, radiusNm: 250 }, { lat: -33.8, lon: 151.0, radiusNm: 250 },
  { lat: -37.7, lon: 145.0, radiusNm: 250 }, { lat: -23.5, lon: -46.5, radiusNm: 250 }, { lat: 19.4, lon: -99.1, radiusNm: 250 },
];

export function sourceFromReadsbType(t?: string, mlat?: string[], tisb?: string[]): PositionSource {
  if (mlat && mlat.includes('lat')) return 'mlat';
  if (tisb && tisb.includes('lat')) return 'tisb';
  if (!t) return 'other';
  if (t.startsWith('adsb') || t.startsWith('adsr')) return 'adsb';
  if (t === 'mlat') return 'mlat';
  if (t.startsWith('tisb')) return 'tisb';
  if (t === 'adsc') return 'adsc';
  return 'other';
}

const EMERGENCIES = new Set<EmergencyKind>(['none', 'general', 'lifeguard', 'minfuel', 'nordo', 'unlawful', 'downed', 'reserved']);

export function mapReadsbAircraft(ac: ReadsbAircraft, now: number, feed: string): FeedAircraft | null {
  if (typeof ac.lat !== 'number' || typeof ac.lon !== 'number') return null;
  if (!ac.hex || /^~/.test(ac.hex)) {
    // '~' prefixed hexes are TIS-B trackfiles without a real ICAO address; keep them but mark them.
    if (!ac.hex) return null;
  }
  const seenPos = ac.seen_pos ?? ac.seen ?? 0;
  const onGround = ac.alt_baro === 'ground';
  const emergency = (ac.emergency && EMERGENCIES.has(ac.emergency as EmergencyKind) ? ac.emergency : 'none') as EmergencyKind;
  return {
    hex: ac.hex.replace('~', '').toLowerCase(),
    lat: ac.lat,
    lon: ac.lon,
    ts: now - seenPos * 1000,
    seenPos,
    seen: ac.seen ?? seenPos,
    source: sourceFromReadsbType(ac.type, ac.mlat, ac.tisb),
    onGround,
    callsign: ac.flight?.trim() || undefined,
    reg: ac.r || undefined,
    type: ac.t || undefined,
    desc: ac.desc || undefined,
    altBaro: typeof ac.alt_baro === 'number' ? ac.alt_baro : onGround ? 0 : undefined,
    altGeom: ac.alt_geom,
    gs: ac.gs,
    tas: ac.tas,
    track: ac.track,
    heading: ac.true_heading,
    vr: ac.baro_rate ?? ac.geom_rate,
    squawk: ac.squawk,
    emergency,
    emitter: ac.category,
    military: !!(ac.dbFlags && ac.dbFlags & 1),
    rssi: ac.rssi,
  };
}

export class ReadsbAdapter implements FeedAdapter {
  readonly name: string;
  readonly intervalMs: number;
  private limiter: RateLimiter;
  private globalSupported: boolean | undefined;
  private cursor = 0;
  private st: FeedStatus;
  private lastAircraft = new Map<string, FeedAircraft>();

  constructor(private opts: ReadsbOptions) {
    this.name = opts.name;
    this.intervalMs = opts.intervalMs;
    this.limiter = new RateLimiter(opts.minRequestIntervalMs);
    this.globalSupported = opts.tryGlobal ? undefined : false;
    this.st = { name: opts.name, healthy: false, aircraft: 0, requests: 0, intervalMs: opts.intervalMs };
  }

  status(): FeedStatus { return { ...this.st }; }

  private inBBox(a: FeedAircraft): boolean {
    const b = this.opts.bbox;
    if (!b) return true;
    return a.lat >= b.south && a.lat <= b.north && a.lon >= b.west && a.lon <= b.east;
  }

  private async request(pathname: string): Promise<ReadsbResponse> {
    this.st.requests++;
    return fetchJson<ReadsbResponse>(`${this.opts.baseUrl}${pathname}`, { limiter: this.limiter, timeoutMs: 25000 });
  }

  async poll(interest: InterestArea[]): Promise<FeedPollResult> {
    const now = Date.now();
    try {
      if (this.globalSupported !== false) {
        try {
          const res = await this.request('/v2/all');
          this.globalSupported = true;
          const aircraft = (res.ac ?? []).map((ac) => mapReadsbAircraft(ac, res.now ? res.now * 1000 : now, this.name)).filter((a): a is FeedAircraft => !!a && this.inBBox(a));
          this.st = { ...this.st, healthy: true, lastSuccess: now, lastError: undefined, aircraft: aircraft.length };
          return { ts: now, aircraft, coverage: 'global' };
        } catch (err) {
          if (err instanceof HttpError && (err.status === 404 || err.status === 405 || err.status === 400)) {
            log.info({ feed: this.name }, 'global endpoint not available, falling back to regional polling');
            this.globalSupported = false;
          } else throw err;
        }
      }
      return await this.pollRegions(interest, now);
    } catch (err) {
      this.st = { ...this.st, healthy: false, lastError: (err as Error).message };
      throw err;
    }
  }

  /** Polls a budget of circles per interval: client viewports first, then the static region list round-robin. */
  private async pollRegions(interest: InterestArea[], now: number): Promise<FeedPollResult> {
    const budget = Math.max(1, Math.floor(this.intervalMs / this.opts.minRequestIntervalMs));
    const circles: { lat: number; lon: number; radiusNm: number }[] = [];
    const sortedInterest = [...interest].sort((a, b) => b.priority - a.priority);
    for (const i of sortedInterest) {
      if (circles.length >= budget) break;
      if (!circles.some((c) => haversineKm(c.lat, c.lon, i.lat, i.lon) < nmToKm(Math.min(c.radiusNm, i.radiusNm)) * 0.5)) {
        circles.push({ lat: i.lat, lon: i.lon, radiusNm: Math.min(250, Math.max(25, i.radiusNm)) });
      }
    }
    const regions = this.opts.regions.filter((r) => !this.opts.bbox || this.circleIntersectsBBox(r, this.opts.bbox));
    while (circles.length < budget && regions.length > 0 && circles.length < regions.length + sortedInterest.length) {
      circles.push(regions[this.cursor % regions.length]);
      this.cursor++;
      if (circles.length >= budget) break;
    }
    const coverage: BBox[] = [];
    const seen = new Map<string, FeedAircraft>();
    for (const c of circles) {
      try {
        const res = await this.request(`/v2/point/${c.lat.toFixed(3)}/${c.lon.toFixed(3)}/${Math.round(c.radiusNm)}`);
        const base = res.now ? res.now * 1000 : Date.now();
        for (const ac of res.ac ?? []) {
          const a = mapReadsbAircraft(ac, base, this.name);
          if (a && this.inBBox(a)) seen.set(a.hex, a);
        }
        const dLat = nmToKm(c.radiusNm) / 111;
        const dLon = dLat / Math.max(0.2, Math.cos((c.lat * Math.PI) / 180));
        coverage.push({ west: c.lon - dLon, east: c.lon + dLon, south: c.lat - dLat, north: c.lat + dLat });
      } catch (err) {
        log.warn({ feed: this.name, circle: c, err: (err as Error).message }, 'regional poll failed');
      }
    }
    for (const a of seen.values()) this.lastAircraft.set(a.hex, a);
    this.st = { ...this.st, healthy: coverage.length > 0, lastSuccess: coverage.length ? now : this.st.lastSuccess, aircraft: seen.size, lastError: coverage.length ? undefined : 'all regional polls failed' };
    return { ts: now, aircraft: [...seen.values()], coverage };
  }

  private circleIntersectsBBox(c: { lat: number; lon: number; radiusNm: number }, b: BBox): boolean {
    const dLat = nmToKm(c.radiusNm) / 111;
    return c.lat + dLat >= b.south && c.lat - dLat <= b.north && c.lon + dLat * 2 >= b.west && c.lon - dLat * 2 <= b.east;
  }
}

export function parseRegions(s?: string): { lat: number; lon: number; radiusNm: number }[] | undefined {
  if (!s) return undefined;
  const out: { lat: number; lon: number; radiusNm: number }[] = [];
  for (const part of s.split(';')) {
    const [lat, lon, r] = part.split(',').map(Number);
    if ([lat, lon, r].every(Number.isFinite)) out.push({ lat, lon, radiusNm: Math.min(250, r) });
  }
  return out.length ? out : undefined;
}
