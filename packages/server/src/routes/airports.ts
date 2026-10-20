import type { FastifyInstance } from 'fastify';
import { parseBBox, type AirportType } from '@contrail/shared';
import { reference } from '../data/reference.js';
import { getAirportBoard, getDisruptionMap } from '../services/airports.js';
import { getAirportWeather } from '../services/weather.js';
import { store } from '../store/aircraftStore.js';
import { dbAvailable, query } from '../db/pool.js';

export async function airportRoutes(app: FastifyInstance): Promise<void> {
  /** Airports as GeoJSON for the map layer. Zoom decides which types are included. */
  app.get<{ Querystring: { bbox?: string; zoom?: string } }>('/api/airports', async (req, reply) => {
    const bbox = parseBBox(req.query.bbox) ?? { west: -180, south: -90, east: 180, north: 90 };
    const zoom = Number(req.query.zoom) || 3;
    const types: AirportType[] = zoom < 4 ? ['large_airport'] : zoom < 7 ? ['large_airport', 'medium_airport'] : ['large_airport', 'medium_airport', 'small_airport', 'heliport', 'seaplane_base'];
    const list = reference.inBBox(bbox, types).slice(0, 4000);
    reply.header('cache-control', 'public, max-age=300');
    return {
      type: 'FeatureCollection',
      features: list.map((a) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [a.lon, a.lat] }, properties: { ident: a.ident, icao: a.icao, iata: a.iata, name: a.name, type: a.type, label: a.iata ?? a.icao ?? a.ident } })),
    };
  });

  app.get<{ Querystring: { q?: string; limit?: string } }>('/api/airports/search', async (req) => ({ results: reference.search(req.query.q ?? '', Math.min(50, Number(req.query.limit) || 10)) }));

  app.get<{ Querystring: { limit?: string } }>('/api/airports/disruptions', async (req, reply) => {
    reply.header('cache-control', 'public, max-age=120');
    return { generatedAt: new Date().toISOString(), airports: await getDisruptionMap(Math.min(150, Number(req.query.limit) || 60)) };
  });

  app.get<{ Params: { code: string } }>('/api/airports/:code', async (req, reply) => {
    const ap = reference.airport(req.params.code);
    if (!ap) return reply.code(404).send({ error: 'unknown airport' });
    return { airport: ap, runways: reference.runwaysFor(ap.ident) };
  });

  app.get<{ Params: { code: string } }>('/api/airports/:code/board', async (req, reply) => {
    const board = await getAirportBoard(req.params.code);
    if (!board) return reply.code(404).send({ error: 'unknown airport' });
    reply.header('cache-control', 'public, max-age=60');
    return board;
  });

  app.get<{ Params: { code: string } }>('/api/airports/:code/weather', async (req, reply) => {
    const ap = reference.airport(req.params.code);
    if (!ap?.icao) return reply.code(404).send({ error: 'unknown airport or no ICAO code' });
    reply.header('cache-control', 'public, max-age=300');
    return getAirportWeather(ap.icao);
  });

  /** Aircraft near an airport (ground + approaching), live. */
  app.get<{ Params: { code: string }; Querystring: { radiusKm?: string } }>('/api/airports/:code/traffic', async (req, reply) => {
    const ap = reference.airport(req.params.code);
    if (!ap) return reply.code(404).send({ error: 'unknown airport' });
    const r = Math.min(200, Number(req.query.radiusKm) || 40);
    const dLat = r / 111, dLon = dLat / Math.max(0.2, Math.cos((ap.lat * Math.PI) / 180));
    return { aircraft: store.inBBox({ west: ap.lon - dLon, east: ap.lon + dLon, south: ap.lat - dLat, north: ap.lat + dLat }) };
  });

  app.get<{ Params: { code: string } }>('/api/airports/:code/delay-history', async (req, reply) => {
    const ap = reference.airport(req.params.code);
    if (!ap) return reply.code(404).send({ error: 'unknown airport' });
    if (!dbAvailable()) return { samples: [] };
    const r = await query<{ ts: Date; delay_index: number; avg_delay: number; cancelled: number }>('SELECT ts, delay_index, avg_delay, cancelled FROM airport_delay_samples WHERE icao = $1 AND ts > now() - interval \'48 hours\' ORDER BY ts', [ap.icao ?? ap.ident]);
    return { samples: r.rows };
  });
}
