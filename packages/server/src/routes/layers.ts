import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { parseBBox, terminatorPolygon } from '@contrail/shared';
import { config } from '../config.js';
import { reference } from '../data/reference.js';
import { getRadarFrames } from '../services/weather.js';
import { cached } from '../services/cache.js';
import { fetchText } from '../services/http.js';
import { log } from '../log.js';

async function loadGeoJson(urlOrFile: string | undefined, bundled: string, key: string): Promise<unknown> {
  return cached(`layer:${key}`, 6 * 3600, async () => {
    if (urlOrFile) {
      try {
        if (/^https?:/.test(urlOrFile)) return JSON.parse(await fetchText(urlOrFile, { timeoutMs: 60000 }));
        return JSON.parse(fs.readFileSync(urlOrFile, 'utf8'));
      } catch (err) {
        log.warn({ err: (err as Error).message, key }, 'layer source failed, using bundled data');
      }
    }
    const file = path.join(config.DATA_DIR, bundled);
    if (!fs.existsSync(file)) return { type: 'FeatureCollection', features: [] };
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  });
}

export async function layerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/layers/fir', async (_req, reply) => {
    reply.header('cache-control', 'public, max-age=86400');
    return loadGeoJson(config.FIR_GEOJSON_URL, 'fir-boundaries.geojson', 'fir');
  });

  app.get('/api/layers/airways', async (_req, reply) => {
    reply.header('cache-control', 'public, max-age=86400');
    return loadGeoJson(config.AIRWAYS_GEOJSON_URL, 'airways.geojson', 'airways');
  });

  app.get<{ Querystring: { bbox?: string } }>('/api/layers/navaids', async (req, reply) => {
    const bbox = parseBBox(req.query.bbox);
    if (!bbox) return reply.code(400).send({ error: 'bbox required' });
    reply.header('cache-control', 'public, max-age=3600');
    const list = reference.navaidsInBBox(bbox).slice(0, 3000);
    return {
      type: 'FeatureCollection',
      features: list.map((n) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [n.lon, n.lat] }, properties: { ident: n.ident, name: n.name, type: n.type, freq: n.frequencyKhz ? (n.type === 'NDB' ? `${n.frequencyKhz} kHz` : `${(n.frequencyKhz / 1000).toFixed(2)} MHz`) : undefined } })),
    };
  });

  app.get('/api/layers/terminator', async (_req, reply) => {
    reply.header('cache-control', 'no-store');
    return { type: 'Feature', properties: { ts: Date.now() }, geometry: { type: 'Polygon', coordinates: [terminatorPolygon(new Date())] } };
  });

  app.get('/api/layers/radar', async (_req, reply) => {
    reply.header('cache-control', 'public, max-age=60');
    const frames = await getRadarFrames();
    if (!frames) return reply.code(503).send({ error: 'radar frames unavailable' });
    return { ...frames, attribution: 'Weather radar & satellite © RainViewer' };
  });
}
