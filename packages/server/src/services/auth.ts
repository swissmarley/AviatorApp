import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { dbAvailable, query } from '../db/pool.js';

export interface AuthUser { id: string; email: string }

export const COOKIE = 'contrail_session';

export function signToken(u: AuthUser): string {
  return jwt.sign({ sub: u.id, email: u.email }, config.JWT_SECRET, { expiresIn: '30d' });
}

export function verifyToken(token: string): AuthUser | null {
  try {
    const p = jwt.verify(token, config.JWT_SECRET) as { sub: string; email: string };
    return { id: p.sub, email: p.email };
  } catch {
    return null;
  }
}

export function userFromRequest(req: FastifyRequest): AuthUser | null {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : (req.cookies as Record<string, string | undefined> | undefined)?.[COOKIE];
  return token ? verifyToken(token) : null;
}

export async function requireUser(req: FastifyRequest, reply: FastifyReply): Promise<AuthUser | null> {
  if (!dbAvailable()) { reply.code(503).send({ error: 'accounts require a database' }); return null; }
  const u = userFromRequest(req);
  if (!u) { reply.code(401).send({ error: 'not signed in' }); return null; }
  return u;
}

export async function register(email: string, password: string, displayName?: string): Promise<AuthUser> {
  const hash = await bcrypt.hash(password, 10);
  const r = await query<{ id: string; email: string }>('INSERT INTO users (email, password_hash, display_name) VALUES (lower($1), $2, $3) RETURNING id, email', [email, hash, displayName ?? null]);
  return r.rows[0];
}

export async function login(email: string, password: string): Promise<AuthUser | null> {
  const r = await query<{ id: string; email: string; password_hash: string }>('SELECT id, email, password_hash FROM users WHERE email = lower($1)', [email]);
  const u = r.rows[0];
  if (!u || !(await bcrypt.compare(password, u.password_hash))) return null;
  return { id: u.id, email: u.email };
}

export function setSessionCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(COOKIE, token, { path: '/', httpOnly: true, sameSite: 'lax', secure: config.isProd, maxAge: 30 * 24 * 3600 });
}
