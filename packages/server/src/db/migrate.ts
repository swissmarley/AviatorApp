import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, connectDb, hasTimescale, closeDb } from './pool.js';
import { log } from '../log.js';
import { config } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function runMigrations(): Promise<void> {
  if (!pool) return;
  const dir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const client = await pool.connect();
  try {
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const applied = new Set((await client.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
    for (const f of files) {
      if (applied.has(f)) continue;
      let sql = fs.readFileSync(path.join(dir, f), 'utf8');
      if (!hasTimescale()) {
        // Strip Timescale-specific statements so the schema still works on vanilla Postgres.
        sql = sql.replace(/^--\s*timescale:begin[\s\S]*?--\s*timescale:end\s*$/gm, '');
      }
      sql = sql.replace(/\$\{RETENTION_DAYS\}/g, String(config.POSITION_RETENTION_DAYS));
      log.info({ migration: f }, 'applying migration');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [f]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
  } finally {
    client.release();
  }
}

// Allow `npm run migrate`
if (process.argv[1] && process.argv[1].endsWith('migrate.ts') || process.argv[1]?.endsWith('migrate.js')) {
  connectDb().then(async (ok) => {
    if (!ok) process.exit(1);
    await runMigrations();
    await closeDb();
    log.info('migrations complete');
  }).catch((err) => { log.error(err); process.exit(1); });
}
