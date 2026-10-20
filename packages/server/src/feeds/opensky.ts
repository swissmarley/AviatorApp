import type { BBox, PositionSource } from '@contrail/shared';
import { msToKt, mToFt } from '@contrail/shared';
import type { FeedAdapter, FeedAircraft, FeedPollResult, FeedStatus, InterestArea } from './types.js';
import { fetchJson, fetchText, HttpError, RateLimiter } from '../services/http.js';
import { log } from '../log.js';

/**
 * OpenSky Network adapter (https://openskynetwork.github.io/opensky-api/rest.html).
 *
 * Credits: anonymous users get 400 credits/day, registered users 4000 (8000 for feeders).
 * A `/states/all` call costs 1–4 credits depending on the bounding-box area, so the default
 * interval is deliberately slow and a FEED_BBOX is strongly recommended for anonymous use.
 * Authentication: OAuth2 client credentials (OPENSKY_CLIENT_ID/SECRET) or the legacy
 * basic-auth username/password.
 */

type StateVector = [
  string, string | null, string, number | null, number, number | null, number | null, number | null,
  boolean, number | null, number | null, number | null, number[] | null, number | null, string | null, boolean, number, number?,
];

interface StatesResponse { time: number; states: StateVector[] | null }

export interface OpenSkyOptions {
  intervalMs: number;
  bbox?: BBox;
  clientId?: string;
  clientSecret?: string;
  username?: string;
  password?: string;
}

const EMITTER_BY_CATEGORY: Record<number, string> = {
  2: 'A1', 3: 'A2', 4: 'A3', 5: 'A4', 6: 'A5', 7: 'A6', 8: 'A7', 9: 'B1', 10: 'B2', 11: 'B3', 12: 'B4', 14: 'B6', 15: 'B7', 16: 'C1', 17: 'C2',
};

function sourceFromPositionSource(ps: number | null): PositionSource {
  switch (ps) {
    case 0: return 'adsb';
    case 1: return 'other'; // ASTERIX
    case 2: return 'mlat';
    case 3: return 'flarm';
    default: return 'other';
  }
}

export class OpenSkyAdapter implements FeedAdapter {
  readonly name = 'opensky';
  readonly intervalMs: number;
  private limiter = new RateLimiter(5000);
  private token?: { value: string; expiresAt: number };
  private st: FeedStatus;

  constructor(private opts: OpenSkyOptions) {
    this.intervalMs = opts.intervalMs;
    this.st = { name: this.name, healthy: false, aircraft: 0, requests: 0, intervalMs: opts.intervalMs };
  }

  status(): FeedStatus { return { ...this.st }; }

  private async authHeaders(): Promise<Record<string, string>> {
    if (this.opts.clientId && this.opts.clientSecret) {
      if (!this.token || this.token.expiresAt < Date.now() + 30000) {
        const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: this.opts.clientId, client_secret: this.opts.clientSecret });
        const text = await fetchText('https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token', {
          method: 'POST', body: body.toString(), headers: { 'content-type': 'application/x-www-form-urlencoded' },
        });
        const json = JSON.parse(text) as { access_token: string; expires_in: number };
        this.token = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
        log.info('opensky: obtained OAuth2 token');
      }
      return { authorization: `Bearer ${this.token.value}` };
    }
    if (this.opts.username && this.opts.password) {
      return { authorization: `Basic ${Buffer.from(`${this.opts.username}:${this.opts.password}`).toString('base64')}` };
    }
    return {};
  }

  async poll(_interest: InterestArea[]): Promise<FeedPollResult> {
    const now = Date.now();
    const params = new URLSearchParams({ extended: '1' });
    const b = this.opts.bbox;
    if (b) {
      params.set('lamin', b.south.toFixed(3)); params.set('lomin', b.west.toFixed(3));
      params.set('lamax', b.north.toFixed(3)); params.set('lomax', b.east.toFixed(3));
    }
    try {
      this.st.requests++;
      const res = await fetchJson<StatesResponse>(`https://opensky-network.org/api/states/all?${params}`, {
        headers: await this.authHeaders(), limiter: this.limiter, timeoutMs: 30000,
      });
      const base = (res.time ?? Math.floor(now / 1000)) * 1000;
      const aircraft: FeedAircraft[] = [];
      for (const s of res.states ?? []) {
        if (s[5] === null || s[6] === null) continue;
        const posTs = s[3] ? s[3] * 1000 : base;
        const seenPos = Math.max(0, (now - posTs) / 1000);
        const category = s[17];
        aircraft.push({
          hex: s[0].toLowerCase(),
          callsign: s[1]?.trim() || undefined,
          lat: s[6],
          lon: s[5],
          ts: posTs,
          seenPos,
          seen: Math.max(0, (now - s[4] * 1000) / 1000),
          source: sourceFromPositionSource(s[16]),
          onGround: s[8],
          altBaro: s[7] !== null ? Math.round(mToFt(s[7])) : s[8] ? 0 : undefined,
          altGeom: s[13] !== null ? Math.round(mToFt(s[13])) : undefined,
          gs: s[9] !== null ? Math.round(msToKt(s[9])) : undefined,
          track: s[10] ?? undefined,
          vr: s[11] !== null ? Math.round(s[11] * 196.85) : undefined,
          squawk: s[14] ?? undefined,
          emitter: category !== undefined ? EMITTER_BY_CATEGORY[category] : undefined,
        });
      }
      this.st = { ...this.st, healthy: true, lastSuccess: now, lastError: undefined, aircraft: aircraft.length };
      return { ts: now, aircraft, coverage: b ? [b] : 'global' };
    } catch (err) {
      const msg = err instanceof HttpError && err.status === 429 ? 'rate limited (credits exhausted?)' : (err as Error).message;
      this.st = { ...this.st, healthy: false, lastError: msg };
      throw err;
    }
  }
}
