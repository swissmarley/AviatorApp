import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import clsx from 'clsx';
import type { Map as MlMap } from 'maplibre-gl';
import type { AircraftState, Airport, AirportBoard, AirportWeather, BoardEntry, Runway } from '@contrail/shared';
import { formatTime } from '@contrail/shared';
import { api, getAirport, getAirportBoard, getAirportTraffic, getAirportWeather } from '@/lib/api';
import { MapView } from '@/map/MapView';
import type { LayerItem } from '@/map/AircraftLayer';
import { setLabelText } from '@/map/LabelCanvas';
import { CATEGORY_COLORS_CSS, styleFor } from '@/lib/aircraftStyle';
import { TopBar, MobileNav } from '@/components/TopBar';
import { Icon } from '@/components/Icon';
import { DelayGauge, FLIGHT_CATEGORY_COLOR, StatusBadge, Tabs, delayColor } from '@/components/AirportCommon';
import { AirportRunwayDiagram } from '@/components/AirportRunwayDiagram';
import { useSettings } from '@/state/settings';
import { useAuth } from '@/state/auth';
import { useUi } from '@/state/ui';

type Tab = 'arrivals' | 'departures' | 'ground' | 'weather' | 'runways';
interface DelaySample { ts: string; delay_index: number; avg_delay: number; cancelled: number }

export function AirportPage() {
  const { code = '' } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [info, setInfo] = useState<{ airport: Airport; runways: Runway[] } | null>(null);
  const [board, setBoard] = useState<AirportBoard | null>(null);
  const [weather, setWeather] = useState<AirportWeather | null>(null);
  const [history, setHistory] = useState<DelaySample[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('arrivals');
  const tz = useSettings((s) => s.settings.timeZone);
  const user = useAuth((s) => s.user);
  const me = useAuth((s) => s.me);
  const refresh = useAuth((s) => s.refresh);
  const notify = useUi((s) => s.notify);

  useEffect(() => {
    let cancelled = false;
    setInfo(null); setBoard(null); setWeather(null); setError(null); setHistory([]);
    getAirport(code).then((r) => { if (!cancelled) setInfo(r); }).catch((e) => { if (!cancelled) setError((e as Error).message); });
    const loadBoard = () => getAirportBoard(code).then((b) => { if (!cancelled) setBoard(b); }).catch(() => undefined);
    loadBoard();
    const id = setInterval(loadBoard, 60_000);
    getAirportWeather(code).then((w) => { if (!cancelled) setWeather(w); }).catch(() => { if (!cancelled) setWeather({ fetchedAt: new Date().toISOString() }); });
    api<{ samples: DelaySample[] }>(`/api/airports/${code}/delay-history`).then((r) => { if (!cancelled) setHistory(r.samples); }).catch(() => undefined);
    return () => { cancelled = true; clearInterval(id); };
  }, [code]);

  const ap = info?.airport;
  const bookmarked = me?.bookmarks.some((b) => b.kind === 'airport' && b.data.icao === (ap?.icao ?? ap?.ident));
  const bookmark = async () => {
    if (!ap) return;
    if (!user) { notify('Sign in to bookmark airports'); navigate('/account'); return; }
    try {
      await api('/api/me/bookmarks', { method: 'POST', body: JSON.stringify({ kind: 'airport', label: `${ap.iata ?? ap.icao ?? ap.ident} · ${ap.name}`, data: { icao: ap.icao ?? ap.ident, lat: ap.lat, lon: ap.lon } }) });
      await refresh();
      notify('Airport bookmarked', 'success');
    } catch (e) { notify((e as Error).message, 'error'); }
  };

  if (error) {
    return (
      <div className="h-full overflow-auto"><TopBar />
        <div className="pt-20 px-4 max-w-3xl mx-auto"><div className="panel p-6 text-center text-slate-300">Airport “{code.toUpperCase()}” not found. <Link to="/disruptions" className="text-accent-2 underline">Browse airports</Link></div></div>
        <MobileNav />
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto scroll-thin">
      <TopBar />
      <main className="pt-16 md:pt-20 pb-24 md:pb-10 px-3 md:px-6 max-w-6xl mx-auto space-y-4">
        {!ap ? <div className="panel h-28 animate-pulse" /> : (
          <section className="panel p-4 flex flex-col md:flex-row md:items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold leading-tight">{ap.name}</h1>
                {ap.iata && <span className="chip font-mono text-sm bg-accent text-ink border-accent">{ap.iata}</span>}
                {ap.icao && <span className="chip font-mono text-sm">{ap.icao}</span>}
                {ap.ident !== ap.icao && <span className="chip font-mono">{ap.ident}</span>}
              </div>
              <div className="text-sm text-slate-400 mt-1 flex flex-wrap gap-x-3 gap-y-1">
                <span>{[ap.municipality, ap.region, ap.country].filter(Boolean).join(', ')}</span>
                {ap.elevationFt !== undefined && <span>Elevation {ap.elevationFt.toLocaleString()} ft</span>}
                <span className="capitalize">{ap.type.replace('_', ' ')}</span>
                <span className="font-mono">{ap.lat.toFixed(4)}, {ap.lon.toFixed(4)}</span>
                {ap.wikipedia && <a href={ap.wikipedia} target="_blank" rel="noreferrer" className="text-accent-2 hover:underline inline-flex items-center gap-1">Wikipedia <Icon name="external" size={12} /></a>}
                {ap.home && <a href={ap.home} target="_blank" rel="noreferrer" className="text-accent-2 hover:underline inline-flex items-center gap-1">Website <Icon name="external" size={12} /></a>}
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <button className="btn" onClick={() => navigate(`/#map=11/${ap.lat.toFixed(4)}/${ap.lon.toFixed(4)}`)}><Icon name="plane" size={16} />Show on map</button>
              <button className={clsx('btn', bookmarked && 'text-accent')} onClick={bookmark}><Icon name="bookmark" size={16} />{bookmarked ? 'Saved' : 'Bookmark'}</button>
            </div>
          </section>
        )}

        <section className="grid md:grid-cols-3 gap-4">
          <div className="panel">
            {board ? <DelayGauge index={board.delayIndex} avgDelayMin={board.avgDelayMin} cancelled={board.cancelled} /> : <div className="h-24 animate-pulse" />}
            {history.length > 1 && <DelaySparkline samples={history} />}
            {board && <div className="px-3 pb-3 text-[11px] text-slate-500">Schedule source: {board.source} · updated {formatTime(board.generatedAt, tz)}</div>}
          </div>
          <div className="md:col-span-2">
            {ap && <TrafficMap airport={ap} />}
          </div>
        </section>

        <section className="panel">
          <Tabs<Tab> value={tab} onChange={setTab} tabs={[
            { key: 'arrivals', label: 'Arrivals', count: board?.arrivals.length },
            { key: 'departures', label: 'Departures', count: board?.departures.length },
            { key: 'ground', label: 'On ground', count: board?.onGround.length },
            { key: 'weather', label: 'Weather' },
            { key: 'runways', label: 'Runways', count: info?.runways.length },
          ]} />
          <div className="p-3">
            {(tab === 'arrivals' || tab === 'departures') && (board ? <Board entries={tab === 'arrivals' ? board.arrivals : board.departures} dir={tab} tz={tz} /> : <div className="h-32 animate-pulse" />)}
            {tab === 'ground' && (board ? <OnGround list={board.onGround} /> : <div className="h-32 animate-pulse" />)}
            {tab === 'weather' && <Weather weather={weather} />}
            {tab === 'runways' && info && ap && <Runways runways={info.runways} airport={ap} />}
          </div>
        </section>
      </main>
      <MobileNav />
    </div>
  );
}

function DelaySparkline({ samples }: { samples: DelaySample[] }) {
  const w = 240, h = 40;
  const pts = samples.map((s, i) => `${(i / (samples.length - 1)) * w},${h - (Math.min(10, s.delay_index) / 10) * h}`).join(' ');
  return (
    <div className="px-3 pb-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">Delay index · last 48 h</div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-10" role="img" aria-label="Delay index history">
        <polyline points={pts} fill="none" stroke={delayColor(samples[samples.length - 1].delay_index)} strokeWidth={2} strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function TrafficMap({ airport }: { airport: Airport }) {
  const [items, setItems] = useState<LayerItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const navigate = useNavigate();
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { aircraft } = await getAirportTraffic(airport.icao ?? airport.ident);
        if (cancelled) return;
        const now = performance.now();
        setItems(aircraft.map((a: AircraftState) => {
          const st = styleFor(a, false);
          setLabelText(a.hex, a.callsign ?? a.reg);
          const p: [number, number, number, number] = [a.lat, a.lon, a.track ?? a.heading ?? 0, a.altBaro ?? 0];
          return { hex: a.hex, p0: p, p1: p, t0: now, t1: now + 1, kind: st.kind, color: st.color, scale: st.scale, highlight: st.highlight };
        }));
      } catch { /* ignore */ }
    };
    void load();
    const id = setInterval(load, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, [airport]);
  const onReady = useCallback((map: MlMap) => { mapRef.current = map; map.jumpTo({ center: [airport.lon, airport.lat], zoom: 11 }); }, [airport]);
  useEffect(() => { mapRef.current?.jumpTo({ center: [airport.lon, airport.lat], zoom: 11 }); }, [airport]);
  return (
    <div className="relative h-72 rounded-xl overflow-hidden border border-line">
      <MapView mode="playback" items={items} selectedHex={selected} onSelect={(h) => { setSelected(h); if (h) navigate(`/flight/${h}`); }} onMapReady={onReady} className="absolute inset-0" />
      <div className="absolute top-2 left-2 panel px-2 py-1 text-[11px] text-slate-300 pointer-events-none">Live traffic within 40 km · {items.length} aircraft</div>
    </div>
  );
}

function Board({ entries, dir, tz }: { entries: BoardEntry[]; dir: 'arrivals' | 'departures'; tz: string }) {
  if (!entries.length) return <div className="text-sm text-slate-500 py-6 text-center">No {dir} in the current window.</div>;
  return (
    <div className="overflow-x-auto scroll-thin">
      <table className="w-full text-sm">
        <thead className="text-[11px] uppercase tracking-wide text-slate-400 text-left">
          <tr><th className="py-1.5 pr-3">Sched</th><th className="pr-3">Est</th><th className="pr-3">Actual</th><th className="pr-3">Flight</th><th className="pr-3">{dir === 'arrivals' ? 'From' : 'To'}</th><th className="pr-3">Term</th><th className="pr-3">Gate</th><th className="pr-3">Status</th><th className="pr-3">Aircraft</th><th /></tr>
        </thead>
        <tbody>
          {entries.map((e, i) => (
            <tr key={`${e.flightNo ?? e.callsign ?? i}-${i}`} className="border-t border-line/60 hover:bg-ink-3/50">
              <td className="py-1.5 pr-3 font-mono tabular-nums">{formatTime(e.scheduled, tz)}</td>
              <td className="pr-3 font-mono tabular-nums text-slate-300">{formatTime(e.estimated ?? e.scheduled, tz)}</td>
              <td className="pr-3 font-mono tabular-nums text-slate-300">{formatTime(e.actual, tz)}</td>
              <td className="pr-3">
                <div className="flex items-center gap-2">
                  {e.airlineIcao && <img src={`/api/airlines/${e.airlineIcao}/logo.svg`} alt="" className="w-8 h-4 rounded object-cover" />}
                  <div><div className="font-mono font-semibold">{e.flightNo ?? e.callsign ?? '—'}</div><div className="text-[11px] text-slate-400 truncate max-w-[10rem]">{e.airline ?? e.callsign ?? ''}</div></div>
                </div>
              </td>
              <td className="pr-3">
                {e.counterpart.icao ? <Link to={`/airport/${e.counterpart.icao}`} className="hover:text-accent-2"><span className="font-mono font-semibold">{e.counterpart.iata ?? e.counterpart.icao}</span><div className="text-[11px] text-slate-400 truncate max-w-[10rem]">{e.counterpart.name ?? ''}</div></Link> : '—'}
              </td>
              <td className="pr-3 font-mono">{e.terminal ?? '—'}</td>
              <td className="pr-3 font-mono">{e.gate ?? '—'}</td>
              <td className="pr-3"><StatusBadge status={e.status} delayMin={e.delayMin} /></td>
              <td className="pr-3 text-xs text-slate-300"><span className="font-mono">{e.aircraftType ?? ''}</span>{e.reg ? <span className="text-slate-400"> {e.reg}</span> : ''}</td>
              <td>{e.hex && <Link to={`/flight/${e.hex}`} className="btn btn-ghost text-xs py-1" title="Track live"><Icon name="plane" size={14} />Track</Link>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OnGround({ list }: { list: AirportBoard['onGround'] }) {
  if (!list.length) return <div className="text-sm text-slate-500 py-6 text-center">No aircraft currently reported on the ground.</div>;
  return (
    <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
      {list.map((a) => (
        <li key={a.hex}>
          <Link to={`/flight/${a.hex}`} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-ink-3/60 hover:bg-ink-3">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: CATEGORY_COLORS_CSS[a.category] ?? '#94a3b8' }} />
            <span className="font-mono font-semibold">{a.callsign ?? a.reg ?? a.hex.toUpperCase()}</span>
            <span className="text-xs text-slate-400 truncate">{[a.type, a.reg, a.category].filter(Boolean).join(' · ')}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Weather({ weather }: { weather: AirportWeather | null }) {
  if (!weather) return <div className="h-24 animate-pulse" />;
  const m = weather.metar;
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div>
        <div className="text-[11px] uppercase tracking-wide text-slate-400 mb-2">METAR</div>
        {!m ? <div className="text-sm text-slate-500">METAR unavailable (aviationweather.gov not reachable or no report for this station).</div> : (
          <>
            <div className="flex items-center gap-2 mb-2">
              {m.flightCategory && <span className="chip font-semibold" style={{ borderColor: FLIGHT_CATEGORY_COLOR[m.flightCategory], color: FLIGHT_CATEGORY_COLOR[m.flightCategory] }}>{m.flightCategory}</span>}
              <span className="text-xs text-slate-400">Observed {formatTime(m.observed, 'utc')}</span>
            </div>
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="kv"><dt>Wind</dt><dd>{m.windDirDeg !== undefined ? `${String(m.windDirDeg).padStart(3, '0')}°` : 'VRB'} {m.windSpeedKt ?? 0} kt{m.windGustKt ? ` G${m.windGustKt}` : ''}</dd></div>
              <div className="kv"><dt>Visibility</dt><dd>{m.visibilityMi !== undefined ? `${m.visibilityMi} mi` : '—'}</dd></div>
              <div className="kv"><dt>Temp / Dew</dt><dd>{m.tempC ?? '—'}° / {m.dewpointC ?? '—'}°C</dd></div>
              <div className="kv"><dt>Altimeter</dt><dd>{m.altimeterInHg !== undefined ? `${m.altimeterInHg.toFixed(2)} inHg` : '—'}</dd></div>
              <div className="kv"><dt>Weather</dt><dd>{m.wx ?? 'None'}</dd></div>
              <div className="kv col-span-2 sm:col-span-3"><dt>Clouds</dt><dd>{m.clouds?.length ? m.clouds.map((c) => `${c.cover}${c.baseFt ? ` ${c.baseFt.toLocaleString()} ft` : ''}`).join(', ') : 'Clear'}</dd></div>
            </dl>
            <pre className="mt-3 text-xs font-mono whitespace-pre-wrap bg-ink rounded-lg p-2 border border-line text-slate-300">{m.raw}</pre>
          </>
        )}
      </div>
      <div>
        <div className="text-[11px] uppercase tracking-wide text-slate-400 mb-2">TAF</div>
        {!weather.taf ? <div className="text-sm text-slate-500">TAF unavailable.</div> : (
          <>
            <div className="text-xs text-slate-400 mb-2">Issued {formatTime(weather.taf.issued, 'utc')} · valid {formatTime(weather.taf.validFrom, 'utc')} – {formatTime(weather.taf.validTo, 'utc')}</div>
            <pre className="text-xs font-mono whitespace-pre-wrap bg-ink rounded-lg p-2 border border-line text-slate-300">{weather.taf.raw}</pre>
          </>
        )}
        <div className="text-[10px] text-slate-500 mt-3">Weather data: aviationweather.gov · fetched {formatTime(weather.fetchedAt, 'utc')}</div>
      </div>
    </div>
  );
}

function Runways({ runways, airport }: { runways: Runway[]; airport: Airport }) {
  const rows = useMemo(() => runways.filter((r) => !r.closed), [runways]);
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="overflow-x-auto scroll-thin">
        {!rows.length ? <div className="text-sm text-slate-500 py-6">No runway data.</div> : (
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-slate-400 text-left"><tr><th className="py-1.5 pr-3">Runway</th><th className="pr-3">Length</th><th className="pr-3">Width</th><th className="pr-3">Surface</th><th className="pr-3">Lighted</th><th>Headings</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-line/60">
                  <td className="py-1.5 pr-3 font-mono font-semibold">{r.leIdent ?? '?'}/{r.heIdent ?? '?'}</td>
                  <td className="pr-3 font-mono">{r.lengthFt ? `${r.lengthFt.toLocaleString()} ft` : '—'}<div className="text-[10px] text-slate-400">{r.lengthFt ? `${Math.round(r.lengthFt * 0.3048).toLocaleString()} m` : ''}</div></td>
                  <td className="pr-3 font-mono">{r.widthFt ? `${r.widthFt} ft` : '—'}<div className="text-[10px] text-slate-400">{r.widthFt ? `${Math.round(r.widthFt * 0.3048)} m` : ''}</div></td>
                  <td className="pr-3">{r.surface ?? '—'}</td>
                  <td className="pr-3">{r.lighted ? <Icon name="check" size={14} className="text-emerald-400" /> : '—'}</td>
                  <td className="font-mono text-xs">{r.leHeading !== undefined ? `${Math.round(r.leHeading)}°` : '—'} / {r.heHeading !== undefined ? `${Math.round(r.heHeading)}°` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <AirportRunwayDiagram runways={rows} centerLat={airport.lat} centerLon={airport.lon} />
    </div>
  );
}
