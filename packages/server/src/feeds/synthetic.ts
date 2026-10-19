import type { Airport, PositionSource } from '@contrail/shared';
import { AIRLINES, AIRCRAFT_TYPES, bearingDeg, destinationPoint, haversineKm, intermediatePoint, normalizeHeading } from '@contrail/shared';
import type { FeedAdapter, FeedAircraft, FeedPollResult, FeedStatus, InterestArea } from './types.js';
import { reference } from '../data/reference.js';

/**
 * Deterministic synthetic traffic generator. It is the default feed so the app runs with no
 * API keys and no network, and it scales to tens of thousands of aircraft for performance testing.
 * Positions are a pure function of (seed, time) so restarts are seamless.
 */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Kind = 'airline' | 'cargo' | 'military' | 'ga' | 'heli' | 'glider' | 'ground' | 'bizjet';

interface Sim {
  hex: string;
  kind: Kind;
  callsign: string;
  reg: string;
  type: string;
  emitter: string;
  squawk: string;
  source: PositionSource;
  /** route for point-to-point kinds */
  origin?: Airport;
  dest?: Airport;
  distKm: number;
  cruiseFt: number;
  cruiseKt: number;
  /** seconds offset into the cycle at t=0 */
  phase: number;
  /** total cycle seconds (flight + turnaround) */
  cycle: number;
  /** base point for local kinds */
  baseLat: number;
  baseLon: number;
  /** gap simulation: every N seconds go quiet for M seconds */
  gapEvery: number;
  gapFor: number;
  hold: boolean;
}

const SHORT = ['A320', 'A20N', 'A321', 'A21N', 'B738', 'B38M', 'E190', 'E175', 'BCS3', 'A319', 'B739', 'CRJ9', 'DH8D', 'AT76'];
const LONG = ['B789', 'B788', 'A359', 'B77W', 'A333', 'A339', 'A388', 'B744', 'B748', 'A35K', 'B772'];
const CARGO = ['B744', 'B748', 'B77L', 'MD11', 'B763', 'A306', 'B752', 'B738'];
const MIL = ['C17', 'C130', 'K35R', 'KC46', 'A400', 'P8', 'E3TF'];
const GA = ['C172', 'SR22', 'P28A', 'C182', 'DA40', 'BE36', 'PC12', 'TBM9'];
const BIZ = ['GLF5', 'GLF6', 'C56X', 'CL35', 'E55P', 'FA7X', 'GLEX', 'C25B'];
const HELI = ['EC35', 'A139', 'R44', 'AS50', 'B06', 'EC45', 'S76'];
const GLIDERS = ['GLID', 'DISC', 'AS21', 'VENT'];

export class SyntheticAdapter implements FeedAdapter {
  readonly name = 'synthetic';
  readonly intervalMs = 1000;
  private sims: Sim[] = [];
  private st: FeedStatus = { name: 'synthetic', healthy: true, aircraft: 0, requests: 0, intervalMs: 1000 };

  constructor(private count: number, private seed: number) {}

  async init(): Promise<void> {
    const rnd = mulberry32(this.seed);
    const majors = reference.airports.filter((a) => a.type === 'large_airport' && a.scheduledService);
    const mediums = reference.airports.filter((a) => a.type === 'medium_airport');
    const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];
    const airlines = AIRLINES.filter((a) => a.iata && !a.cargo && !/Force|Navy|Mobility|NATO/.test(a.name));
    const cargo = AIRLINES.filter((a) => a.cargo);
    const usedHex = new Set<string>();
    const hexFor = () => {
      let h: string;
      do { h = Math.floor(rnd() * 0xffffff).toString(16).padStart(6, '0'); } while (usedHex.has(h));
      usedHex.add(h);
      return h;
    };
    const regFor = (country?: string) => {
      const L = () => String.fromCharCode(65 + Math.floor(rnd() * 26));
      switch (country) {
        case 'US': return `N${Math.floor(100 + rnd() * 899)}${L()}${L()}`;
        case 'GB': return `G-${L()}${L()}${L()}${L()}`;
        case 'DE': return `D-A${L()}${L()}${L()}`;
        case 'FR': return `F-G${L()}${L()}${L()}`;
        case 'CA': return `C-F${L()}${L()}${L()}`;
        case 'AU': return `VH-${L()}${L()}${L()}`;
        case 'JP': return `JA${Math.floor(100 + rnd() * 899)}${L()}`;
        case 'CN': return `B-${Math.floor(1000 + rnd() * 8999)}`;
        case 'AE': return `A6-E${L()}${L()}`;
        case 'IE': return `EI-${L()}${L()}${L()}`;
        case 'NL': return `PH-${L()}${L()}${L()}`;
        case 'ES': return `EC-${L()}${L()}${L()}`;
        case 'CH': return `HB-J${L()}${L()}`;
        case 'TR': return `TC-${L()}${L()}${L()}`;
        case 'SG': return `9V-S${L()}${L()}`;
        case 'KR': return `HL${Math.floor(7000 + rnd() * 2999)}`;
        default: return `${L()}${L()}-${L()}${L()}${L()}`;
      }
    };
    const squawkFor = () => String(Math.floor(rnd() * 8)) + String(Math.floor(rnd() * 8)) + String(Math.floor(rnd() * 8)) + String(Math.floor(rnd() * 8));
    const sourceFor = (): PositionSource => { const r = rnd(); return r < 0.82 ? 'adsb' : r < 0.94 ? 'mlat' : 'tisb'; };

    for (let i = 0; i < this.count; i++) {
      const r = rnd();
      const kind: Kind = r < 0.62 ? 'airline' : r < 0.70 ? 'cargo' : r < 0.73 ? 'military' : r < 0.83 ? 'ga' : r < 0.88 ? 'bizjet' : r < 0.93 ? 'heli' : r < 0.95 ? 'glider' : 'ground';
      const sim: Partial<Sim> = { hex: hexFor(), kind, squawk: squawkFor(), source: sourceFor(), gapEvery: 0, gapFor: 0, hold: false };
      if (kind === 'airline' || kind === 'cargo' || kind === 'military' || kind === 'bizjet') {
        let origin: Airport, dest: Airport, d = 0;
        let tries = 0;
        do {
          origin = pick(kind === 'bizjet' ? (rnd() < 0.5 ? mediums : majors) : majors);
          dest = pick(kind === 'bizjet' ? (rnd() < 0.5 ? mediums : majors) : majors);
          d = haversineKm(origin.lat, origin.lon, dest.lat, dest.lon);
          tries++;
        } while ((d < 150 || d > (kind === 'bizjet' ? 4000 : 9500) || origin === dest) && tries < 50);
        const longHaul = d > 3500;
        if (kind === 'airline') {
          const al = pick(airlines);
          sim.callsign = `${al.icao}${Math.floor(1 + rnd() * 2999)}`;
          sim.type = pick(longHaul ? LONG : SHORT);
          sim.reg = regFor(al.country);
        } else if (kind === 'cargo') {
          const al = pick(cargo);
          sim.callsign = `${al.icao}${Math.floor(1 + rnd() * 999)}`;
          sim.type = pick(CARGO);
          sim.reg = regFor(al.country);
        } else if (kind === 'military') {
          sim.callsign = `${pick(['RCH', 'RRR', 'GAF', 'CFC', 'NATO', 'DUKE', 'JAKE'])}${Math.floor(1 + rnd() * 999)}`;
          sim.type = pick(MIL);
          sim.reg = `${Math.floor(10 + rnd() * 89)}-${Math.floor(1000 + rnd() * 8999)}`;
        } else {
          sim.callsign = rnd() < 0.5 ? `${pick(['NJE', 'VJT', 'LXJ', 'EJA'])}${Math.floor(1 + rnd() * 999)}` : regFor(origin.country).replace('-', '');
          sim.type = pick(BIZ);
          sim.reg = regFor(origin.country);
        }
        sim.origin = origin; sim.dest = dest; sim.distKm = d;
        const heavy = LONG.includes(sim.type!) || CARGO.includes(sim.type!);
        sim.emitter = heavy ? 'A5' : sim.type === 'A388' ? 'A5' : SHORT.includes(sim.type!) ? 'A3' : 'A2';
        sim.cruiseFt = d < 500 ? 25000 + Math.round(rnd() * 6) * 1000 : d < 1500 ? 33000 + Math.round(rnd() * 5) * 1000 : 35000 + Math.round(rnd() * 6) * 1000;
        if (kind === 'military') sim.cruiseFt = 24000 + Math.round(rnd() * 10) * 1000;
        sim.cruiseKt = kind === 'military' ? 300 + rnd() * 150 : 430 + rnd() * 60;
        const flightSec = (d / (sim.cruiseKt * 1.852)) * 3600 + 900;
        sim.cycle = flightSec + 1800 + rnd() * 1800;
        sim.phase = rnd() * sim.cycle;
        sim.baseLat = origin.lat; sim.baseLon = origin.lon;
        if (rnd() < 0.08) { sim.gapEvery = 120 + rnd() * 300; sim.gapFor = 20 + rnd() * 40; }
        if (rnd() < 0.03) sim.hold = true;
      } else {
        const base = pick(kind === 'ground' ? majors : rnd() < 0.5 ? majors : mediums);
        sim.baseLat = base.lat; sim.baseLon = base.lon;
        sim.origin = undefined; sim.dest = undefined; sim.distKm = 0;
        sim.reg = regFor(base.country);
        sim.callsign = kind === 'ground' ? '' : rnd() < 0.3 ? '' : sim.reg.replace('-', '');
        sim.type = kind === 'heli' ? pick(HELI) : kind === 'glider' ? pick(GLIDERS) : kind === 'ground' ? '' : pick(GA);
        sim.emitter = kind === 'heli' ? 'A7' : kind === 'glider' ? 'B1' : kind === 'ground' ? (rnd() < 0.3 ? 'C1' : 'C2') : 'A1';
        sim.cruiseFt = kind === 'heli' ? 800 + Math.round(rnd() * 20) * 100 : kind === 'glider' ? 3000 + Math.round(rnd() * 40) * 100 : kind === 'ground' ? 0 : 2500 + Math.round(rnd() * 60) * 100;
        sim.cruiseKt = kind === 'heli' ? 60 + rnd() * 60 : kind === 'glider' ? 45 + rnd() * 30 : kind === 'ground' ? 5 + rnd() * 20 : 90 + rnd() * 60;
        sim.cycle = 1800 + rnd() * 3600;
        sim.phase = rnd() * sim.cycle;
        if (kind !== 'ground' && rnd() < 0.3) sim.source = 'mlat';
      }
      this.sims.push(sim as Sim);
    }
    this.st.aircraft = this.sims.length;
  }

  status(): FeedStatus { return { ...this.st }; }

  private pointToPoint(s: Sim, tSec: number, now: number): FeedAircraft | null {
    const origin = s.origin!, dest = s.dest!;
    const t = (tSec + s.phase) % s.cycle;
    const flightKm = s.distKm;
    const climbSec = (s.cruiseFt / 2200) * 60;
    const descentSec = (s.cruiseFt / 1800) * 60;
    const cruiseKmh = s.cruiseKt * 1.852;
    const climbKm = (cruiseKmh * 0.75 * climbSec) / 3600;
    const descKm = (cruiseKmh * 0.8 * descentSec) / 3600;
    const cruiseKm = Math.max(0, flightKm - climbKm - descKm);
    const cruiseSec = (cruiseKm / cruiseKmh) * 3600;
    const taxiOut = 300, taxiIn = 300;
    const flightSec = climbSec + cruiseSec + descentSec;
    const total = taxiOut + flightSec + taxiIn;
    const holdSec = s.hold ? 480 : 0;

    let alt = 0, gs = 0, vr = 0, onGround = false, fraction = 0, heading: number | undefined;
    let lat: number, lon: number;
    if (t < taxiOut) {
      onGround = true; gs = t < 60 ? 0 : 15; fraction = 0;
      [lat, lon] = destinationPoint(origin.lat, origin.lon, (s.phase * 37) % 360, 0.3 + (t / taxiOut) * 1.2);
      heading = bearingDeg(origin.lat, origin.lon, dest.lat, dest.lon);
    } else if (t < taxiOut + flightSec + holdSec) {
      const ft = t - taxiOut;
      let kmFlown: number;
      if (ft < climbSec) {
        const p = ft / climbSec;
        alt = s.cruiseFt * p; vr = 2200 * (1 - p * 0.3); gs = 160 + (s.cruiseKt - 160) * p;
        kmFlown = climbKm * p * p * (3 - 2 * p) ;
      } else if (ft < climbSec + cruiseSec) {
        const p = (ft - climbSec) / Math.max(1, cruiseSec);
        alt = s.cruiseFt + Math.sin(p * 20) * 40; vr = 0; gs = s.cruiseKt + Math.sin(p * 9) * 8;
        kmFlown = climbKm + cruiseKm * p;
      } else if (s.hold && ft < climbSec + cruiseSec + holdSec) {
        // racetrack hold before descent
        const hp = (ft - climbSec - cruiseSec) / holdSec;
        alt = s.cruiseFt - 8000 * hp; vr = -1000; gs = 250;
        const [hlat, hlon] = intermediatePoint(origin.lat, origin.lon, dest.lat, dest.lon, (climbKm + cruiseKm) / flightKm);
        const ang = hp * 2 * Math.PI * 3;
        const [plat, plon] = destinationPoint(hlat, hlon, (ang * 180) / Math.PI, 6);
        const trk = normalizeHeading((ang * 180) / Math.PI + 90);
        return this.emit(s, now, plat, plon, alt, gs, trk, vr, false, trk);
      } else {
        const p = (ft - climbSec - cruiseSec - holdSec) / descentSec;
        alt = s.cruiseFt * (1 - p); vr = -1800 * (0.6 + 0.4 * (1 - p)); gs = s.cruiseKt - (s.cruiseKt - 140) * p;
        kmFlown = climbKm + cruiseKm + descKm * p;
      }
      fraction = Math.min(1, kmFlown / flightKm);
      [lat, lon] = intermediatePoint(origin.lat, origin.lon, dest.lat, dest.lon, fraction);
      const [nlat, nlon] = intermediatePoint(origin.lat, origin.lon, dest.lat, dest.lon, Math.min(1, fraction + 0.001));
      heading = bearingDeg(lat, lon, nlat, nlon);
    } else if (t < total + holdSec) {
      onGround = true; gs = t > total + holdSec - 60 ? 0 : 12;
      [lat, lon] = destinationPoint(dest.lat, dest.lon, (s.phase * 53) % 360, 0.2 + ((t - taxiOut - flightSec - holdSec) / taxiIn) * 1.0);
      heading = (s.phase * 53) % 360;
    } else {
      // parked at the gate — stay visible on the ground for a while, then disappear until next cycle
      if (t > total + holdSec + 600) return null;
      onGround = true; gs = 0;
      [lat, lon] = destinationPoint(dest.lat, dest.lon, (s.phase * 53) % 360, 1.2);
      heading = (s.phase * 53) % 360;
    }
    return this.emit(s, now, lat, lon, alt, gs, heading ?? 0, vr, onGround, heading);
  }

  private local(s: Sim, tSec: number, now: number): FeedAircraft | null {
    const t = (tSec + s.phase) % s.cycle;
    if (s.kind === 'ground') {
      // slow loop around the apron
      const ang = (t / 600) * 2 * Math.PI;
      const [lat, lon] = destinationPoint(s.baseLat, s.baseLon, (ang * 180) / Math.PI, 0.6 + 0.3 * Math.sin(ang * 3));
      return this.emit(s, now, lat, lon, 0, s.cruiseKt, normalizeHeading((ang * 180) / Math.PI + 90), 0, true, undefined);
    }
    const radiusKm = s.kind === 'heli' ? 6 : s.kind === 'glider' ? 4 : 15;
    const periods = s.kind === 'glider' ? 12 : 3;
    const ang = (t / s.cycle) * 2 * Math.PI * periods;
    const wobble = Math.sin(t / 37) * 2;
    const [lat, lon] = destinationPoint(s.baseLat, s.baseLon, (ang * 180) / Math.PI + 40, radiusKm + wobble);
    const alt = s.cruiseFt + Math.sin(t / 90) * (s.kind === 'glider' ? 1200 : 300);
    const vr = Math.cos(t / 90) * (s.kind === 'glider' ? 400 : 150);
    const trk = normalizeHeading((ang * 180) / Math.PI + 130);
    return this.emit(s, now, lat, lon, alt, s.cruiseKt, trk, vr, false, undefined);
  }

  private emit(s: Sim, now: number, lat: number, lon: number, alt: number, gs: number, track: number, vr: number, onGround: boolean, heading?: number): FeedAircraft {
    const minute = Math.floor(now / 60000);
    // Every 10 minutes, one of the first 200 point-to-point aircraft squawks 7700 for 3 minutes; 7600 on a different cadence.
    let squawk = s.squawk;
    const idx = parseInt(s.hex, 16) % 200;
    if (s.kind === 'airline' && !onGround) {
      if (idx === Math.floor(minute / 10) % 200 && minute % 10 < 3) squawk = '7700';
      else if (idx === (Math.floor(minute / 17) * 7) % 200 && minute % 17 < 2) squawk = '7600';
    }
    return {
      hex: s.hex, lat, lon, ts: now, seenPos: 0, seen: 0, source: s.source, onGround,
      callsign: s.callsign || undefined, reg: s.reg, type: s.type || undefined,
      altBaro: onGround ? 0 : Math.round(alt), altGeom: onGround ? undefined : Math.round(alt + 150),
      gs: Math.round(gs), track: Math.round(track * 10) / 10, heading: heading !== undefined ? Math.round(heading * 10) / 10 : undefined,
      vr: Math.round(vr / 64) * 64, squawk, emitter: s.emitter, emergency: squawk === '7700' ? 'general' : squawk === '7600' ? 'nordo' : 'none',
      military: s.kind === 'military', rssi: -20 + ((parseInt(s.hex, 16) % 100) / 100) * -15,
      origin: s.origin?.icao ?? s.origin?.ident, dest: s.dest?.icao ?? s.dest?.ident,
    };
  }

  async poll(_interest: InterestArea[]): Promise<FeedPollResult> {
    const now = Date.now();
    const tSec = now / 1000;
    const aircraft: FeedAircraft[] = [];
    for (const s of this.sims) {
      if (s.gapEvery > 0 && (tSec + s.phase) % s.gapEvery < s.gapFor) continue;
      const a = s.origin ? this.pointToPoint(s, tSec, now) : this.local(s, tSec, now);
      if (a) aircraft.push(a);
    }
    this.st = { ...this.st, requests: this.st.requests + 1, lastSuccess: now, aircraft: aircraft.length, healthy: true };
    return { ts: now, aircraft, coverage: 'global' };
  }
}
