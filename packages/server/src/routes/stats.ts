import type { FastifyInstance } from 'fastify';
import type { FeedManager } from '../feeds/index.js';
import { getStats } from '../services/stats.js';
import { store } from '../store/aircraftStore.js';
import { hub } from '../ws/hub.js';
import { dbAvailable, hasTimescale } from '../db/pool.js';
import { config } from '../config.js';

export async function statsRoutes(app: FastifyInstance, opts: { feeds: FeedManager }): Promise<void> {
  app.get<{ Querystring: { range?: '1h' | '24h' | '7d' } }>('/api/stats', async (req, reply) => {
    reply.header('cache-control', 'public, max-age=30');
    return getStats(opts.feeds, req.query.range ?? '24h');
  });

  app.get('/api/health', async () => ({
    ok: true,
    version: '0.1.0',
    uptimeS: Math.round(process.uptime()),
    aircraft: store.size,
    clients: hub.clientCount,
    db: dbAvailable(),
    timescale: hasTimescale(),
    feeds: opts.feeds.statuses(),
    providers: {
      schedules: config.AERODATABOX_API_KEY ? 'aerodatabox' : config.AVIATIONSTACK_API_KEY ? 'aviationstack' : config.feeds.includes('synthetic') ? 'synthetic' : 'none',
      photos: config.PLANESPOTTERS_ENABLED ? 'planespotters' : 'none',
      push: !!(config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY),
      email: !!config.SMTP_URL,
    },
  }));
}
