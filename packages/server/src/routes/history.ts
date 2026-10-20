import type { FastifyInstance } from 'fastify';
import { parseBBox } from '@contrail/shared';
import { dbAvailable, query } from '../db/pool.js';

/**
 * Playback & history. All endpoints need the database.
 *  GET /api/history/positions?bbox&from&to&step   → frames of positions for replay
 *  GET /api/history/registration/:reg             → past flights of an airframe
 *  GET /api/history/flight/:flightNo              → route history of a flight number
 *  GET /api/history/flights/:id/track             → track of a stored flight
 */
export async function historyRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', async (req, reply) => {
    if (req.url.startsWith('/api/history') && !dbAvailable()) reply.code(503).send({ error: 'history requires a database (set DATABASE_URL)' });
  });

  app.get<{ Querystring: { bbox?: string; from?: string; to?: string; step?: string } }>('/api/history/positions', async (req, reply) => {
    const bbox = parseBBox(req.query.bbox);
    const from = new Date(req.query.from ?? ''), to = new Date(req.query.to ?? '');
    if (!bbox || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) return reply.code(400).send({ error: 'bbox, from and to are required' });
    const spanS = (to.getTime() - from.getTime()) / 1000;
    if (spanS > 24 * 3600) return reply.code(400).send({ error: 'time range must be 24 hours or less' });
    const step = Math.max(5, Math.min(600, Number(req.query.step) || Math.max(10, Math.round(spanS / 720))));
    const r = await query<{ bucket: Date; hex: string; callsign: string | null; lat: number; lon: number; alt_baro: number | null; gs: number | null; track: number | null; vr: number | null; on_ground: boolean; source: number; squawk: string | null }>(
      `SELECT DISTINCT ON (bucket, hex) to_timestamp(floor(extract(epoch FROM ts) / $1) * $1) AS bucket, hex, callsign, lat, lon, alt_baro, gs, track, vr, on_ground, source, squawk
         FROM positions
        WHERE ts >= $2 AND ts < $3 AND lat BETWEEN $4 AND $5 AND lon BETWEEN $6 AND $7
        ORDER BY bucket, hex, ts DESC
        LIMIT 400000`,
      [step, from, to, bbox.south, bbox.north, bbox.west, bbox.east]);
    const frames = new Map<number, unknown[]>();
    for (const row of r.rows) {
      const t = new Date(row.bucket).getTime();
      let f = frames.get(t);
      if (!f) { f = []; frames.set(t, f); }
      f.push([row.hex, row.callsign, row.lat, row.lon, row.alt_baro, row.gs, row.track, row.vr, row.on_ground ? 1 : 0, row.source, row.squawk]);
    }
    return { from: from.toISOString(), to: to.toISOString(), step, frames: [...frames.entries()].sort((a, b) => a[0] - b[0]).map(([ts, rows]) => ({ ts, rows })), truncated: r.rows.length >= 400000 };
  });

  app.get<{ Params: { reg: string }; Querystring: { limit?: string } }>('/api/history/registration/:reg', async (req) => {
    const r = await query('SELECT id, hex, callsign, flight_no, reg, type, operator, category, first_seen, last_seen, origin, dest, max_alt, position_count, ground_start, ground_end FROM flights WHERE upper(reg) = upper($1) OR hex = lower($1) ORDER BY first_seen DESC LIMIT $2', [req.params.reg, Math.min(200, Number(req.query.limit) || 50)]);
    return { flights: r.rows.map(trim) };
  });

  app.get<{ Params: { flightNo: string }; Querystring: { limit?: string } }>('/api/history/flight/:flightNo', async (req) => {
    const r = await query('SELECT id, hex, callsign, flight_no, reg, type, operator, category, first_seen, last_seen, origin, dest, max_alt, position_count, ground_start, ground_end FROM flights WHERE upper(flight_no) = upper($1) OR upper(callsign) = upper($1) ORDER BY first_seen DESC LIMIT $2', [req.params.flightNo, Math.min(200, Number(req.query.limit) || 50)]);
    return { flights: r.rows.map(trim) };
  });

  app.get<{ Params: { id: string } }>('/api/history/flights/:id/track', async (req, reply) => {
    const f = await query<{ hex: string; first_seen: Date; last_seen: Date }>('SELECT hex, first_seen, last_seen FROM flights WHERE id = $1', [Number(req.params.id)]);
    if (!f.rows[0]) return reply.code(404).send({ error: 'unknown flight' });
    const { hex, first_seen, last_seen } = f.rows[0];
    const r = await query<{ ts: Date; lat: number; lon: number; alt_baro: number | null; gs: number | null; track: number | null; vr: number | null }>('SELECT ts, lat, lon, alt_baro, gs, track, vr FROM positions WHERE hex = $1 AND ts BETWEEN $2 AND $3 ORDER BY ts', [hex, first_seen, new Date(new Date(last_seen).getTime() + 60000)]);
    return { hex, points: r.rows.map((p) => ({ ts: new Date(p.ts).getTime(), lat: p.lat, lon: p.lon, alt: p.alt_baro ?? undefined, gs: p.gs ?? undefined, track: p.track ?? undefined, vr: p.vr ?? undefined })) };
  });
}

function trim(row: Record<string, unknown>): Record<string, unknown> {
  return { ...row, hex: String(row.hex).trim(), origin: row.origin ? String(row.origin).trim() : null, dest: row.dest ? String(row.dest).trim() : null };
}
