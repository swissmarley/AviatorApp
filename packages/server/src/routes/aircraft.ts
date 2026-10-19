import type { FastifyInstance } from 'fastify';
import { parseBBox, encodeFull, haversineKm, airlineByIcao, aircraftTypeName, type TrailPoint } from '@contrail/shared';
import { store } from '../store/aircraftStore.js';
import { getFlightInfo } from '../services/flightInfo.js';
import { getAircraftPhoto } from '../services/photos.js';
import { dbAvailable, query } from '../db/pool.js';
import { reference } from '../data/reference.js';

export async function aircraftRoutes(app: FastifyInstance): Promise<void> {
  /** Live aircraft in a bounding box (same compact rows as the WebSocket). */
  app.get<{ Querystring: { bbox?: string; limit?: string } }>('/api/aircraft', async (req, reply) => {
    const bbox = parseBBox(req.query.bbox);
    const list = bbox ? store.inBBox(bbox) : store.all();
    const limit = Math.min(50000, Number(req.query.limit) || 20000);
    reply.header('cache-control', 'no-store');
    return { ts: Date.now(), count: list.length, rows: list.slice(0, limit).map(encodeFull) };
  });

  app.get('/api/aircraft/emergencies', async () => ({ ts: Date.now(), list: store.emergencies() }));

  /** Full detail for one aircraft: live state, enrichment, route/schedule, photo. */
  app.get<{ Params: { hex: string } }>('/api/aircraft/:hex', async (req, reply) => {
    const hex = req.params.hex.toLowerCase();
    const a = store.get(hex);
    let last: { callsign?: string; reg?: string; type?: string; last_seen?: Date } | undefined;
    if (!a && dbAvailable()) {
      const r = await query<{ callsign: string; reg: string; type: string; last_seen: Date }>('SELECT callsign, reg, type, last_seen FROM flights WHERE hex = $1 ORDER BY last_seen DESC LIMIT 1', [hex]);
      last = r.rows[0];
      if (!last) return reply.code(404).send({ error: 'unknown aircraft' });
    }
    const callsign = a?.callsign ?? last?.callsign ?? undefined;
    const reg = a?.reg ?? last?.reg ?? undefined;
    const [info, photo] = await Promise.all([
      getFlightInfo(callsign, a?.flightNo, hex).catch(() => undefined),
      getAircraftPhoto({ reg, hex }).catch(() => undefined),
    ]);
    const airline = airlineByIcao(a?.operator ?? info?.airline?.icao);
    const origin = reference.airport(info?.departure?.airport ?? a?.origin);
    const dest = reference.airport(info?.arrival?.airport ?? a?.dest);
    let progress: { flownKm: number; remainingKm: number; totalKm: number; fraction: number } | undefined;
    if (a && origin && dest) {
      const total = haversineKm(origin.lat, origin.lon, dest.lat, dest.lon);
      const flown = Math.min(total, haversineKm(origin.lat, origin.lon, a.lat, a.lon));
      const remaining = Math.max(0, haversineKm(a.lat, a.lon, dest.lat, dest.lon));
      progress = { flownKm: flown, remainingKm: remaining, totalKm: total, fraction: total > 0 ? Math.min(1, flown / (flown + remaining)) : 0 };
    }
    return {
      live: a ?? null,
      lastSeen: last?.last_seen ?? null,
      airline: airline ? { icao: airline.icao, iata: airline.iata, name: airline.name, cargo: !!airline.cargo } : info?.airline ?? null,
      typeName: aircraftTypeName(a?.type ?? last?.type) ?? info?.aircraft?.model ?? a?.desc ?? null,
      flight: info ?? null,
      origin: origin ?? null,
      dest: dest ?? null,
      progress: progress ?? null,
      photo: photo ?? null,
    };
  });

  /** Track for the current flight: database history merged with the in-memory trail. */
  app.get<{ Params: { hex: string }; Querystring: { hours?: string } }>('/api/aircraft/:hex/track', async (req) => {
    const hex = req.params.hex.toLowerCase();
    const hours = Math.min(48, Number(req.query.hours) || 12);
    const mem = store.trail(hex);
    let points: TrailPoint[] = mem;
    if (dbAvailable()) {
      const e = store.entry(hex);
      // Limit to the current flight: positions since the last long gap.
      const r = await query<{ ts: Date; lat: number; lon: number; alt_baro: number | null; gs: number | null; track: number | null; vr: number | null; source: number }>(
        `SELECT ts, lat, lon, alt_baro, gs, track, vr, source FROM positions WHERE hex = $1 AND ts > now() - ($2 || ' hours')::interval ORDER BY ts`, [hex, hours]);
      const db: TrailPoint[] = [];
      let prev: Date | undefined;
      for (const row of r.rows) {
        if (prev && new Date(row.ts).getTime() - prev.getTime() > 20 * 60_000) db.length = 0; // new flight after a gap
        db.push({ ts: new Date(row.ts).getTime(), lat: row.lat, lon: row.lon, alt: row.alt_baro ?? undefined, gs: row.gs ?? undefined, track: row.track ?? undefined, vr: row.vr ?? undefined });
        prev = new Date(row.ts);
      }
      const lastDb = db[db.length - 1]?.ts ?? 0;
      points = db.concat(mem.filter((p) => p.ts > lastDb));
      if (e && db.length && e.firstSeen - lastDb > 20 * 60_000) points = mem;
    }
    return { hex, points };
  });
}
