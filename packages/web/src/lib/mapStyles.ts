import type { StyleSpecification } from 'maplibre-gl';
import type { UserSettings } from '@contrail/shared';

export type MapStyleKey = UserSettings['mapStyle'];

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY;

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
 * Basemap styles. Without a MapTiler key we use freely available raster tiles:
 * CARTO (dark/light, OSM data), Esri World Imagery (satellite) and OpenTopoMap (terrain).
 * All require attribution, which the map control shows. With VITE_MAPTILER_KEY set, dark/light
 * switch to MapTiler vector styles with labels in the user's locale.
 */
export function styleFor(key: MapStyleKey): StyleSpecification | string {
  switch (key) {
    case 'light':
      if (MAPTILER_KEY) return `https://api.maptiler.com/maps/dataviz-light/style.json?key=${MAPTILER_KEY}`;
      return raster('light', ['https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', 'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', 'https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'], '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>', 19, '#e8ecf1');
    case 'satellite':
      if (MAPTILER_KEY) return `https://api.maptiler.com/maps/hybrid/style.json?key=${MAPTILER_KEY}`;
      return raster('satellite', ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], 'Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community', 18, '#000');
    case 'terrain':
      if (MAPTILER_KEY) return `https://api.maptiler.com/maps/outdoor-v2/style.json?key=${MAPTILER_KEY}`;
      return raster('terrain', ['https://a.tile.opentopomap.org/{z}/{x}/{y}.png', 'https://b.tile.opentopomap.org/{z}/{x}/{y}.png', 'https://c.tile.opentopomap.org/{z}/{x}/{y}.png'], '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM | © <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)', 17, '#dfe6d8');
    case 'dark':
    default:
      if (MAPTILER_KEY) return `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${MAPTILER_KEY}`;
      return raster('dark', ['https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', 'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', 'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'], '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>', 19, '#0b1220');
  }
}

export const MAP_STYLES: { key: MapStyleKey; label: string }[] = [
  { key: 'dark', label: 'Dark' },
  { key: 'light', label: 'Light' },
  { key: 'satellite', label: 'Satellite' },
  { key: 'terrain', label: 'Terrain' },
];

export function isLightStyle(key: MapStyleKey): boolean { return key === 'light' || key === 'terrain'; }
