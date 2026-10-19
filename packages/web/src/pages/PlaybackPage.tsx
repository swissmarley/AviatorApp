import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Map as MlMap } from 'maplibre-gl';
import clsx from 'clsx';
import { formatAltitude, formatSpeed, formatHeading } from '@contrail/shared';
import { MapView } from '@/map/MapView';
import type { LayerItem } from '@/map/AircraftLayer';
import { TopBar, MobileNav } from '@/components/TopBar';
import { Icon } from '@/components/Icon';
import { ApiError, getPlayback, type PlaybackFrame } from '@/lib/api';
import { itemsAt, stateAt, trailUpTo, SPEEDS, toLocalInput } from '@/lib/playbackEngine';
import { useSettings } from '@/state/settings';

const TICK_MS = 200;
const MAX_RANGE_MS = 24 * 3600_000;

export function PlaybackPage() {
  const [params, setParams] = useSearchParams();
  const initialFrom = params.get('from') ? new Date(params.get('from')!) : new Date(Date.now() - 3600_000);
  const initialTo = params.get('to') ? new Date(params.get('to')!) : new Date();
  const [from, setFrom] = useState(toLocalInput(initialFrom));
  const [to, setTo] = useState(toLocalInput(initialTo));
  const [speed, setSpeed] = useState(Number(params.get('speed')) || 10);
  const [frames, setFrames] = useState<PlaybackFrame[]>([]);
  const [range, setRange] = useState<{ from: number; to: number; step: number } | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [items, setItems] = useState<LayerItem[]>([]);
  const [count, setCount] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [controlsOpen, setControlsOpen] = useState(true);
  const mapRef = useRef<MlMap | null>(null);
  const tRef = useRef(0);
  const settings = useSettings((s) => s.settings);

  const bboxParam = () => {
    const b = mapRef.current?.getBounds();
    return b ? `${b.getWest().toFixed(3)},${b.getSouth().toFixed(3)},${b.getEast().toFixed(3)},${b.getNorth().toFixed(3)}` : '-180,-85,180,85';
  };

  const load = useCallback(async () => {
    const f = new Date(from), tt = new Date(to);
    if (Number.isNaN(f.getTime()) || Number.isNaN(tt.getTime()) || tt <= f) { setError('Pick a valid time range (end after start).'); return; }
    if (tt.getTime() - f.getTime() > MAX_RANGE_MS) { setError('The range must be 24 hours or less.'); return; }
    setLoading(true); setError(null); setPlaying(false);
    try {
      const res = await getPlayback(bboxParam(), f.toISOString(), tt.toISOString());
      setFrames(res.frames);
      setTruncated(res.truncated);
      setRange({ from: f.getTime(), to: tt.getTime(), step: res.step });
      const start = res.frames[0]?.ts ?? f.getTime();
      tRef.current = start; setT(start);
      setParams({ from: f.toISOString(), to: tt.toISOString(), speed: String(speed) }, { replace: true });
      if (!res.frames.length) setError('No recorded positions for this area and time range.');
    } catch (e) {
      if (e instanceof ApiError && e.status === 503) setError('History requires a database: set DATABASE_URL (see README, docker-compose starts TimescaleDB) and restart the server. Positions are then recorded for playback.');
      else setError((e as Error).message);
      setFrames([]); setRange(null);
    } finally { setLoading(false); }
  }, [from, to, speed, setParams]);

  // Auto-load when deep-linked with from/to
  const autoLoaded = useRef(false);
  const onMapReady = useCallback((map: MlMap) => {
    mapRef.current = map;
    if (!autoLoaded.current && params.get('from') && params.get('to')) { autoLoaded.current = true; setTimeout(() => void load(), 300); }
  }, [load, params]);

  // Engine tick
  useEffect(() => {
    if (!frames.length || !range) return;
    const end = frames[frames.length - 1].ts;
    const id = window.setInterval(() => {
      if (playing) {
        tRef.current = Math.min(end, tRef.current + TICK_MS * speed);
        if (tRef.current >= end) setPlaying(false);
        setT(tRef.current);
      }
      const r = itemsAt(frames, tRef.current, speed, TICK_MS, selected, playing);
      setItems(r.items); setCount(r.count);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [frames, range, playing, speed, selected]);

  // Immediate refresh on scrub when paused
  useEffect(() => {
    if (!frames.length || playing) return;
    const r = itemsAt(frames, t, speed, TICK_MS, selected, false);
    setItems(r.items); setCount(r.count);
  }, [t, frames, playing, speed, selected]);

  const trail = useMemo(() => (selected && frames.length ? trailUpTo(frames, selected, t) : []), [selected, frames, t]);
  const selState = useMemo(() => (selected && frames.length ? stateAt(frames, selected, t) : null), [selected, frames, t]);

  const seek = (v: number) => { tRef.current = v; setT(v); };
  const stepFrame = (dir: 1 | -1) => {
    if (!frames.length) return;
    const i = frames.findIndex((f) => f.ts > tRef.current - (dir < 0 ? 1 : 0));
    const idx = dir > 0 ? (i < 0 ? frames.length - 1 : i) : Math.max(0, (i < 0 ? frames.length : i) - 2);
    seek(frames[Math.max(0, Math.min(frames.length - 1, idx))].ts);
  };
  const first = frames[0]?.ts ?? 0, last = frames[frames.length - 1]?.ts ?? 0;
  const fmt = (ms: number) => ({ local: new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }), utc: new Date(ms).toISOString().slice(11, 19) + 'Z' });
  const setPreset = (hours: number) => { setFrom(toLocalInput(new Date(Date.now() - hours * 3600_000))); setTo(toLocalInput(new Date())); };

  return (
    <div className="h-full w-full relative">
      <MapView mode="playback" selectedHex={selected} onSelect={setSelected} items={items} trail={trail} onMapReady={onMapReady} />
      <TopBar />

      {/* Controls */}
      <div className="absolute left-2 right-2 md:left-3 md:right-auto md:w-[420px] top-14 md:top-[4.25rem] z-30">
        <div className="panel p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-semibold flex items-center gap-2"><Icon name="clock" size={16} />Playback</span>
            <button className="icon-btn w-7 h-7" onClick={() => setControlsOpen(!controlsOpen)} aria-label="Toggle controls" title={controlsOpen ? "Collapse" : "Expand"}><Icon name={controlsOpen ? 'chevronUp' : 'chevronDown'} size={14} /></button>
          </div>
          {controlsOpen && (
            <div className="mt-2 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <label className="block"><span className="block text-[11px] uppercase tracking-wide text-slate-400 mb-1">Start</span><input type="datetime-local" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
                <label className="block"><span className="block text-[11px] uppercase tracking-wide text-slate-400 mb-1">End</span><input type="datetime-local" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></label>
              </div>
              <div className="flex flex-wrap gap-1 items-center">
                {[0.5, 1, 3, 6, 24].map((h) => <button key={h} className="chip cursor-pointer" onClick={() => setPreset(h)}>last {h < 1 ? `${h * 60} min` : `${h} h`}</button>)}
                <span className="text-[11px] text-slate-500 ml-auto">area = current map view</span>
              </div>
              <div className="flex gap-2">
                <button className="btn btn-primary flex-1 justify-center" onClick={() => void load()} disabled={loading}>{loading ? 'Loading…' : 'Load traffic for this view'}</button>
              </div>
              {error && <div className="text-xs text-amber-300 bg-amber-950/40 border border-amber-800 rounded-lg px-2 py-1.5">{error}</div>}
              {truncated && <div className="text-xs text-amber-300">Result truncated — narrow the area or time range for full detail.</div>}
            </div>
          )}

          {frames.length > 0 && range && (
            <div className="mt-3 border-t border-line pt-3 space-y-2">
              <div className="flex items-center gap-2">
                <button className="icon-btn" onClick={() => stepFrame(-1)} aria-label="Previous frame"><Icon name="back" size={16} /></button>
                <button className="icon-btn bg-accent text-ink border-accent hover:bg-yellow-400" onClick={() => { if (tRef.current >= last) seek(first); setPlaying(!playing); }} aria-label={playing ? 'Pause' : 'Play'}><Icon name={playing ? 'pause' : 'play'} size={16} /></button>
                <button className="icon-btn" onClick={() => stepFrame(1)} aria-label="Next frame"><Icon name="back" size={16} className="rotate-180" /></button>
                <div className="flex-1 min-w-0 text-right">
                  <div className="font-mono tabular-nums text-base leading-tight">{fmt(t).local}</div>
                  <div className="font-mono tabular-nums text-[11px] text-slate-400">{fmt(t).utc} · {count} aircraft · {frames.length} frames @ {range.step}s</div>
                </div>
              </div>
              <input type="range" min={first} max={last} step={1000} value={t} onChange={(e) => seek(Number(e.target.value))} className="w-full accent-amber-400" aria-label="Timeline" />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono"><span>{fmt(first).local}</span><span>{fmt(last).local}</span></div>
              <div className="flex items-center gap-1">
                <span className="text-[11px] uppercase tracking-wide text-slate-400 mr-1">Speed</span>
                {SPEEDS.map((s) => <button key={s} onClick={() => { setSpeed(s); setParams((p) => { p.set('speed', String(s)); return p; }, { replace: true }); }} className={clsx('chip cursor-pointer', speed === s && 'bg-accent text-ink border-accent')}>{s}×</button>)}
              </div>
            </div>
          )}
        </div>
      </div>

      {selected && selState && (
        <aside className="absolute right-2 md:right-3 bottom-20 md:bottom-10 z-30 panel p-3 w-64 text-sm">
          <div className="flex items-center justify-between mb-2"><span className="font-mono font-semibold">{selState.callsign ?? selState.hex.toUpperCase()}</span><button className="icon-btn w-7 h-7" onClick={() => setSelected(null)} aria-label="Close"><Icon name="close" size={14} /></button></div>
          <dl className="grid grid-cols-2 gap-2">
            <div className="kv"><dt>Hex</dt><dd>{selState.hex.toUpperCase()}</dd></div>
            <div className="kv"><dt>Squawk</dt><dd>{selState.squawk ?? '—'}</dd></div>
            <div className="kv"><dt>Altitude</dt><dd>{selState.onGround ? 'Ground' : formatAltitude(selState.altBaro, settings.units)}</dd></div>
            <div className="kv"><dt>Speed</dt><dd>{formatSpeed(selState.gs, settings.units)}</dd></div>
            <div className="kv"><dt>Track</dt><dd>{formatHeading(selState.track)}</dd></div>
            <div className="kv"><dt>Trail points</dt><dd>{trail.length}</dd></div>
          </dl>
          <a href={`/flight/${selState.hex}`} className="btn w-full justify-center mt-2 text-xs">Open live view</a>
        </aside>
      )}
      <MobileNav />
    </div>
  );
}
