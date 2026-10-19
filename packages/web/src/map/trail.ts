import type { GeoJSONSource, Map as MlMap } from 'maplibre-gl';
import type { TrailPoint } from '@contrail/shared';
import { altitudeColorCss } from '@contrail/shared';

export const TRAIL_SOURCE = 'trail';

export function ensureTrailLayers(map: MlMap, beforeId?: string): void {
  if (!map.getSource(TRAIL_SOURCE)) map.addSource(TRAIL_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  if (!map.getLayer('trail-casing')) {
    map.addLayer({ id: 'trail-casing', type: 'line', source: TRAIL_SOURCE, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': 'rgba(0,0,0,0.5)', 'line-width': 5 } }, beforeId);
    map.addLayer({ id: 'trail-line', type: 'line', source: TRAIL_SOURCE, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 2.5 } }, beforeId);
  }
}

/** Builds per-segment features coloured by altitude; `head` is the live interpolated position. */
export function trailGeoJson(points: TrailPoint[], head?: [number, number, number] | null, maxMinutes = 0): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  const cutoff = maxMinutes > 0 ? Date.now() - maxMinutes * 60_000 : 0;
  const pts = cutoff ? points.filter((p) => p.ts >= cutoff) : points;
  const all = head ? [...pts, { ts: Date.now(), lat: head[0], lon: head[1], alt: head[2] } as TrailPoint] : pts;
  for (let i = 1; i < all.length; i++) {
    const a = all[i - 1], b = all[i];
    if (Math.abs(a.lon - b.lon) > 180) continue; // antimeridian split
    features.push({ type: 'Feature', properties: { color: altitudeColorCss(b.alt ?? a.alt), alt: b.alt ?? null }, geometry: { type: 'LineString', coordinates: [[a.lon, a.lat], [b.lon, b.lat]] } });
  }
  return { type: 'FeatureCollection', features };
}

export function setTrail(map: MlMap, data: GeoJSON.FeatureCollection): void {
  (map.getSource(TRAIL_SOURCE) as GeoJSONSource | undefined)?.setData(data);
}
