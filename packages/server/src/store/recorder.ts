import type { AircraftState } from '@contrail/shared';
import { POSITION_SOURCES } from '@contrail/shared';
import { dbAvailable, query } from '../db/pool.js';
import { config } from '../config.js';
import { log } from '../log.js';
import { store, type StoreEvent } from './aircraftStore.js';

/**
 * Persists positions into the `positions` hypertable (batched) and maintains one row per
 * flight (contiguous tracking of a hex+callsign) in `flights` for history lookups.
 */
interface OpenFlight { id: number; callsign?: string; lastUpdate: number; maxAlt: number; positions: number }

class Recorder {
  private lastRecorded = new Map<string, number>();
  private openFlights = new Map<string, OpenFlight>();
  private pending: AircraftState[] = [];
  private timer?: NodeJS.Timeout;
  private flightTimer?: NodeJS.Timeout;

  start(): void {
    if (!dbAvailable() || !config.RECORD_POSITIONS) {
      log.info('position recording disabled');
      return;
    }
    // Flights left open by a previous process are closed here; `openFlight` resumes any that
    // were seen in the last 20 minutes with the same callsign, so a restart does not split flights.
    query('UPDATE flights SET closed = true WHERE NOT closed').catch((err) => log.warn({ err: (err as Error).message }, 'could not reconcile open flights'));
    store.on((e) => this.onEvent(e));
    this.timer = setInterval(() => this.flush().catch((err) => log.error({ err }, 'position flush failed')), 5000);
    this.flightTimer = setInterval(() => this.updateFlights().catch((err) => log.error({ err }, 'flight update failed')), 30000);
    log.info('position recorder started');
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.flightTimer) clearInterval(this.flightTimer);
  }

  /** Called every tick with the current states; selects which to persist. */
  collect(states: Iterable<AircraftState>): void {
    if (!this.timer) return;
    const now = Date.now();
    const minInterval = config.RECORD_MIN_INTERVAL_S * 1000;
    for (const s of states) {
      if (s.source === 'estimated') continue;
      const last = this.lastRecorded.get(s.hex) ?? 0;
      if (s.ts <= last) continue;
      if (now - last < minInterval) continue;
      if (s.onGround && now - last < minInterval * 6 && (s.gs ?? 0) < 2) continue;
      this.lastRecorded.set(s.hex, s.ts);
      this.pending.push({ ...s });
    }
  }

  private async flush(): Promise<void> {
    if (!this.pending.length) return;
    const batch = this.pending.splice(0, 20000);
    const cols = { ts: [] as Date[], hex: [] as string[], callsign: [] as (string | null)[], lat: [] as number[], lon: [] as number[], alt_baro: [] as (number | null)[], alt_geom: [] as (number | null)[], gs: [] as (number | null)[], track: [] as (number | null)[], vr: [] as (number | null)[], squawk: [] as (string | null)[], on_ground: [] as boolean[], source: [] as number[], feed: [] as string[] };
    const clamp = (v: number | undefined, lo: number, hi: number) => (v === undefined || !Number.isFinite(v) ? null : Math.max(lo, Math.min(hi, Math.round(v))));
    for (const s of batch) {
      cols.ts.push(new Date(s.ts)); cols.hex.push(s.hex.slice(0, 6)); cols.callsign.push(s.callsign?.slice(0, 10) ?? null);
      cols.lat.push(s.lat); cols.lon.push(s.lon); cols.alt_baro.push(clamp(s.altBaro, -2000, 200000)); cols.alt_geom.push(clamp(s.altGeom, -2000, 200000));
      cols.gs.push(clamp(s.gs, 0, 32000)); cols.track.push(clamp(s.track, 0, 360)); cols.vr.push(clamp(s.vr, -32000, 32000));
      cols.squawk.push(s.squawk?.slice(0, 4) ?? null); cols.on_ground.push(s.onGround); cols.source.push(POSITION_SOURCES.indexOf(s.source)); cols.feed.push(s.feed.slice(0, 16));
    }
    await query(
      `INSERT INTO positions (ts, hex, callsign, lat, lon, alt_baro, alt_geom, gs, track, vr, squawk, on_ground, source, feed)
       SELECT * FROM unnest($1::timestamptz[], $2::char(6)[], $3::varchar[], $4::real[], $5::real[], $6::int[], $7::int[], $8::smallint[], $9::smallint[], $10::smallint[], $11::char(4)[], $12::boolean[], $13::smallint[], $14::varchar[])`,
      [cols.ts, cols.hex, cols.callsign, cols.lat, cols.lon, cols.alt_baro, cols.alt_geom, cols.gs, cols.track, cols.vr, cols.squawk, cols.on_ground, cols.source, cols.feed],
    );
    for (const s of batch) {
      const f = this.openFlights.get(s.hex);
      if (f) { f.positions++; f.maxAlt = Math.max(f.maxAlt, s.altBaro ?? 0); }
    }
  }

  private onEvent(e: StoreEvent): void {
    if (e.type === 'appear') void this.openFlight(e.a);
    else if (e.type === 'expire') void this.closeFlight(e.a);
    else if (e.type === 'callsign' && e.previous && e.previous !== e.a.callsign) {
      void this.closeFlight(e.a).then(() => this.openFlight(e.a));
    }
  }

  private async openFlight(a: AircraftState): Promise<void> {
    try {
      // Resume a flight closed less than 20 minutes ago with the same callsign (feed gap), else insert.
      const resume = await query<{ id: number; max_alt: number; position_count: number }>(
        `UPDATE flights SET closed = false, last_seen = $2 WHERE id = (
           SELECT id FROM flights WHERE hex = $1 AND closed AND last_seen > now() - interval '20 minutes' AND callsign IS NOT DISTINCT FROM $3 ORDER BY last_seen DESC LIMIT 1
         ) RETURNING id, max_alt, position_count`,
        [a.hex, new Date(a.ts), a.callsign ?? null],
      );
      if (resume.rows[0]) {
        this.openFlights.set(a.hex, { id: resume.rows[0].id, callsign: a.callsign, lastUpdate: Date.now(), maxAlt: resume.rows[0].max_alt ?? 0, positions: resume.rows[0].position_count });
        return;
      }
      const r = await query<{ id: number }>(
        `INSERT INTO flights (hex, callsign, flight_no, reg, type, operator, category, first_seen, last_seen, origin, dest, first_lat, first_lon, last_lat, last_lon, max_alt, ground_start)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8,$9,$10,$11,$12,$11,$12,$13,$14) RETURNING id`,
        [a.hex, a.callsign ?? null, a.flightNo ?? null, a.reg ?? null, a.type ?? null, a.operator ?? null, a.category, new Date(a.ts), a.origin ?? null, a.dest ?? null, a.lat, a.lon, a.altBaro ?? 0, a.onGround],
      );
      this.openFlights.set(a.hex, { id: r.rows[0].id, callsign: a.callsign, lastUpdate: Date.now(), maxAlt: a.altBaro ?? 0, positions: 0 });
    } catch (err) {
      log.debug({ err: (err as Error).message }, 'openFlight failed');
    }
  }

  private async closeFlight(a: AircraftState): Promise<void> {
    const f = this.openFlights.get(a.hex);
    if (!f) return;
    this.openFlights.delete(a.hex);
    this.lastRecorded.delete(a.hex);
    try {
      await query(
        `UPDATE flights SET closed = true, last_seen = $2, last_lat = $3, last_lon = $4, max_alt = GREATEST(max_alt, $5), ground_end = $6, position_count = $7,
         reg = COALESCE($8, reg), type = COALESCE($9, type), origin = COALESCE($10, origin), dest = COALESCE($11, dest), flight_no = COALESCE($12, flight_no), category = $13 WHERE id = $1`,
        [f.id, new Date(a.ts), a.lat, a.lon, f.maxAlt, a.onGround, f.positions, a.reg ?? null, a.type ?? null, a.origin ?? null, a.dest ?? null, a.flightNo ?? null, a.category],
      );
    } catch (err) {
      log.debug({ err: (err as Error).message }, 'closeFlight failed');
    }
  }

  private async updateFlights(): Promise<void> {
    const ids: number[] = [], ts: Date[] = [], lat: number[] = [], lon: number[] = [], maxAlt: number[] = [], count: number[] = [], reg: (string | null)[] = [], type: (string | null)[] = [], origin: (string | null)[] = [], dest: (string | null)[] = [], flightNo: (string | null)[] = [], category: string[] = [];
    for (const [hex, f] of this.openFlights) {
      const a = store.get(hex);
      if (!a) continue;
      ids.push(f.id); ts.push(new Date(a.ts)); lat.push(a.lat); lon.push(a.lon); maxAlt.push(f.maxAlt); count.push(f.positions);
      reg.push(a.reg ?? null); type.push(a.type ?? null); origin.push(a.origin ?? null); dest.push(a.dest ?? null); flightNo.push(a.flightNo ?? null); category.push(a.category);
    }
    if (!ids.length) return;
    await query(
      `UPDATE flights f SET last_seen = u.ts, last_lat = u.lat, last_lon = u.lon, max_alt = GREATEST(f.max_alt, u.max_alt), position_count = u.cnt,
         reg = COALESCE(u.reg, f.reg), type = COALESCE(u.type, f.type), origin = COALESCE(u.origin, f.origin), dest = COALESCE(u.dest, f.dest), flight_no = COALESCE(u.flight_no, f.flight_no), category = u.category
       FROM unnest($1::bigint[], $2::timestamptz[], $3::real[], $4::real[], $5::int[], $6::int[], $7::varchar[], $8::varchar[], $9::char(4)[], $10::char(4)[], $11::varchar[], $12::varchar[])
         AS u(id, ts, lat, lon, max_alt, cnt, reg, type, origin, dest, flight_no, category)
       WHERE f.id = u.id`,
      [ids, ts, lat, lon, maxAlt, count, reg, type, origin, dest, flightNo, category],
    );
  }
}

export const recorder = new Recorder();
