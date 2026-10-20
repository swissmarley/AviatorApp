import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { DEFAULT_SETTINGS } from '@contrail/shared';
import { dbAvailable, query } from '../db/pool.js';
import { COOKIE, login, register, requireUser, setSessionCookie, signToken, userFromRequest } from '../services/auth.js';
import { notificationsStatus, sendPush } from '../services/notify.js';
import { reloadRules } from '../services/alerts.js';

const credentials = z.object({ email: z.string().email(), password: z.string().min(8).max(200), displayName: z.string().max(60).optional() });
const bookmark = z.object({ kind: z.enum(['location', 'flight', 'airport']), label: z.string().min(1).max(120), data: z.record(z.unknown()) });
const filter = z.object({ name: z.string().min(1).max(60), spec: z.record(z.unknown()) });
const alertRule = z.object({ kind: z.enum(['departure', 'landing', 'delay', 'emergency']), subject: z.string().min(1).max(20), channels: z.array(z.enum(['push', 'email'])).min(1) });
const pushSub = z.object({ endpoint: z.string().url(), keys: z.object({ p256dh: z.string(), auth: z.string() }) });

export async function accountRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/auth/status', async (req) => ({ accountsEnabled: dbAvailable(), user: userFromRequest(req), notifications: notificationsStatus() }));

  app.post('/api/auth/register', async (req, reply) => {
    if (!dbAvailable()) return reply.code(503).send({ error: 'accounts require a database' });
    const body = credentials.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid email or password (min 8 chars)' });
    try {
      const u = await register(body.data.email, body.data.password, body.data.displayName);
      const token = signToken(u);
      setSessionCookie(reply, token);
      return { user: u, token };
    } catch (err) {
      if ((err as { code?: string }).code === '23505') return reply.code(409).send({ error: 'email already registered' });
      throw err;
    }
  });

  app.post('/api/auth/login', async (req, reply) => {
    if (!dbAvailable()) return reply.code(503).send({ error: 'accounts require a database' });
    const body = credentials.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid credentials' });
    const u = await login(body.data.email, body.data.password);
    if (!u) return reply.code(401).send({ error: 'wrong email or password' });
    const token = signToken(u);
    setSessionCookie(reply, token);
    return { user: u, token };
  });

  app.post('/api/auth/logout', async (_req, reply) => { reply.clearCookie(COOKIE, { path: '/' }); return { ok: true }; });

  app.get('/api/me', async (req, reply) => {
    const u = await requireUser(req, reply); if (!u) return;
    const r = await query<{ settings: Record<string, unknown>; display_name: string | null; created_at: Date }>('SELECT settings, display_name, created_at FROM users WHERE id = $1', [u.id]);
    const [bookmarks, filters, alerts, events, subs] = await Promise.all([
      query('SELECT id, kind, label, data, created_at AS "createdAt" FROM bookmarks WHERE user_id = $1 ORDER BY created_at DESC', [u.id]),
      query('SELECT id, name, spec, created_at AS "createdAt" FROM saved_filters WHERE user_id = $1 ORDER BY created_at DESC', [u.id]),
      query('SELECT id, kind, subject, channels, enabled, created_at AS "createdAt", last_fired_at AS "lastFiredAt" FROM alert_rules WHERE user_id = $1 ORDER BY created_at DESC', [u.id]),
      query('SELECT id, fired_at AS "firedAt", title, body, payload, read FROM alert_events WHERE user_id = $1 ORDER BY fired_at DESC LIMIT 50', [u.id]),
      query('SELECT count(*)::int AS n FROM push_subscriptions WHERE user_id = $1', [u.id]),
    ]);
    return { user: { ...u, displayName: r.rows[0]?.display_name, createdAt: r.rows[0]?.created_at }, settings: { ...DEFAULT_SETTINGS, ...(r.rows[0]?.settings ?? {}) }, bookmarks: bookmarks.rows, filters: filters.rows, alerts: alerts.rows, events: events.rows, pushSubscriptions: subs.rows[0]?.n ?? 0 };
  });

  app.put('/api/me/settings', async (req, reply) => {
    const u = await requireUser(req, reply); if (!u) return;
    const s = z.object({ units: z.enum(['aviation', 'metric', 'imperial']).optional(), timeZone: z.string().max(64).optional(), iconSize: z.number().min(0.4).max(2.5).optional(), trailLength: z.number().min(0).max(1440).optional(), mapStyle: z.enum(['dark', 'light', 'satellite', 'terrain']).optional(), labels: z.boolean().optional() }).safeParse(req.body);
    if (!s.success) return reply.code(400).send({ error: 'invalid settings' });
    const r = await query<{ settings: Record<string, unknown> }>('UPDATE users SET settings = settings || $2::jsonb WHERE id = $1 RETURNING settings', [u.id, JSON.stringify(s.data)]);
    return { settings: { ...DEFAULT_SETTINGS, ...r.rows[0].settings } };
  });

  app.post('/api/me/bookmarks', async (req, reply) => {
    const u = await requireUser(req, reply); if (!u) return;
    const b = bookmark.safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: 'invalid bookmark' });
    const r = await query('INSERT INTO bookmarks (user_id, kind, label, data) VALUES ($1,$2,$3,$4) RETURNING id, kind, label, data, created_at AS "createdAt"', [u.id, b.data.kind, b.data.label, JSON.stringify(b.data.data)]);
    return r.rows[0];
  });
  app.delete<{ Params: { id: string } }>('/api/me/bookmarks/:id', async (req, reply) => {
    const u = await requireUser(req, reply); if (!u) return;
    await query('DELETE FROM bookmarks WHERE id = $1 AND user_id = $2', [req.params.id, u.id]);
    return { ok: true };
  });

  app.post('/api/me/filters', async (req, reply) => {
    const u = await requireUser(req, reply); if (!u) return;
    const f = filter.safeParse(req.body);
    if (!f.success) return reply.code(400).send({ error: 'invalid filter' });
    const r = await query('INSERT INTO saved_filters (user_id, name, spec) VALUES ($1,$2,$3) RETURNING id, name, spec, created_at AS "createdAt"', [u.id, f.data.name, JSON.stringify(f.data.spec)]);
    return r.rows[0];
  });
  app.delete<{ Params: { id: string } }>('/api/me/filters/:id', async (req, reply) => {
    const u = await requireUser(req, reply); if (!u) return;
    await query('DELETE FROM saved_filters WHERE id = $1 AND user_id = $2', [req.params.id, u.id]);
    return { ok: true };
  });

  app.post('/api/me/alerts', async (req, reply) => {
    const u = await requireUser(req, reply); if (!u) return;
    const a = alertRule.safeParse(req.body);
    if (!a.success) return reply.code(400).send({ error: 'invalid alert rule' });
    const r = await query('INSERT INTO alert_rules (user_id, kind, subject, channels) VALUES ($1,$2,upper($3),$4) RETURNING id, kind, subject, channels, enabled, created_at AS "createdAt"', [u.id, a.data.kind, a.data.subject, a.data.channels]);
    await reloadRules();
    return r.rows[0];
  });
  app.patch<{ Params: { id: string } }>('/api/me/alerts/:id', async (req, reply) => {
    const u = await requireUser(req, reply); if (!u) return;
    const b = z.object({ enabled: z.boolean() }).safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: 'invalid body' });
    await query('UPDATE alert_rules SET enabled = $3 WHERE id = $1 AND user_id = $2', [req.params.id, u.id, b.data.enabled]);
    await reloadRules();
    return { ok: true };
  });
  app.delete<{ Params: { id: string } }>('/api/me/alerts/:id', async (req, reply) => {
    const u = await requireUser(req, reply); if (!u) return;
    await query('DELETE FROM alert_rules WHERE id = $1 AND user_id = $2', [req.params.id, u.id]);
    await reloadRules();
    return { ok: true };
  });
  app.post('/api/me/alerts/events/read', async (req, reply) => {
    const u = await requireUser(req, reply); if (!u) return;
    await query('UPDATE alert_events SET read = true WHERE user_id = $1', [u.id]);
    return { ok: true };
  });

  app.post('/api/me/push', async (req, reply) => {
    const u = await requireUser(req, reply); if (!u) return;
    const s = pushSub.safeParse(req.body);
    if (!s.success) return reply.code(400).send({ error: 'invalid subscription' });
    await query('INSERT INTO push_subscriptions (user_id, endpoint, keys, user_agent) VALUES ($1,$2,$3,$4) ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, keys = EXCLUDED.keys', [u.id, s.data.endpoint, JSON.stringify(s.data.keys), req.headers['user-agent'] ?? null]);
    return { ok: true };
  });
  app.delete('/api/me/push', async (req, reply) => {
    const u = await requireUser(req, reply); if (!u) return;
    const b = z.object({ endpoint: z.string() }).safeParse(req.body);
    if (b.success) await query('DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2', [u.id, b.data.endpoint]);
    return { ok: true };
  });
  app.post('/api/me/push/test', async (req, reply) => {
    const u = await requireUser(req, reply); if (!u) return;
    const sent = await sendPush(u.id, { title: 'Contrail test notification', body: 'Push notifications are working.', url: '/' });
    return { sent };
  });
}
