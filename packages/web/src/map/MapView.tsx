import { useEffect, useRef } from 'react';
import maplibregl, { type Map as MlMap, type MapMouseEvent } from 'maplibre-gl';
import type { UserSettings } from '@contrail/shared';
import { AircraftLayer, type LayerItem } from './AircraftLayer';
import { LabelCanvas, setLabelText, resetLabels, type PointLabel } from './LabelCanvas';
import { Overlays } from './overlays';
import { ensureTrailLayers, setTrail, trailGeoJson } from './trail';
import { styleFor as mapStyleFor, isLightStyle } from '@/lib/mapStyles';
import { styleFor as aircraftStyleFor } from '@/lib/aircraftStyle';
import { readMapPos, writeMapPos } from '@/lib/url';
import { live } from '@/lib/ws';
import { useAircraft } from '@/state/aircraft';
import { useSettings, type LayerKey } from '@/state/settings';
import { matchesFilter, isFilterActive, useFilters } from '@/state/filters';
import { useUi } from '@/state/ui';

export interface MapViewProps {
  mode: 'live' | 'playback';
  selectedHex: string | null;
  onSelect: (hex: string | null) => void;
  /** playback mode: items prepared by the page */
  items?: LayerItem[];
  /** playback mode: trail for the selected aircraft */
  trail?: { lat: number; lon: number; alt?: number; ts: number }[];
  onMapReady?: (map: MlMap, layer: AircraftLayer) => void;
  className?: string;
  interactiveLabels?: boolean;
}

/** Shared map used by the live page and playback. Owns the MapLibre instance, aircraft layer, trail and overlays. */
export function MapView(props: MapViewProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const layerRef = useRef<AircraftLayer | null>(null);
  const labelsRef = useRef<LabelCanvas | null>(null);
  const overlaysRef = useRef<Overlays | null>(null);
  const labelSets = useRef<Record<string, PointLabel[]>>({});
  const propsRef = useRef(props);
  propsRef.current = props;

  const mapStyle = useSettings((s) => s.settings.mapStyle);
  const iconSize = useSettings((s) => s.settings.iconSize);
  const trailLength = useSettings((s) => s.settings.trailLength);
  const layers = useSettings((s) => s.layers);
  const filter = useFilters((s) => s.active);
  const follow = useUi((s) => s.follow);

  // --- create map once
  useEffect(() => {
    if (!container.current) return;
    const initial = readMapPos() ?? { zoom: 4.2, lat: 48, lon: 8 };
    const map = new maplibregl.Map({
      container: container.current,
      style: mapStyleFor(useSettings.getState().settings.mapStyle),
      center: [initial.lon, initial.lat],
      zoom: initial.zoom,
      bearing: initial.bearing ?? 0,
      pitch: initial.pitch ?? 0,
      attributionControl: { compact: true },
      maxPitch: 60,
      fadeDuration: 0,
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'nautical' }), 'bottom-left');
    map.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: false }), 'bottom-right');
    const layer = new AircraftLayer();
    layer.sizePx = 26 * useSettings.getState().settings.iconSize;
    const overlays = new Overlays(map, useSettings.getState().layers);
    overlays.onLabels = (key, labels) => { labelSets.current[key] = labels; pushStaticLabels(); };
    const pushStaticLabels = () => labelsRef.current?.setStaticLabels(Object.values(labelSets.current).flat());

    let readyFired = false;
    const installAll = () => {
      if (!map.getLayer('aircraft')) map.addLayer(layer);
      ensureTrailLayers(map, 'aircraft');
      overlays.install('trail-casing');
      if (!labelsRef.current) {
        labelsRef.current = new LabelCanvas(map, layer);
        labelsRef.current.showAircraftLabels = useSettings.getState().layers.labels;
      }
      labelsRef.current.light = isLightStyle(useSettings.getState().settings.mapStyle);
      pushStaticLabels();
      if (!readyFired) { readyFired = true; propsRef.current.onMapReady?.(map, layer); }
      sendView();
    };
    map.on('style.load', installAll);

    let viewTimer = 0;
    function sendView() {
      if (propsRef.current.mode !== 'live') return;
      const b = map.getBounds();
      live.setView([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], map.getZoom());
    }
    sendView();
    map.on('moveend', () => {
      const c = map.getCenter();
      writeMapPos({ zoom: map.getZoom(), lat: c.lat, lon: c.lng, bearing: map.getBearing(), pitch: map.getPitch() });
      clearTimeout(viewTimer);
      viewTimer = window.setTimeout(sendView, 150);
    });
    map.on('click', (e: MapMouseEvent) => {
      const hit = layer.pick(e.point.x, e.point.y, 18);
      if (hit) propsRef.current.onSelect(hit);
      else {
        const f = map.queryRenderedFeatures(e.point, { layers: ['airports'].filter((id) => map.getLayer(id)) });
        if (f.length) {
          const p = f[0].properties as { icao?: string; iata?: string; ident: string };
          window.dispatchEvent(new CustomEvent('contrail:airport', { detail: p.icao ?? p.iata ?? p.ident }));
        } else propsRef.current.onSelect(null);
      }
    });
    map.on('mousemove', (e: MapMouseEvent) => {
      const hit = layer.pick(e.point.x, e.point.y, 12);
      map.getCanvas().style.cursor = hit ? 'pointer' : '';
    });
    map.on('dragstart', () => useUi.getState().setFollow(false));

    mapRef.current = map;
    layerRef.current = layer;
    overlaysRef.current = overlays;
    if (import.meta.env.DEV) (window as unknown as { __contrail?: unknown }).__contrail = { map, layer, overlays, store: useAircraft, live };
    map.on('error', (e) => { if (!/tile|Failed to fetch/i.test(String(e.error?.message))) console.warn('map error', e.error?.message); });
    return () => {
      labelsRef.current?.destroy();
      overlays.destroy();
      map.remove();
      mapRef.current = null; layerRef.current = null; labelsRef.current = null; overlaysRef.current = null;
      resetLabels();
    };
  }, []);

  // --- style switching
  const firstStyle = useRef(true);
  useEffect(() => {
    if (firstStyle.current) { firstStyle.current = false; return; }
    mapRef.current?.setStyle(mapStyleFor(mapStyle), { diff: false });
  }, [mapStyle]);

  // --- overlay visibility
  useEffect(() => {
    for (const k of Object.keys(layers) as LayerKey[]) overlaysRef.current?.setVisible(k, layers[k]);
    if (labelsRef.current) labelsRef.current.showAircraftLabels = layers.labels;
  }, [layers]);

  useEffect(() => { if (layerRef.current) { layerRef.current.sizePx = 26 * iconSize; mapRef.current?.triggerRepaint(); } }, [iconSize]);

  // --- live data → layer items
  const version = useAircraft((s) => s.version);
  useEffect(() => {
    if (props.mode !== 'live') return;
    const layer = layerRef.current;
    if (!layer) return;
    const { aircraft } = useAircraft.getState();
    const active = isFilterActive(filter);
    const items: LayerItem[] = [];
    for (const a of aircraft.values()) {
      const s = a.state;
      const selected = s.hex === props.selectedHex;
      if (active && !selected && !matchesFilter(s, filter)) continue;
      const st = aircraftStyleFor(s, selected);
      items.push({ hex: s.hex, p0: a.p0, p1: a.p1, t0: a.t0, t1: a.t1, kind: st.kind, color: st.color, scale: st.scale, highlight: st.highlight });
      setLabelText(s.hex, s.callsign ?? s.reg ?? (s.onGround ? undefined : s.hex.toUpperCase()));
    }
    layer.setItems(items);
  }, [version, filter, props.selectedHex, props.mode]);

  // --- playback items
  useEffect(() => {
    if (props.mode !== 'playback' || !layerRef.current || !props.items) return;
    layerRef.current.setItems(props.items);
  }, [props.items, props.mode]);

  // --- keep the selected aircraft visible above the mobile bottom sheet
  useEffect(() => {
    const map = mapRef.current, layer = layerRef.current;
    if (!map) return;
    const mobile = window.matchMedia('(max-width: 767px)').matches;
    const bottom = props.selectedHex && mobile ? Math.round(window.innerHeight * 0.5) : 0;
    const left = props.selectedHex && !mobile && props.mode === 'live' ? 400 : 0;
    map.setPadding({ top: 0, right: 0, bottom, left });
    if (props.selectedHex && layer) {
      const retry = (n: number) => {
        const p = layer.interpolated(props.selectedHex!);
        if (p) map.easeTo({ center: [p[1], p[0]], duration: 500 });
        else if (n > 0) setTimeout(() => retry(n - 1), 400);
      };
      retry(8);
    }
  }, [props.selectedHex, props.mode]);

  // --- selection: subscribe to server trail, keep trail drawn with live head, follow
  const selectedTrail = useAircraft((s) => s.selectedTrail);
  useEffect(() => {
    if (props.mode === 'live') live.select(props.selectedHex);
  }, [props.selectedHex, props.mode]);

  useEffect(() => {
    const map = mapRef.current, layer = layerRef.current;
    if (!map || !layer) return;
    const hex = props.selectedHex;
    if (!hex) { setTrail(map, { type: 'FeatureCollection', features: [] }); return; }
    const tick = () => {
      if (!map.getSource('trail')) return;
      const head = layer.interpolated(hex);
      const pts = props.mode === 'live' ? selectedTrail : (props.trail ?? []);
      setTrail(map, trailGeoJson(pts, head ? [head[0], head[1], head[3]] : null, trailLength));
      if (useUi.getState().follow && head) map.easeTo({ center: [head[1], head[0]], duration: 240, easing: (t) => t });
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => clearInterval(id);
  }, [props.selectedHex, selectedTrail, props.trail, props.mode, trailLength, follow]);

  return (
    <div className={props.className ?? 'absolute inset-0'}>
      <div ref={container} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
    </div>
  );
}

export type { UserSettings };
