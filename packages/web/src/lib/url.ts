/** Map position ⇄ URL hash (#map=zoom/lat/lon[/bearing/pitch]) for deep links. */
export interface MapPos { zoom: number; lat: number; lon: number; bearing?: number; pitch?: number }

export function readMapPos(hash = location.hash): MapPos | null {
  const m = /map=([\d.]+)\/(-?[\d.]+)\/(-?[\d.]+)(?:\/(-?[\d.]+))?(?:\/(-?[\d.]+))?/.exec(hash);
  if (!m) return null;
  const [zoom, lat, lon, bearing, pitch] = m.slice(1).map((v) => (v === undefined ? undefined : Number(v)));
  if (![zoom, lat, lon].every((v) => Number.isFinite(v))) return null;
  return { zoom: zoom!, lat: lat!, lon: lon!, bearing, pitch };
}

export function writeMapPos(p: MapPos): void {
  const parts = [p.zoom.toFixed(2), p.lat.toFixed(4), p.lon.toFixed(4)];
  if ((p.bearing && Math.abs(p.bearing) > 0.5) || (p.pitch && p.pitch > 0.5)) parts.push((p.bearing ?? 0).toFixed(0), (p.pitch ?? 0).toFixed(0));
  const next = `#map=${parts.join('/')}`;
  if (location.hash !== next) history.replaceState(history.state, '', `${location.pathname}${location.search}${next}`);
}

export function shareUrl(path: string, pos?: MapPos | null): string {
  const u = new URL(path, location.origin);
  if (pos) u.hash = `map=${pos.zoom.toFixed(2)}/${pos.lat.toFixed(4)}/${pos.lon.toFixed(4)}`;
  return u.toString();
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) { await navigator.share({ url: text }); return true; }
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
