import { config } from '../config.js';
import { log } from '../log.js';

export class HttpError extends Error {
  constructor(public status: number, message: string, public body?: string) {
    super(message);
  }
}

/** Simple per-key rate limiter: guarantees a minimum interval between calls. */
export class RateLimiter {
  private next = 0;
  private chain: Promise<void> = Promise.resolve();
  constructor(private minIntervalMs: number) {}
  async wait(): Promise<void> {
    const p = this.chain.then(async () => {
      const now = Date.now();
      const delay = Math.max(0, this.next - now);
      this.next = Math.max(now, this.next) + this.minIntervalMs;
      if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    });
    this.chain = p.catch(() => undefined);
    return p;
  }
}

export interface FetchOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  method?: string;
  body?: string;
  limiter?: RateLimiter;
}

export async function fetchJson<T = unknown>(url: string, opts: FetchOptions = {}): Promise<T> {
  const text = await fetchText(url, { ...opts, headers: { accept: 'application/json', ...(opts.headers ?? {}) } });
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(502, `invalid JSON from ${new URL(url).host}`);
  }
}

export async function fetchText(url: string, opts: FetchOptions = {}): Promise<string> {
  if (opts.limiter) await opts.limiter.wait();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 20000);
  try {
    const res = await fetch(url, {
      method: opts.method ?? 'GET',
      headers: { 'user-agent': config.USER_AGENT, ...(opts.headers ?? {}) },
      body: opts.body,
      signal: ctrl.signal,
    });
    const body = await res.text();
    if (!res.ok) {
      log.debug({ url, status: res.status }, 'upstream request failed');
      throw new HttpError(res.status, `${res.status} ${res.statusText} from ${new URL(url).host}`, body.slice(0, 500));
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchBuffer(url: string, opts: FetchOptions = {}): Promise<{ buffer: Buffer; contentType: string }> {
  if (opts.limiter) await opts.limiter.wait();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 20000);
  try {
    const res = await fetch(url, { headers: { 'user-agent': config.USER_AGENT, ...(opts.headers ?? {}) }, signal: ctrl.signal });
    if (!res.ok) throw new HttpError(res.status, `${res.status} from ${new URL(url).host}`);
    return { buffer: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get('content-type') ?? 'application/octet-stream' };
  } finally {
    clearTimeout(timer);
  }
}
