import type { StyleSpecification } from 'maplibre-gl';
import type { UserSettings } from '@contrail/shared';

export type MapStyleKey = UserSettings['mapStyle'];

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY;
/** Optional CARTO raster key: dark/light Positron styles need `?key=` since anonymous tiles show a watermark. */
const CARTO_KEY = import.meta.env.VITE_CARTO_BASEMAP_KEY;

const OSM_ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** Standard OSM raster tiles (no key). Three hosts improve parallel loading. */
function osmRasterTiles(): string[] {
  return [
    'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
    'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
    'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
  ];
}

/** CARTO Positron / Dark Matter rasters (free tier with key from carto.com/basemaps/apikey). */
function cartoDarkLightTiles(kind: 'dark_all' | 'light_all'): string[] {
  const q = CARTO_KEY ? `?key=${encodeURIComponent(CARTO_KEY)}` : '';
  const path = `rastertiles/${kind}/{z}/{x}/{y}.png${q}`;
  return [`https://a.basemaps.cartocdn.com/${path}`, `https://b.basemaps.cartocdn.com/${path}`, `https://c.basemaps.cartocdn.com/${path}`];
}

function raster(id: string, tiles: string[], attribution: string, maxzoom = 19, background = '#0b1220'): StyleSpecification {
  return {
    version: 8,
    name: id,
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources: { base: { type: 'raster', tiles, tileSize: 256, attribution, maxzoom } },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': background } },
      { id: 'base', type: 'raster', source: 'base', paint: { 'raster-fade-duration': 150 } },
    ],
  };
}

/**
 * Basemap styles.
 * - MapTiler: if `VITE_MAPTILER_KEY` is set, dark/light/satellite/terrain use MapTiler vector styles.
 * - Otherwise dark/light use OpenStreetMap rasters by default (no key). CARTO Positron/Dark Matter
 *   now require a free API key for non-watermarked tiles; set `VITE_CARTO_BASEMAP_KEY` to use them.
 * - Satellite: Esri World Imagery; terrain: OpenTopoMap — both attribution in-map.
 */
export function styleFor(key: MapStyleKey): StyleSpecification | string {
  const cartoAttr =
    `${OSM_ATTRIBUTION} © <a href="https://carto.com/attributions">CARTO</a>`;
  switch (key) {
    case 'light':
      if (MAPTILER_KEY) return `https://api.maptiler.com/maps/dataviz-light/style.json?key=${MAPTILER_KEY}`;
      if (CARTO_KEY) return raster('light', cartoDarkLightTiles('light_all'), cartoAttr, 19, '#e8ecf1');
      return raster('light', osmRasterTiles(), OSM_ATTRIBUTION, 19, '#e8ecf1');
    case 'satellite':
      if (MAPTILER_KEY) return `https://api.maptiler.com/maps/hybrid/style.json?key=${MAPTILER_KEY}`;
      return raster('satellite', ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], 'Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community', 18, '#000');
    case 'terrain':
      if (MAPTILER_KEY) return `https://api.maptiler.com/maps/outdoor-v2/style.json?key=${MAPTILER_KEY}`;
      return raster('terrain', ['https://a.tile.opentopomap.org/{z}/{x}/{y}.png', 'https://b.tile.opentopomap.org/{z}/{x}/{y}.png', 'https://c.tile.opentopomap.org/{z}/{x}/{y}.png'], '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM | © <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)', 17, '#dfe6d8');
    case 'dark':
    default:
      if (MAPTILER_KEY) return `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${MAPTILER_KEY}`;
      if (CARTO_KEY) return raster('dark', cartoDarkLightTiles('dark_all'), cartoAttr, 19, '#0b1220');
      return raster('dark', osmRasterTiles(), OSM_ATTRIBUTION, 19, '#0b1220');
  }
}

export const MAP_STYLES: { key: MapStyleKey; label: string }[] = [
  { key: 'dark', label: 'Dark' },
  { key: 'light', label: 'Light' },
  { key: 'satellite', label: 'Satellite' },
  { key: 'terrain', label: 'Terrain' },
];

export function isLightStyle(key: MapStyleKey): boolean { return key === 'light' || key === 'terrain'; }
