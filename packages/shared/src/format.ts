import type { UserSettings } from './types.js';
import { ftToM, ktToKmh, ktToMph, fpmToMs } from './geo.js';

export function formatAltitude(ft: number | undefined, units: UserSettings['units'] = 'aviation'): string {
  if (ft === undefined || ft === null) return '—';
  if (units === 'metric') return `${Math.round(ftToM(ft)).toLocaleString()} m`;
  return `${Math.round(ft).toLocaleString()} ft`;
}

export function formatSpeed(kt: number | undefined, units: UserSettings['units'] = 'aviation'): string {
  if (kt === undefined || kt === null) return '—';
  if (units === 'metric') return `${Math.round(ktToKmh(kt))} km/h`;
  if (units === 'imperial') return `${Math.round(ktToMph(kt))} mph`;
  return `${Math.round(kt)} kt`;
}

export function formatVerticalRate(fpm: number | undefined, units: UserSettings['units'] = 'aviation'): string {
  if (fpm === undefined || fpm === null) return '—';
  const sign = fpm > 0 ? '+' : '';
  if (units === 'metric') return `${sign}${fpmToMs(fpm).toFixed(1)} m/s`;
  return `${sign}${Math.round(fpm).toLocaleString()} fpm`;
}

export function formatDistance(km: number | undefined, units: UserSettings['units'] = 'aviation'): string {
  if (km === undefined || km === null || !Number.isFinite(km)) return '—';
  if (units === 'metric') return `${Math.round(km).toLocaleString()} km`;
  if (units === 'imperial') return `${Math.round(km * 0.621371).toLocaleString()} mi`;
  return `${Math.round(km / 1.852).toLocaleString()} nm`;
}

export function formatHeading(deg: number | undefined): string {
  if (deg === undefined || deg === null) return '—';
  return `${Math.round(deg).toString().padStart(3, '0')}°`;
}

export function formatCoord(lat: number, lon: number): string {
  return `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(4)}°${lon >= 0 ? 'E' : 'W'}`;
}

export function formatTime(iso: string | undefined, tz: UserSettings['timeZone'] = 'local', withDate = false): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const opts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: false };
  if (withDate) { opts.month = 'short'; opts.day = 'numeric'; }
  if (tz === 'utc') opts.timeZone = 'UTC';
  else if (tz !== 'local') opts.timeZone = tz;
  try {
    return new Intl.DateTimeFormat(undefined, opts).format(d) + (tz === 'utc' ? 'Z' : '');
  } catch {
    return d.toISOString().slice(11, 16) + 'Z';
  }
}

export function formatDuration(minutes: number | undefined): string {
  if (minutes === undefined || !Number.isFinite(minutes)) return '—';
  const m = Math.round(Math.abs(minutes));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return h > 0 ? `${h}h ${mm.toString().padStart(2, '0')}m` : `${mm}m`;
}

export function formatAgo(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds)) return '—';
  if (seconds < 1) return 'now';
  if (seconds < 60) return `${Math.round(seconds)}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

/** Colour ramp used for altitude everywhere (trail, charts, 3D). Returns [r,g,b] 0..255. */
export function altitudeColor(ft: number | undefined): [number, number, number] {
  if (ft === undefined || ft === null) return [160, 160, 160];
  const stops: [number, [number, number, number]][] = [
    [0, [255, 255, 255]],
    [1000, [255, 230, 90]],
    [5000, [255, 150, 40]],
    [10000, [230, 60, 60]],
    [20000, [190, 50, 200]],
    [30000, [60, 110, 255]],
    [40000, [40, 220, 220]],
    [50000, [120, 255, 160]],
  ];
  if (ft <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (ft <= stops[i][0]) {
      const [f0, c0] = stops[i - 1];
      const [f1, c1] = stops[i];
      const t = (ft - f0) / (f1 - f0);
      return [0, 1, 2].map((k) => Math.round(c0[k] + (c1[k] - c0[k]) * t)) as [number, number, number];
    }
  }
  return stops[stops.length - 1][1];
}

export function altitudeColorCss(ft: number | undefined): string {
  const [r, g, b] = altitudeColor(ft);
  return `rgb(${r},${g},${b})`;
}
