import { LRUCache } from 'lru-cache';
import { dbAvailable, query } from '../db/pool.js';
import { log } from '../log.js';

/**
 * Two-level cache: in-memory LRU in front of the api_cache table (when a database is configured),
 * so expensive upstream calls (schedules, photos, METARs) survive restarts and are shared between
 * server instances.
 */
const mem = new LRUCache<string, { value: unknown; expiresAt: number }>({ max: 5000 });
const inflight = new Map<string, Promise<unknown>>();

export async function cacheGet<T>(key: string): Promise<T | undefined> {
  const hit = mem.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value as T;
  if (dbAvailable()) {
    try {
      const r = await query<{ value: T; expires_at: Date }>('SELECT value, expires_at FROM api_cache WHERE key = $1 AND expires_at > now()', [key]);
      if (r.rows[0]) {
        mem.set(key, { value: r.rows[0].value, expiresAt: new Date(r.rows[0].expires_at).getTime() });
        return r.rows[0].value;
      }
    } catch (err) {
      log.debug({ err: (err as Error).message }, 'cache read failed');
    }
  }
  return undefined;
}

export async function cacheSet<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  const expiresAt = Date.now() + ttlSeconds * 1000;
  mem.set(key, { value, expiresAt });
  if (dbAvailable()) {
    try {
      await query(
        'INSERT INTO api_cache(key, value, expires_at) VALUES ($1, $2, $3) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at',
        [key, JSON.stringify(value), new Date(expiresAt)],
      );
    } catch (err) {
      log.debug({ err: (err as Error).message }, 'cache write failed');
    }
  }
}

/** Memoize an async producer by key with TTL and request coalescing. */
export async function cached<T>(key: string, ttlSeconds: number, producer: () => Promise<T>): Promise<T> {
  const hit = await cacheGet<T>(key);
  if (hit !== undefined) return hit;
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const p = (async () => {
    try {
      const v = await producer();
      if (v !== undefined && v !== null) await cacheSet(key, v, ttlSeconds);
      return v;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

export async function cacheSweep(): Promise<void> {
  if (!dbAvailable()) return;
  try {
    await query('DELETE FROM api_cache WHERE expires_at < now()');
  } catch { /* ignore */ }
}
