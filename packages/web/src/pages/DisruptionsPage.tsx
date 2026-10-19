import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import maplibregl, { type GeoJSONSource, type Map as MlMap } from 'maplibre-gl';
import clsx from 'clsx';
import type { Airport, DelaySeverity } from '@contrail/shared';
import { api, getDisruptions } from '@/lib/api';
import { styleFor } from '@/lib/mapStyles';
import { readMapPos } from '@/lib/url';
import { useSettings } from '@/state/settings';
import { TopBar, MobileNav } from '@/components/TopBar';
import { Icon } from '@/components/Icon';
import { delayColor, delayLabel } from '@/components/AirportCommon';

const LEGEND = [[0, 'Normal'], [2, 'Minor'], [5, 'Significant'], [8, 'Severe']] as const;

export function DisruptionsPage() {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [data, setData] = useState<{ generatedAt: string; airports: DelaySeverity[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Airport[]>([]);
  const [listOpen, setListOpen] = useState(false);
  const navigate = useNavigate();
  const mapStyle = useSettings((s) => s.settings.mapStyle);
  const navRef = useRef(navigate);
  navRef.current = navigate;

  useEffect(() => {
    let cancelled = false;
    const load = () => getDisruptions().then((d) => { if (!cancelled) { setData(d); setError(null); } }).catch((e) => { if (!cancelled) setError((e as Error).message); });
    load();
    const id = setInterval(load, 5 * 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    const id = setTimeout(() => api<{ results: Airport[] }>(`/api/airports/search?q=${encodeURIComponent(q.trim())}&limit=8`).then((r) => setResults(r.results)).catch(() => setResults([])), 200);
    return () => clearTimeout(id);
  }, [q]);

  // map
  useEffect(() => {
    if (!container.current) return;
    const initial = readMapPos() ?? { zoom: 2.2, lat: 30, lon: 10 };
    const map = new maplibregl.Map({ container: container.current, style: styleFor(useSettings.getState().settings.mapStyle), center: [initial.lon, initial.lat], zoom: initial.zoom, attributionControl: { compact: true } });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10 });
    const install = () => {
      if (map.getSource('disruptions')) return;
      map.addSource('disruptions', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'disruptions-glow', type: 'circle', source: 'disruptions',
        paint: { 'circle-radius': ['+', 8, ['*', 0.08, ['get', 'sampled']]], 'circle-color': ['get', 'color'], 'circle-opacity': 0.18, 'circle-blur': 0.6 },
      });
      map.addLayer({
        id: 'disruptions', type: 'circle', source: 'disruptions',
        paint: { 'circle-radius': ['interpolate', ['linear'], ['get', 'sampled'], 0, 5, 50, 9, 200, 14], 'circle-color': ['get', 'color'], 'circle-stroke-color': '#0b1220', 'circle-stroke-width': 1.5, 'circle-opacity': 0.9 },
      });
      map.on('mousemove', 'disruptions', (e) => {
        const f = e.features?.[0]; if (!f) return;
        map.getCanvas().style.cursor = 'pointer';
        const p = f.properties as { name: string; icao: string; iata?: string; delayIndex: number; avgDelayMin: number; cancelled: number; sampled: number };
        popup.setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number]).setHTML(
          `<div class="font-semibold">${p.iata ?? p.icao} · ${p.name}</div><div style="color:${delayColor(p.delayIndex)}">${delayLabel(p.delayIndex)} · index ${Number(p.delayIndex).toFixed(1)}</div><div class="text-slate-300">Avg delay ${p.avgDelayMin} min · ${p.cancelled} cancelled · ${p.sampled} flights</div>`,
        ).addTo(map);
      });
      map.on('mouseleave', 'disruptions', () => { map.getCanvas().style.cursor = ''; popup.remove(); });
      map.on('click', 'disruptions', (e) => { const p = e.features?.[0]?.properties as { icao?: string } | undefined; if (p?.icao) navRef.current(`/airport/${p.icao}`); });
      pushData();
    };
    const pushData = () => {
      const src = map.getSource('disruptions') as GeoJSONSource | undefined;
      if (!src || !dataRef.current) return;
      src.setData({ type: 'FeatureCollection', features: dataRef.current.airports.map((a) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [a.lon, a.lat] }, properties: { ...a, color: delayColor(a.delayIndex) } })) });
    };
    map.on('style.load', install);
    mapRef.current = map;
    pushRef.current = pushData;
    return () => { map.remove(); mapRef.current = null; };
  }, []);
  const dataRef = useRef(data); dataRef.current = data;
  const pushRef = useRef<() => void>(() => undefined);
  useEffect(() => { pushRef.current(); }, [data]);
  const firstStyle = useRef(true);
  useEffect(() => { if (firstStyle.current) { firstStyle.current = false; return; } mapRef.current?.setStyle(styleFor(mapStyle), { diff: false }); }, [mapStyle]);

  const ranked = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return (data?.airports ?? []).filter((a) => !f || a.name.toLowerCase().includes(f) || a.icao.toLowerCase().includes(f) || a.iata?.toLowerCase().includes(f)).sort((a, b) => b.delayIndex - a.delayIndex || b.sampled - a.sampled);
  }, [data, filter]);
  const flyTo = (a: DelaySeverity) => mapRef.current?.flyTo({ center: [a.lon, a.lat], zoom: 6 });

  const panel = (
    <div className="flex flex-col h-full text-sm">
      <div className="p-3 border-b border-line space-y-2">
        <div className="font-semibold flex items-center justify-between">Airport disruptions {data && <span className="text-[11px] font-normal text-slate-400">Updated {new Date(data.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}</div>
        <div className="relative">
          <input className="input" placeholder="Find any airport (name, IATA, ICAO)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Airport search" />
          {results.length > 0 && (
            <ul className="absolute z-10 inset-x-0 top-full mt-1 panel p-1 max-h-60 overflow-auto scroll-thin">
              {results.map((a) => <li key={a.ident}><button className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-ink-3 flex gap-2 items-center" onClick={() => navigate(`/airport/${a.icao ?? a.iata ?? a.ident}`)}><span className="chip font-mono w-14 justify-center">{a.iata ?? a.icao ?? a.ident}</span><span className="truncate">{a.name}<span className="text-slate-400 text-xs"> · {a.municipality ?? a.country}</span></span></button></li>)}
            </ul>
          )}
        </div>
        <input className="input" placeholder="Filter ranked list" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter list" />
        <div className="flex flex-wrap gap-2 text-[10px] text-slate-300">{LEGEND.map(([v, l]) => <span key={l} className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-full" style={{ background: delayColor(v + 0.1) }} />{l}</span>)}<span className="text-slate-500">· size = flights sampled</span></div>
      </div>
      <div className="flex-1 overflow-auto scroll-thin p-1">
        {error && <div className="text-xs text-red-300 p-3">{error}</div>}
        {!data && !error && <div className="text-xs text-slate-400 p-3">Sampling airport boards… this takes a few seconds on first load.</div>}
        {data && !ranked.length && <div className="text-xs text-slate-400 p-3">No airports match.</div>}
        <ol>
          {ranked.map((a, i) => (
            <li key={a.icao} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-ink-3 cursor-pointer" onMouseEnter={() => flyTo(a)} onClick={() => navigate(`/airport/${a.icao}`)}>
              <span className="w-5 text-right text-[11px] text-slate-500 font-mono">{i + 1}</span>
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: delayColor(a.delayIndex) }} />
              <span className="chip font-mono w-12 justify-center shrink-0">{a.iata ?? a.icao}</span>
              <span className="flex-1 min-w-0 truncate">{a.name}</span>
              <span className="font-mono tabular-nums text-xs" style={{ color: delayColor(a.delayIndex) }}>{a.delayIndex.toFixed(1)}</span>
              <span className="text-[10px] text-slate-400 w-14 text-right">{a.avgDelayMin}m avg</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );

  return (
    <div className="h-full w-full relative">
      <div className="absolute inset-0"><div ref={container} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} /></div>
      <TopBar />
      <aside className="hidden md:flex absolute left-3 top-[4.25rem] bottom-8 w-[380px] z-30 panel overflow-hidden flex-col">{panel}</aside>
      <div className={clsx('md:hidden fixed inset-x-0 bottom-14 z-30 panel rounded-b-none border-b-0 flex flex-col transition-[height]', listOpen ? 'h-[70vh]' : 'h-14')}>
        <button className="flex items-center justify-between px-4 h-14 shrink-0" onClick={() => setListOpen(!listOpen)} aria-expanded={listOpen}>
          <span className="font-semibold text-sm">Airports ranked by delay</span><Icon name={listOpen ? 'chevronDown' : 'chevronUp'} />
        </button>
        {listOpen && <div className="flex-1 min-h-0">{panel}</div>}
      </div>
      <MobileNav />
    </div>
  );
}
