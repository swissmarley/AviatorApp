import type { FastifyInstance } from 'fastify';
import { AIRLINES, AIRCRAFT_TYPES, airlineByIcao } from '@contrail/shared';
import { store } from '../store/aircraftStore.js';
import { reference } from '../data/reference.js';
import { dbAvailable, query } from '../db/pool.js';

export async function searchRoutes(app: FastifyInstance): Promise<void> {
  /** Unified search across live aircraft, airports, airlines and aircraft types. */
  app.get<{ Querystring: { q?: string } }>('/api/search', async (req) => {
    const q = (req.query.q ?? '').trim();
    if (q.length < 2) return { aircraft: [], airports: [], airlines: [], types: [], history: [] };
    const up = q.toUpperCase(), low = q.toLowerCase();
    const aircraft = store.search(q, 15).map((a) => ({ hex: a.hex, callsign: a.callsign, flightNo: a.flightNo, reg: a.reg, type: a.type, operator: a.operator, airline: airlineByIcao(a.operator)?.name, origin: a.origin, dest: a.dest, onGround: a.onGround, lat: a.lat, lon: a.lon }));
    const airports = reference.search(q, 8).map((a) => ({ icao: a.icao, iata: a.iata, ident: a.ident, name: a.name, municipality: a.municipality, country: a.country, type: a.type, lat: a.lat, lon: a.lon }));
    const airlines = AIRLINES.filter((a) => a.icao === up || a.iata === up || a.name.toLowerCase().includes(low)).slice(0, 6).map((a) => ({ icao: a.icao, iata: a.iata, name: a.name, live: store.summary().byOperator.get(a.icao) ?? 0 }));
    const types = AIRCRAFT_TYPES.filter((t) => t.icao.startsWith(up) || t.name.toLowerCase().includes(low)).slice(0, 6).map((t) => ({ icao: t.icao, name: t.name }));
    let history: { hex: string; callsign?: string; reg?: string; type?: string; lastSeen: string; origin?: string; dest?: string }[] = [];
    if (dbAvailable() && aircraft.length < 5) {
      const r = await query<{ hex: string; callsign: string | null; reg: string | null; type: string | null; last_seen: Date; origin: string | null; dest: string | null }>(
        `SELECT DISTINCT ON (hex) hex, callsign, reg, type, last_seen, origin, dest FROM flights WHERE upper(callsign) = $1 OR upper(reg) = $1 OR upper(flight_no) = $1 OR hex = lower($1) ORDER BY hex, last_seen DESC LIMIT 10`, [up]);
      history = r.rows.filter((x) => !aircraft.some((a) => a.hex === x.hex)).map((x) => ({ hex: x.hex, callsign: x.callsign ?? undefined, reg: x.reg ?? undefined, type: x.type ?? undefined, lastSeen: new Date(x.last_seen).toISOString(), origin: x.origin?.trim() ?? undefined, dest: x.dest?.trim() ?? undefined }));
    }
    return { aircraft, airports, airlines, types, history };
  });

  app.get('/api/meta/airlines', async (_req, reply) => { reply.header('cache-control', 'public, max-age=86400'); return AIRLINES; });
  app.get('/api/meta/types', async (_req, reply) => { reply.header('cache-control', 'public, max-age=86400'); return AIRCRAFT_TYPES; });

  /** Generated airline badge; redirects to a configured logo CDN when AIRLINE_LOGO_URL_TEMPLATE is set. */
  app.get<{ Params: { icao: string } }>('/api/airlines/:icao/logo.svg', async (req, reply) => {
    const al = airlineByIcao(req.params.icao);
    const tmpl = process.env.AIRLINE_LOGO_URL_TEMPLATE;
    if (tmpl && al?.iata) return reply.redirect(tmpl.replace('{iata}', al.iata).replace('{icao}', al.icao));
    const code = (al?.iata ?? req.params.icao.slice(0, 3)).toUpperCase();
    const color = al?.color ?? '#475569';
    const name = al?.name ?? req.params.icao.toUpperCase();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="48" viewBox="0 0 96 48" role="img" aria-label="${name.replace(/"/g, '')}"><rect width="96" height="48" rx="8" fill="${color}"/><text x="48" y="31" font-family="Inter, system-ui, sans-serif" font-size="${code.length > 2 ? 20 : 24}" font-weight="700" fill="#fff" text-anchor="middle">${code}</text></svg>`;
    reply.header('content-type', 'image/svg+xml').header('cache-control', 'public, max-age=86400');
    return svg;
  });
}
