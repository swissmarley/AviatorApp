import type { AircraftState, AlertKind } from '@contrail/shared';
import { emergencyLabel } from '@contrail/shared';
import { config } from '../config.js';
import { log } from '../log.js';
import { dbAvailable, query } from '../db/pool.js';
import { store, type StoreEvent } from '../store/aircraftStore.js';
import { sendEmail, sendPush } from './notify.js';
import { getFlightInfo } from './flightInfo.js';

/**
 * Alert engine. Rules are matched by subject (flight number, callsign, registration, hex, or '*')
 * against live aircraft; departure/landing/emergency fire on state transitions, delay is polled
 * against the schedule provider every few minutes.
 */
interface Rule { id: string; user_id: string; email: string; kind: AlertKind; subject: string; channels: string[]; last_fired_at: Date | null }

let rules: Rule[] = [];
let timer: NodeJS.Timeout | undefined;
let delayTimer: NodeJS.Timeout | undefined;

export async function reloadRules(): Promise<void> {
  if (!dbAvailable()) return;
  const r = await query<Rule>('SELECT r.id, r.user_id, u.email, r.kind, r.subject, r.channels, r.last_fired_at FROM alert_rules r JOIN users u ON u.id = r.user_id WHERE r.enabled');
  rules = r.rows;
}

export function startAlerts(): void {
  if (!dbAvailable()) { log.info('alerts disabled (no database)'); return; }
  void reloadRules();
  timer = setInterval(() => void reloadRules(), 60_000);
  delayTimer = setInterval(() => void checkDelays(), 5 * 60_000);
  store.on((e) => void onEvent(e));
  log.info('alert engine started');
}

export function stopAlerts(): void { if (timer) clearInterval(timer); if (delayTimer) clearInterval(delayTimer); }

function matches(rule: Rule, a: AircraftState): boolean {
  const s = rule.subject.toUpperCase();
  if (s === '*') return true;
  return a.hex.toUpperCase() === s || a.callsign === s || a.flightNo === s || a.reg?.toUpperCase() === s;
}

async function onEvent(e: StoreEvent): Promise<void> {
  const kind: AlertKind | undefined = e.type === 'airborne' ? 'departure' : e.type === 'landed' ? 'landing' : e.type === 'emergency' ? 'emergency' : undefined;
  if (!kind) return;
  const a = e.a;
  for (const r of rules) {
    if (r.kind !== kind || !matches(r, a)) continue;
    if (r.last_fired_at && Date.now() - new Date(r.last_fired_at).getTime() < 10 * 60_000 && r.subject !== '*') continue;
    const label = a.flightNo ?? a.callsign ?? a.reg ?? a.hex.toUpperCase();
    const title = kind === 'departure' ? `${label} has departed` : kind === 'landing' ? `${label} has landed` : `${label}: ${emergencyLabel(a.emergency, a.squawk)}`;
    const body = kind === 'emergency' ? `Squawk ${a.squawk ?? '—'} near ${a.lat.toFixed(2)}, ${a.lon.toFixed(2)}` : `${a.reg ?? ''} ${a.type ?? ''}`.trim() || 'Tap to follow on the map';
    await fire(r, { title, body, url: `${config.PUBLIC_URL}/flight/${a.hex}`, tag: `${kind}:${a.hex}` }, a);
  }
}

async function checkDelays(): Promise<void> {
  for (const r of rules.filter((x) => x.kind === 'delay' && x.subject !== '*')) {
    if (r.last_fired_at && Date.now() - new Date(r.last_fired_at).getTime() < 60 * 60_000) continue;
    const live = store.search(r.subject, 1)[0];
    try {
      const info = await getFlightInfo(live?.callsign ?? r.subject, live?.flightNo ?? r.subject, live?.hex);
      if (info?.delayMin !== undefined && info.delayMin >= 15) {
        await fire(r, { title: `${info.flightNo ?? r.subject} delayed ${info.delayMin} min`, body: `${info.departure?.iata ?? info.departure?.airport ?? '?'} → ${info.arrival?.iata ?? info.arrival?.airport ?? '?'}, now ${info.status}`, url: live ? `${config.PUBLIC_URL}/flight/${live.hex}` : config.PUBLIC_URL, tag: `delay:${r.subject}` }, live);
      }
    } catch { /* provider unavailable */ }
  }
}

async function fire(r: Rule, n: { title: string; body: string; url: string; tag: string }, a?: AircraftState): Promise<void> {
  r.last_fired_at = new Date();
  try {
    await query('UPDATE alert_rules SET last_fired_at = now() WHERE id = $1', [r.id]);
    await query('INSERT INTO alert_events (rule_id, user_id, title, body, payload) VALUES ($1, $2, $3, $4, $5)', [r.id, r.user_id, n.title, n.body, JSON.stringify({ url: n.url, hex: a?.hex, callsign: a?.callsign })]);
    if (r.channels.includes('push')) await sendPush(r.user_id, n);
    if (r.channels.includes('email')) await sendEmail(r.email, n);
    log.info({ rule: r.id, title: n.title }, 'alert fired');
  } catch (err) {
    log.warn({ err: (err as Error).message }, 'alert delivery failed');
  }
}
