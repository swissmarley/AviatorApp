import pg from 'pg';
import { config } from '../config.js';
import { log } from '../log.js';

const { Pool } = pg;

export let pool: pg.Pool | null = null;
let timescale = false;

export function dbAvailable(): boolean {
  return pool !== null;
}

export function hasTimescale(): boolean {
  return timescale;
}

export async function connectDb(): Promise<boolean> {
  if (!config.DATABASE_URL) {
    log.warn('DATABASE_URL not set — running without persistence (no playback, history, accounts or alerts)');
    return false;
  }
  const p = new Pool({ connectionString: config.DATABASE_URL, max: 10, idleTimeoutMillis: 30000 });
  for (let attempt = 1; attempt <= 20; attempt++) {
    try {
      const client = await p.connect();
      try {
        const r = await client.query<{ extname: string }>("SELECT extname FROM pg_extension WHERE extname = 'timescaledb'");
        timescale = r.rows.length > 0;
      } finally {
        client.release();
      }
      pool = p;
      log.info({ timescale }, 'database connected');
      return true;
    } catch (err) {
      log.warn({ attempt, err: (err as Error).message }, 'database not ready, retrying');
      await new Promise((r) => setTimeout(r, Math.min(10000, 500 * attempt)));
    }
  }
  if (config.DB_REQUIRED) throw new Error('database unavailable');
  log.error('database unavailable after retries — continuing without persistence');
  return false;
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params?: unknown[]): Promise<pg.QueryResult<T>> {
  if (!pool) throw new Error('database not available');
  return pool.query<T>(text, params);
}

export async function closeDb(): Promise<void> {
  await pool?.end();
  pool = null;
}
