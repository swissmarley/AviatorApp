import type { AircraftPhoto } from '@contrail/shared';
import { config } from '../config.js';
import { cached } from './cache.js';
import { fetchJson, RateLimiter } from './http.js';
import { log } from '../log.js';

/**
 * Planespotters.net public photo API. Terms: free for non-commercial use, photos must be
 * attributed to the photographer and link back to Planespotters.net, and responses should be
 * cached. See https://www.planespotters.net/photo/api
 */
interface PsResponse { photos?: { id: string; thumbnail?: { src: string }; thumbnail_large?: { src: string }; link?: string; photographer?: string }[] }

const limiter = new RateLimiter(400);
const NONE: AircraftPhoto = { url: '', attribution: '', source: 'none' };

export async function getAircraftPhoto(opts: { reg?: string; hex?: string }): Promise<AircraftPhoto> {
  if (!config.PLANESPOTTERS_ENABLED) return NONE;
  const key = opts.reg ? `photo:reg:${opts.reg.toUpperCase()}` : opts.hex ? `photo:hex:${opts.hex.toLowerCase()}` : undefined;
  if (!key) return NONE;
  return cached(key, 24 * 3600, async () => {
    const url = opts.reg
      ? `https://api.planespotters.net/pub/photos/reg/${encodeURIComponent(opts.reg)}`
      : `https://api.planespotters.net/pub/photos/hex/${encodeURIComponent(opts.hex!)}`;
    try {
      const res = await fetchJson<PsResponse>(url, { limiter, timeoutMs: 10000 });
      const p = res.photos?.[0];
      if (!p) return NONE;
      return {
        url: p.thumbnail_large?.src ?? p.thumbnail?.src ?? '',
        thumbUrl: p.thumbnail?.src,
        photographer: p.photographer,
        link: p.link,
        attribution: `© ${p.photographer ?? 'Unknown'} via Planespotters.net`,
        source: 'planespotters',
      } satisfies AircraftPhoto;
    } catch (err) {
      log.debug({ err: (err as Error).message }, 'planespotters lookup failed');
      return NONE;
    }
  });
}
