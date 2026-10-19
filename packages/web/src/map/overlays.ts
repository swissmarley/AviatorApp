import type { GeoJSONSource, Map as MlMap, RasterTileSource } from 'maplibre-gl';
import { terminatorPolygon } from '@contrail/shared';
import { api, API_BASE } from '@/lib/api';
import type { LayerKey } from '@/state/settings';
import type { PointLabel } from './LabelCanvas';

/**
 * Toggleable overlay layers. Everything is (re)installed after each style change because
 * `map.setStyle` discards sources and layers.
 */
interface RadarFrames { host: string; radar: { past: { time: number; path: string }[]; nowcast: { time: number; path: string }[] }; satellite: { infrared: { time: number; path: string }[] } }

export class Overlays {
  private visible: Record<LayerKey, boolean>;
  private firLoaded = false;
  private airwaysLoaded = false;
  private radarFrames: RadarFrames | null = null;
  private radarIndex = -1;
  private terminatorTimer = 0;
  private moveTimer = 0;
  private installed = false;
  onLabels: (key: 'airports' | 'navaids' | 'fir', labels: PointLabel[]) => void = () => undefined;

  constructor(private map: MlMap, visible: Record<LayerKey, boolean>) {
    this.visible = { ...visible };
    map.on('moveend', () => this.scheduleRefresh());
  }

  /** Re-create sources & layers on the current style. `beforeId` keeps overlays under the aircraft. */
  install(beforeId?: string): void {
    const map = this.map;
    const before = beforeId && map.getLayer(beforeId) ? beforeId : undefined;
    const light = (map.getStyle()?.name ?? '').includes('light') || (map.getStyle()?.name ?? '').includes('terrain') || (map.getStyle()?.name ?? '').includes('outdoor');

    // Day/night terminator
    map.addSource('terminator', { type: 'geojson', data: this.terminatorFeature() });
    map.addLayer({ id: 'terminator', type: 'fill', source: 'terminator', paint: { 'fill-color': '#000', 'fill-opacity': light ? 0.18 : 0.35 } }, before);

    // Weather radar & clouds (RainViewer raster tiles)
    map.addSource('clouds', { type: 'raster', tiles: ['data:,'], tileSize: 256, maxzoom: 10, attribution: 'Clouds © RainViewer' });
    map.addLayer({ id: 'clouds', type: 'raster', source: 'clouds', paint: { 'raster-opacity': 0.55 } }, before);
    map.addSource('radar', { type: 'raster', tiles: ['data:,'], tileSize: 256, maxzoom: 10, attribution: 'Radar © RainViewer' });
    map.addLayer({ id: 'radar', type: 'raster', source: 'radar', paint: { 'raster-opacity': 0.75 } }, before);

    // FIR boundaries
    map.addSource('fir', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'fir-fill', type: 'fill', source: 'fir', paint: { 'fill-color': '#38bdf8', 'fill-opacity': 0.04 } }, before);
    map.addLayer({ id: 'fir-line', type: 'line', source: 'fir', paint: { 'line-color': '#38bdf8', 'line-width': 1, 'line-opacity': 0.6, 'line-dasharray': [3, 2] } }, before);

    // Airways
    map.addSource('airways', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'airways', type: 'line', source: 'airways', paint: { 'line-color': '#a78bfa', 'line-width': 1, 'line-opacity': 0.6 } }, before);

    // Navaids
    map.addSource('navaids', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'navaids', type: 'circle', source: 'navaids', minzoom: 6, paint: { 'circle-radius': 3, 'circle-color': '#c084fc', 'circle-stroke-color': '#1e1b4b', 'circle-stroke-width': 1 } }, before);

    // Airports
    map.addSource('airports', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'airports', type: 'circle', source: 'airports',
      paint: {
        'circle-radius': ['match', ['get', 'type'], 'large_airport', 5, 'medium_airport', 4, 3],
        'circle-color': ['match', ['get', 'type'], 'large_airport', '#38bdf8', 'medium_airport', '#7dd3fc', '#94a3b8'],
        'circle-stroke-color': light ? '#0f172a' : '#0b1220', 'circle-stroke-width': 1.5,
      },
    }, before);

    this.installed = true;
    for (const key of Object.keys(this.visible) as LayerKey[]) this.apply(key);
    this.scheduleRefresh();
    if (!this.terminatorTimer) this.terminatorTimer = window.setInterval(() => (map.getSource('terminator') as GeoJSONSource | undefined)?.setData(this.terminatorFeature()), 60_000);
  }

  private terminatorFeature(): GeoJSON.Feature {
    return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [terminatorPolygon(new Date())] } };
  }

  setVisible(key: LayerKey, on: boolean): void {
    this.visible[key] = on;
    if (this.installed) this.apply(key);
  }

  private apply(key: LayerKey): void {
    const map = this.map;
    const on = this.visible[key];
    const vis = on ? 'visible' : 'none';
    const ids: Record<LayerKey, string[]> = { airports: ['airports'], fir: ['fir-fill', 'fir-line'], radar: ['radar'], clouds: ['clouds'], airways: ['airways'], navaids: ['navaids'], terminator: ['terminator'], labels: [] };
    for (const id of ids[key]) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis);
    if (on) {
      if (key === 'fir' && !this.firLoaded) void this.loadFir();
      if (key === 'airways' && !this.airwaysLoaded) void this.loadAirways();
      if (key === 'radar' || key === 'clouds') void this.loadRadar();
      if (key === 'airports' || key === 'navaids') this.scheduleRefresh();
    } else if (key === 'airports' || key === 'navaids') this.onLabels(key, []);
    if (key === 'fir' && !on) this.onLabels('fir', []);
  }

  private scheduleRefresh(): void {
    clearTimeout(this.moveTimer);
    this.moveTimer = window.setTimeout(() => void this.refreshDynamic(), 250);
  }

  private bboxParam(): string {
    const b = this.map.getBounds();
    return `${b.getWest().toFixed(3)},${b.getSouth().toFixed(3)},${b.getEast().toFixed(3)},${b.getNorth().toFixed(3)}`;
  }

  private async refreshDynamic(): Promise<void> {
    if (!this.installed) return;
    const zoom = this.map.getZoom();
    if (this.visible.airports) {
      try {
        const fc = await api<GeoJSON.FeatureCollection>(`/api/airports?bbox=${this.bboxParam()}&zoom=${zoom.toFixed(1)}`);
        (this.map.getSource('airports') as GeoJSONSource | undefined)?.setData(fc);
        this.onLabels('airports', fc.features.map((f) => {
          const [lon, lat] = (f.geometry as GeoJSON.Point).coordinates;
          const p = f.properties as { label: string; type: string };
          return { lon, lat, text: p.label, color: '#7dd3fc', priority: p.type === 'large_airport' ? 3 : p.type === 'medium_airport' ? 2 : 1, minZoom: p.type === 'large_airport' ? 3 : p.type === 'medium_airport' ? 6 : 9 };
        }));
      } catch { /* ignore */ }
    }
    if (this.visible.navaids && zoom >= 6) {
      try {
        const fc = await api<GeoJSON.FeatureCollection>(`/api/layers/navaids?bbox=${this.bboxParam()}`);
        (this.map.getSource('navaids') as GeoJSONSource | undefined)?.setData(fc);
        this.onLabels('navaids', fc.features.map((f) => {
          const [lon, lat] = (f.geometry as GeoJSON.Point).coordinates;
          const p = f.properties as { ident: string; type: string; freq?: string };
          return { lon, lat, text: zoom >= 8 && p.freq ? `${p.ident} ${p.freq}` : p.ident, color: '#d8b4fe', minZoom: 7, priority: 0 };
        }));
      } catch { /* ignore */ }
    } else if (this.visible.navaids) this.onLabels('navaids', []);
  }

  private async loadFir(): Promise<void> {
    try {
      const fc = await api<GeoJSON.FeatureCollection>('/api/layers/fir');
      this.firLoaded = true;
      (this.map.getSource('fir') as GeoJSONSource | undefined)?.setData(fc);
      this.onLabels('fir', fc.features.map((f) => {
        const c = centroid(f.geometry);
        return { lon: c[0], lat: c[1], text: String((f.properties as { id: string }).id), color: '#7dd3fc', minZoom: 3.5, priority: 1 };
      }));
    } catch { /* ignore */ }
  }

  private async loadAirways(): Promise<void> {
    try {
      const fc = await api<GeoJSON.FeatureCollection>('/api/layers/airways');
      this.airwaysLoaded = true;
      (this.map.getSource('airways') as GeoJSONSource | undefined)?.setData(fc);
    } catch { /* ignore */ }
  }

  private async loadRadar(): Promise<void> {
    try {
      if (!this.radarFrames) this.radarFrames = await api<RadarFrames>('/api/layers/radar');
      const f = this.radarFrames;
      const radar = f.radar.past[f.radar.past.length - 1];
      const cloud = f.satellite.infrared[f.satellite.infrared.length - 1];
      const radarSrc = this.map.getSource('radar') as RasterTileSource | undefined;
      const cloudSrc = this.map.getSource('clouds') as RasterTileSource | undefined;
      if (radar && radarSrc) radarSrc.setTiles([`${f.host}${radar.path}/256/{z}/{x}/{y}/2/1_1.png`]);
      if (cloud && cloudSrc) cloudSrc.setTiles([`${f.host}${cloud.path}/256/{z}/{x}/{y}/0/0_0.png`]);
      this.radarIndex = f.radar.past.length - 1;
      setTimeout(() => { this.radarFrames = null; if (this.visible.radar || this.visible.clouds) void this.loadRadar(); }, 5 * 60_000);
    } catch { /* radar unavailable */ }
  }

  get radarTime(): number | null { return this.radarFrames && this.radarIndex >= 0 ? this.radarFrames.radar.past[this.radarIndex]?.time ?? null : null; }

  destroy(): void { clearInterval(this.terminatorTimer); clearTimeout(this.moveTimer); }
}

function centroid(g: GeoJSON.Geometry): [number, number] {
  const coords: number[][] = [];
  const walk = (c: unknown): void => { if (Array.isArray(c) && typeof c[0] === 'number') coords.push(c as number[]); else if (Array.isArray(c)) c.forEach(walk); };
  walk((g as GeoJSON.Polygon).coordinates);
  if (!coords.length) return [0, 0];
  // Use the largest ring's bbox centre to avoid the antimeridian pulling things to 0.
  let minX = 180, maxX = -180, minY = 90, maxY = -90;
  for (const [x, y] of coords) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  if (maxX - minX > 300) return [coords[0][0], (minY + maxY) / 2];
  return [(minX + maxX) / 2, (minY + maxY) / 2];
}

export const apiBase = API_BASE;
