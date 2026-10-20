import type { AirportWeather, Metar, Taf } from '@contrail/shared';
import { config } from '../config.js';
import { cached } from './cache.js';
import { fetchJson, RateLimiter } from './http.js';
import { log } from '../log.js';

/** aviationweather.gov Data API (https://aviationweather.gov/data/api/). No key required; be gentle. */
interface AwMetar { icaoId: string; obsTime?: number; reportTime?: string; temp?: number; dewp?: number; wdir?: number | string; wspd?: number; wgst?: number; visib?: number | string; altim?: number; wxString?: string; fltCat?: string; rawOb: string; clouds?: { cover: string; base?: number }[] }
interface AwTaf { icaoId: string; issueTime?: string; validTimeFrom?: number; validTimeTo?: number; rawTAF: string }

const limiter = new RateLimiter(500);

export async function getAirportWeather(icao: string): Promise<AirportWeather> {
  const id = icao.toUpperCase();
  return cached(`wx:${id}`, 5 * 60, async () => {
    const [metar, taf] = await Promise.all([fetchMetar(id), fetchTaf(id)]);
    return { metar, taf, fetchedAt: new Date().toISOString() } satisfies AirportWeather;
  });
}

async function fetchMetar(id: string): Promise<Metar | undefined> {
  try {
    const res = await fetchJson<AwMetar[]>(`${config.AVIATIONWEATHER_BASE_URL}/metar?ids=${id}&format=json`, { limiter, timeoutMs: 10000 });
    const m = res[0];
    if (!m) return undefined;
    return {
      icao: m.icaoId, raw: m.rawOb, observed: m.obsTime ? new Date(m.obsTime * 1000).toISOString() : m.reportTime,
      tempC: m.temp, dewpointC: m.dewp, windDirDeg: typeof m.wdir === 'number' ? m.wdir : undefined, windSpeedKt: m.wspd, windGustKt: m.wgst,
      visibilityMi: m.visib, altimeterInHg: m.altim ? Math.round((m.altim / 33.8639) * 100) / 100 : undefined,
      flightCategory: m.fltCat as Metar['flightCategory'], clouds: m.clouds?.map((c) => ({ cover: c.cover, baseFt: c.base })), wx: m.wxString,
    };
  } catch (err) {
    log.debug({ err: (err as Error).message, id }, 'metar fetch failed');
    return undefined;
  }
}

async function fetchTaf(id: string): Promise<Taf | undefined> {
  try {
    const res = await fetchJson<AwTaf[]>(`${config.AVIATIONWEATHER_BASE_URL}/taf?ids=${id}&format=json`, { limiter, timeoutMs: 10000 });
    const t = res[0];
    if (!t) return undefined;
    return { icao: t.icaoId, raw: t.rawTAF, issued: t.issueTime, validFrom: t.validTimeFrom ? new Date(t.validTimeFrom * 1000).toISOString() : undefined, validTo: t.validTimeTo ? new Date(t.validTimeTo * 1000).toISOString() : undefined };
  } catch (err) {
    log.debug({ err: (err as Error).message, id }, 'taf fetch failed');
    return undefined;
  }
}

/** RainViewer frame index (https://www.rainviewer.com/api/weather-maps-api.html). Free tier, attribution required. */
export interface RadarFrames { host: string; generated: number; radar: { past: { time: number; path: string }[]; nowcast: { time: number; path: string }[] }; satellite: { infrared: { time: number; path: string }[] } }

export async function getRadarFrames(): Promise<RadarFrames | undefined> {
  return cached('rainviewer:frames', 120, async () => {
    try {
      const res = await fetchJson<RadarFrames>(config.RAINVIEWER_URL, { timeoutMs: 10000 });
      return { host: res.host, generated: res.generated, radar: res.radar, satellite: res.satellite };
    } catch (err) {
      log.debug({ err: (err as Error).message }, 'rainviewer fetch failed');
      return undefined;
    }
  });
}
