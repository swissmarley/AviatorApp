import type { Map as MlMap } from 'maplibre-gl';

/** Plain OSM raster tiles (no API key). Used if the default provider (CARTO, Esri, etc.) fails to load. */
const OSM_ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/**
 * If the primary `base` raster source cannot load tiles (blocked network, 403, etc.), replace it
 * with OpenStreetMap tiles so the globe is still visible without MapTiler or other keys.
 */
export function installRasterBasemapFallback(map: MlMap): void {
  let replaced = false;
  const handler = (e: { error?: { message?: string; sourceId?: string } | string | null }) => {
    if (replaced) return;
    const err = e.error;
    const msg = String(typeof err === 'object' && err && 'message' in err ? err.message : err ?? '');
    if (!/tile|fetch|load|network|status|429|403|404|timeout|Failed/i.test(msg)) return;
    const sourceId = typeof err === 'object' && err && 'sourceId' in err ? (err as { sourceId?: string }).sourceId : undefined;
    if (sourceId && sourceId !== 'base') return;

    const baseSrc = map.getSource('base');
    if (!baseSrc || baseSrc.type !== 'raster') return;

    const tiles = (baseSrc as { tiles?: string[] }).tiles;
    if (tiles?.some((u) => u.includes('openstreetmap.org'))) return;

    replaced = true;
    try {
      if (map.getLayer('base')) map.removeLayer('base');
      map.removeSource('base');
      map.addSource('base', {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: OSM_ATTRIBUTION,
        maxzoom: 19,
      });
      /** Insert directly above `background` so overlays and aircraft stay on top. */
      const firstAboveBg = (map.getStyle().layers ?? []).find((l) => l.id !== 'background');
      map.addLayer(
        { id: 'base', type: 'raster', source: 'base', paint: { 'raster-fade-duration': 150 } },
        firstAboveBg?.id,
      );
    } catch (err) {
      replaced = false;
      console.warn('basemap fallback to OSM failed', err);
    }
  };
  map.on('error', handler);
}
