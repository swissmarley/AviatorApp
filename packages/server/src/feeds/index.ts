import { config } from '../config.js';
import { log } from '../log.js';
import type { FeedAdapter, FeedPollResult, FeedStatus, InterestArea } from './types.js';
import { OpenSkyAdapter } from './opensky.js';
import { DEFAULT_REGIONS, ReadsbAdapter, parseRegions } from './readsb.js';
import { SyntheticAdapter } from './synthetic.js';

export type FeedListener = (name: string, result: FeedPollResult) => void;

/**
 * Owns the configured feed adapters and polls each on its own interval with backoff.
 * Interest areas (client viewports) are supplied by the WebSocket hub.
 */
export class FeedManager {
  private adapters: FeedAdapter[] = [];
  private timers = new Map<string, NodeJS.Timeout>();
  private backoff = new Map<string, number>();
  private listeners: FeedListener[] = [];
  private interestProvider: () => InterestArea[] = () => [];
  private stopped = false;

  constructor() {
    for (const name of config.feeds) {
      switch (name) {
        case 'synthetic':
          this.adapters.push(new SyntheticAdapter(config.SYNTHETIC_COUNT, config.SYNTHETIC_SEED));
          break;
        case 'opensky':
          this.adapters.push(new OpenSkyAdapter({
            intervalMs: config.OPENSKY_INTERVAL_MS, bbox: config.feedBBox,
            clientId: config.OPENSKY_CLIENT_ID, clientSecret: config.OPENSKY_CLIENT_SECRET,
            username: config.OPENSKY_USERNAME, password: config.OPENSKY_PASSWORD,
          }));
          break;
        case 'adsblol':
          this.adapters.push(new ReadsbAdapter({
            name: 'adsblol', baseUrl: config.ADSBLOL_BASE_URL, intervalMs: config.ADSBLOL_INTERVAL_MS,
            minRequestIntervalMs: config.READSB_MIN_REQUEST_INTERVAL_MS, regions: parseRegions(config.READSB_REGIONS) ?? DEFAULT_REGIONS,
            bbox: config.feedBBox, tryGlobal: true,
          }));
          break;
        case 'airplaneslive':
          this.adapters.push(new ReadsbAdapter({
            name: 'airplaneslive', baseUrl: config.AIRPLANESLIVE_BASE_URL, intervalMs: config.AIRPLANESLIVE_INTERVAL_MS,
            minRequestIntervalMs: config.READSB_MIN_REQUEST_INTERVAL_MS, regions: parseRegions(config.READSB_REGIONS) ?? DEFAULT_REGIONS,
            bbox: config.feedBBox, tryGlobal: false,
          }));
          break;
        default:
          log.warn({ feed: name }, 'unknown feed in FEEDS, ignoring');
      }
    }
    if (this.adapters.length === 0) {
      log.warn('no valid feeds configured, falling back to synthetic');
      this.adapters.push(new SyntheticAdapter(config.SYNTHETIC_COUNT, config.SYNTHETIC_SEED));
    }
  }

  get names(): string[] { return this.adapters.map((a) => a.name); }

  onResult(fn: FeedListener): void { this.listeners.push(fn); }
  setInterestProvider(fn: () => InterestArea[]): void { this.interestProvider = fn; }

  statuses(): FeedStatus[] { return this.adapters.map((a) => a.status()); }

  async start(): Promise<void> {
    for (const a of this.adapters) {
      if (a.init) await a.init();
      log.info({ feed: a.name, intervalMs: a.intervalMs }, 'feed started');
      this.schedule(a, 0);
    }
  }

  stop(): void {
    this.stopped = true;
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }

  private schedule(a: FeedAdapter, delay: number): void {
    if (this.stopped) return;
    const t = setTimeout(() => this.runOnce(a), delay);
    this.timers.set(a.name, t);
  }

  private async runOnce(a: FeedAdapter): Promise<void> {
    const started = Date.now();
    try {
      const result = await a.poll(this.interestProvider());
      this.backoff.set(a.name, 0);
      for (const l of this.listeners) {
        try { l(a.name, result); } catch (err) { log.error({ err }, 'feed listener failed'); }
      }
      const elapsed = Date.now() - started;
      this.schedule(a, Math.max(250, a.intervalMs - elapsed));
    } catch (err) {
      const n = (this.backoff.get(a.name) ?? 0) + 1;
      this.backoff.set(a.name, n);
      const delay = Math.min(5 * 60_000, a.intervalMs * Math.pow(2, Math.min(n, 6)));
      log.warn({ feed: a.name, err: (err as Error).message, retryInMs: delay }, 'feed poll failed');
      this.schedule(a, delay);
    }
  }
}
