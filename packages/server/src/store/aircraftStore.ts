import type { AircraftState, BBox, PositionSource, TrailPoint } from '@contrail/shared';
import { bboxContains, classifyAircraft, destinationPoint, emergencyFromSquawk, haversineKm, headingDelta, parseCallsign, staticHash } from '@contrail/shared';
import type { FeedAircraft, FeedPollResult } from '../feeds/types.js';
import { config } from '../config.js';
import { log } from '../log.js';

const SOURCE_RANK: Record<PositionSource, number> = { adsb: 5, adsc: 4, flarm: 3, mlat: 3, tisb: 2, other: 1, estimated: 0 };

export interface Entry {
  state: AircraftState;
  /** per-feed last-seen timestamps */
  feeds: Map<string, number>;
  trail: TrailPoint[];
  /** last real (non-estimated) position */
  lastReal: { lat: number; lon: number; ts: number; source: PositionSource; track?: number; gs?: number; alt?: number };
  hash: string;
  firstSeen: number;
  routeChecked?: number;
  prevTrack?: { track: number; ts: number };
}

export type StoreEvent =
  | { type: 'appear'; a: AircraftState }
  | { type: 'expire'; a: AircraftState }
  | { type: 'airborne'; a: AircraftState }
  | { type: 'landed'; a: AircraftState }
  | { type: 'emergency'; a: AircraftState }
  | { type: 'callsign'; a: AircraftState; previous?: string };

type Listener = (e: StoreEvent) => void;

export class AircraftStore {
  readonly entries = new Map<string, Entry>();
  private listeners: Listener[] = [];
  private lastTick = Date.now();
  private coverageByFeed = new Map<string, FeedPollResult['coverage']>();

  on(fn: Listener): void { this.listeners.push(fn); }
  private emit(e: StoreEvent): void { for (const l of this.listeners) { try { l(e); } catch (err) { log.error({ err }, 'store listener failed'); } } }

  get size(): number { return this.entries.size; }

  get(hex: string): AircraftState | undefined { return this.entries.get(hex.toLowerCase())?.state; }
  entry(hex: string): Entry | undefined { return this.entries.get(hex.toLowerCase()); }

  /** Apply a feed poll result. */
  ingest(feed: string, result: FeedPollResult): void {
    this.coverageByFeed.set(feed, result.coverage);
    for (const a of result.aircraft) this.merge(feed, a);
  }

  private merge(feed: string, a: FeedAircraft): void {
    const hex = a.hex.toLowerCase();
    const now = Date.now();
    let e = this.entries.get(hex);
    if (!e) {
      const state: AircraftState = {
        hex, lat: a.lat, lon: a.lon, ts: a.ts, onGround: a.onGround, emergency: a.emergency ?? emergencyFromSquawk(a.squawk),
        category: 'unknown', military: !!a.military, source: a.source, feed, seen: a.seen ?? 0, seenPos: a.seenPos ?? 0,
      };
      e = { state, feeds: new Map(), trail: [], lastReal: { lat: a.lat, lon: a.lon, ts: a.ts, source: a.source }, hash: '', firstSeen: now };
      this.entries.set(hex, e);
      this.applyStatic(e, a, feed);
      this.applyPosition(e, a, feed, true);
      this.reclassify(e);
      this.emit({ type: 'appear', a: e.state });
      return;
    }
    e.feeds.set(feed, now);
    const prevCallsign = e.state.callsign;
    this.applyStatic(e, a, feed);
    if (e.state.callsign !== prevCallsign && e.state.callsign) this.emit({ type: 'callsign', a: e.state, previous: prevCallsign });

    // Adopt the position if it is newer, or same age but from a better source.
    const cur = e.lastReal;
    const newer = a.ts > cur.ts + 500;
    const sameAgeBetter = Math.abs(a.ts - cur.ts) <= 500 && SOURCE_RANK[a.source] > SOURCE_RANK[cur.source];
    if (newer || sameAgeBetter || e.state.source === 'estimated') {
      const wasGround = e.state.onGround;
      const wasEmergency = e.state.emergency;
      this.applyPosition(e, a, feed, false);
      this.reclassify(e);
      if (wasGround && !e.state.onGround) this.emit({ type: 'airborne', a: e.state });
      if (!wasGround && e.state.onGround) this.emit({ type: 'landed', a: e.state });
      if (wasEmergency === 'none' && e.state.emergency !== 'none') this.emit({ type: 'emergency', a: e.state });
    }
  }

  private applyStatic(e: Entry, a: FeedAircraft, feed: string): void {
    const s = e.state;
    if (a.callsign) s.callsign = a.callsign;
    if (a.reg) s.reg = a.reg;
    if (a.type) s.type = a.type;
    if (a.desc) s.desc = a.desc;
    if (a.emitter) s.emitter = a.emitter;
    if (a.military) s.military = true;
    if (a.origin) s.origin = a.origin;
    if (a.dest) s.dest = a.dest;
    const parsed = parseCallsign(s.callsign);
    s.operator = parsed.operator;
    s.flightNo = parsed.flightNo;
    if (parsed.military) s.military = true;
    e.feeds.set(feed, Date.now());
  }

  private applyPosition(e: Entry, a: FeedAircraft, feed: string, first: boolean): void {
    const s = e.state;
    // Turn rate from consecutive tracks.
    if (a.track !== undefined && e.prevTrack && a.ts > e.prevTrack.ts) {
      const dt = (a.ts - e.prevTrack.ts) / 1000;
      if (dt >= 1 && dt <= 60) s.turnRate = Math.round((headingDelta(e.prevTrack.track, a.track) / dt) * 100) / 100;
    }
    if (a.track !== undefined) e.prevTrack = { track: a.track, ts: a.ts };

    s.lat = a.lat; s.lon = a.lon; s.ts = a.ts; s.source = a.source; s.feed = feed;
    s.onGround = a.onGround;
    if (a.altBaro !== undefined) s.altBaro = a.altBaro; else if (a.onGround) s.altBaro = 0;
    if (a.altGeom !== undefined) s.altGeom = a.altGeom;
    if (a.gs !== undefined) s.gs = a.gs;
    if (a.tas !== undefined) s.tas = a.tas;
    if (a.track !== undefined) s.track = a.track;
    if (a.heading !== undefined) s.heading = a.heading;
    if (a.vr !== undefined) s.vr = a.vr;
    if (a.squawk !== undefined) s.squawk = a.squawk;
    s.emergency = a.emergency && a.emergency !== 'none' ? a.emergency : emergencyFromSquawk(s.squawk);
    if (a.rssi !== undefined) s.rssi = a.rssi;
    s.seen = a.seen ?? 0;
    s.seenPos = a.seenPos ?? Math.max(0, (Date.now() - a.ts) / 1000);
    e.lastReal = { lat: a.lat, lon: a.lon, ts: a.ts, source: a.source, track: s.track, gs: s.gs, alt: s.altBaro };
    this.pushTrail(e, first);
  }

  private pushTrail(e: Entry, first: boolean): void {
    const s = e.state;
    const last = e.trail[e.trail.length - 1];
    if (!first && last) {
      const dt = s.ts - last.ts;
      if (dt < 1000) return;
      const moved = haversineKm(last.lat, last.lon, s.lat, s.lon);
      if (dt < 5000 && moved < 0.05) return;
      if (s.onGround && dt < 30000 && moved < 0.02) return;
    }
    e.trail.push({ ts: s.ts, lat: s.lat, lon: s.lon, alt: s.altBaro, gs: s.gs, track: s.track, vr: s.vr, source: s.source });
    if (e.trail.length > config.TRAIL_MAX_POINTS) e.trail.splice(0, e.trail.length - config.TRAIL_MAX_POINTS);
  }

  private reclassify(e: Entry): void {
    const s = e.state;
    s.category = classifyAircraft(s);
    e.hash = staticHash(s);
  }

  /** Called every second: ages entries, dead-reckons quiet ones, expires stale ones. */
  tick(): void {
    const now = Date.now();
    this.lastTick = now;
    for (const [hex, e] of this.entries) {
      const s = e.state;
      const agePos = (now - e.lastReal.ts) / 1000;
      s.seenPos = agePos;
      s.seen = Math.max(0, (now - Math.max(...e.feeds.values(), e.lastReal.ts)) / 1000);
      const expireAfter = s.onGround ? config.EXPIRE_GROUND_S : config.EXPIRE_AIRBORNE_S;
      if (agePos > expireAfter) {
        this.entries.delete(hex);
        this.emit({ type: 'expire', a: s });
        continue;
      }
      if (agePos > config.ESTIMATE_AFTER_S && !s.onGround && e.lastReal.gs !== undefined && e.lastReal.track !== undefined) {
        const distKm = (e.lastReal.gs * 1.852 * agePos) / 3600;
        const [lat, lon] = destinationPoint(e.lastReal.lat, e.lastReal.lon, e.lastReal.track, distKm);
        s.lat = lat; s.lon = lon; s.ts = now; s.source = 'estimated';
        if (e.lastReal.alt !== undefined && s.vr) s.altBaro = Math.max(0, Math.round(e.lastReal.alt + (s.vr * agePos) / 60));
      }
    }
  }

  inBBox(b: BBox): AircraftState[] {
    const out: AircraftState[] = [];
    for (const e of this.entries.values()) if (bboxContains(b, e.state.lat, e.state.lon)) out.push(e.state);
    return out;
  }

  all(): AircraftState[] {
    return [...this.entries.values()].map((e) => e.state);
  }

  emergencies(): AircraftState[] {
    const out: AircraftState[] = [];
    for (const e of this.entries.values()) if (e.state.emergency !== 'none') out.push(e.state);
    return out;
  }

  trail(hex: string): TrailPoint[] {
    return this.entries.get(hex.toLowerCase())?.trail ?? [];
  }

  /** Simple text search over live aircraft. */
  search(q: string, limit = 20): AircraftState[] {
    const s = q.trim().toUpperCase();
    if (!s) return [];
    const out: { a: AircraftState; score: number }[] = [];
    for (const e of this.entries.values()) {
      const a = e.state;
      let score = 0;
      if (a.hex.toUpperCase() === s) score = 100;
      else if (a.callsign === s || a.flightNo === s || a.reg?.toUpperCase() === s) score = 90;
      else if (a.callsign?.startsWith(s) || a.flightNo?.startsWith(s) || a.reg?.toUpperCase().startsWith(s)) score = 70;
      else if (a.type?.toUpperCase() === s) score = 50;
      else if (a.operator === s) score = 40;
      else if (a.callsign?.includes(s) || a.reg?.toUpperCase().includes(s) || a.hex.toUpperCase().includes(s)) score = 20;
      if (score) out.push({ a, score });
    }
    return out.sort((x, y) => y.score - x.score).slice(0, limit).map((x) => x.a);
  }

  summary(): { total: number; airborne: number; onGround: number; bySource: Record<string, number>; byCategory: Record<string, number>; byOperator: Map<string, number> } {
    const bySource: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    const byOperator = new Map<string, number>();
    let airborne = 0, onGround = 0;
    for (const e of this.entries.values()) {
      const s = e.state;
      if (s.onGround) onGround++; else airborne++;
      bySource[s.source] = (bySource[s.source] ?? 0) + 1;
      byCategory[s.category] = (byCategory[s.category] ?? 0) + 1;
      if (s.operator) byOperator.set(s.operator, (byOperator.get(s.operator) ?? 0) + 1);
    }
    return { total: this.entries.size, airborne, onGround, bySource, byCategory, byOperator };
  }
}

export const store = new AircraftStore();
