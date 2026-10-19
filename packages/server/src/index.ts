import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import websocket from '@fastify/websocket';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { log } from './log.js';
import { connectDb, closeDb } from './db/pool.js';
import { runMigrations } from './db/migrate.js';
import { reference } from './data/reference.js';
import { FeedManager } from './feeds/index.js';
import { store } from './store/aircraftStore.js';
import { recorder } from './store/recorder.js';
import { hub } from './ws/hub.js';
import { startRouteLookup, stopRouteLookup } from './services/routes.js';
import { initNotifications } from './services/notify.js';
import { startAlerts, stopAlerts } from './services/alerts.js';
import { startStats, stopStats } from './services/stats.js';
import { cacheSweep } from './services/cache.js';
import { aircraftRoutes } from './routes/aircraft.js';
import { airportRoutes } from './routes/airports.js';
import { layerRoutes } from './routes/layers.js';
import { searchRoutes } from './routes/search.js';
import { historyRoutes } from './routes/history.js';
import { accountRoutes } from './routes/account.js';
import { statsRoutes } from './routes/stats.js';

async function main(): Promise<void> {
  log.info({ feeds: config.feeds, env: config.NODE_ENV }, 'Contrail server starting');
  await connectDb();
  await runMigrations();
  await reference.load();
  initNotifications();

  const feeds = new FeedManager();
  feeds.onResult((name, result) => store.ingest(name, result));
  feeds.setInterestProvider(() => hub.interestAreas());

  const app = Fastify({ logger: false, trustProxy: true, bodyLimit: 1024 * 1024 });
  await app.register(cors, { origin: config.CORS_ORIGINS.length ? config.CORS_ORIGINS : true, credentials: true });
  await app.register(cookie);
  await app.register(rateLimit, { max: 600, timeWindow: '1 minute', allowList: (req) => req.url.startsWith('/ws') });
  await app.register(websocket, { options: { maxPayload: 64 * 1024, perMessageDeflate: true } });

  app.setErrorHandler((err, req, reply) => {
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) log.error({ err, url: req.url }, 'request failed');
    reply.code(status).send({ error: status >= 500 ? 'internal error' : (err as Error).message });
  });

  app.get('/ws', { websocket: true }, (socket) => hub.add(socket, feeds.names));
  await app.register(aircraftRoutes);
  await app.register(airportRoutes);
  await app.register(layerRoutes);
  await app.register(searchRoutes);
  await app.register(historyRoutes);
  await app.register(accountRoutes);
  await app.register(statsRoutes, { feeds });

  // Serve the built web app in production when SERVE_WEB_DIR points at packages/web/dist.
  const webDir = config.SERVE_WEB_DIR ?? path.resolve(process.cwd(), '..', 'web', 'dist');
  if (fs.existsSync(path.join(webDir, 'index.html'))) {
    await app.register(fastifyStatic, { root: webDir, prefix: '/', wildcard: false, maxAge: '1h' });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/') || req.url.startsWith('/ws')) return reply.code(404).send({ error: 'not found' });
      return reply.sendFile('index.html');
    });
    log.info({ webDir }, 'serving web app');
  }

  await feeds.start();
  recorder.start();
  startRouteLookup();
  startAlerts();
  startStats();
  hub.start();

  const tick = setInterval(() => {
    store.tick();
    recorder.collect(store.all());
  }, 1000);
  const sweep = setInterval(() => void cacheSweep(), 10 * 60_000);

  await app.listen({ port: config.PORT, host: config.HOST });
  log.info({ port: config.PORT }, 'Contrail API listening');

  const shutdown = async (signal: string) => {
    log.info({ signal }, 'shutting down');
    clearInterval(tick); clearInterval(sweep);
    feeds.stop(); hub.stop(); recorder.stop(); stopRouteLookup(); stopAlerts(); stopStats();
    await app.close();
    await closeDb();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  log.fatal({ err }, 'fatal');
  process.exit(1);
});
