import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import clsx from 'clsx';
import { aircraftTypeName, formatAltitude, formatHeading, formatSpeed, formatVerticalRate } from '@contrail/shared';
import { CesiumView, type CameraMode } from '@/three/CesiumView';
import { Icon } from '@/components/Icon';
import { live } from '@/lib/ws';
import { useAircraft } from '@/state/aircraft';
import { useSettings } from '@/state/settings';

const MODES: { key: CameraMode; label: string }[] = [
  { key: 'chase', label: 'Chase' },
  { key: 'cockpit', label: 'Cockpit' },
  { key: 'wing', label: 'Wing' },
  { key: 'orbit', label: 'Orbit' },
  { key: 'free', label: 'Free' },
];

export function ThreeDPage() {
  const { hex = '' } = useParams<{ hex: string }>();
  const h = hex.toLowerCase();
  const navigate = useNavigate();
  const [mode, setMode] = useState<CameraMode>('chase');
  const [status, setStatus] = useState<{ terrain: boolean; buildings: boolean; error?: string } | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const entry = useAircraft((s) => (s.version, s.aircraft.get(h)));
  const units = useSettings((s) => s.settings.units);

  useEffect(() => {
    live.connect();
    live.select(h);
    const t = setTimeout(() => setTimedOut(true), 8000);
    return () => { clearTimeout(t); live.select(null); live.disconnect(); };
  }, [h]);

  const a = entry?.state;
  const back = () => navigate(`/flight/${h}${location.hash}`);

  return (
    <div className="h-full w-full relative">
      <CesiumView hex={h} mode={mode} onStatus={setStatus} />

      <div className="absolute top-2 left-2 md:top-3 md:left-3 z-20 flex items-start gap-2">
        <button className="icon-btn" onClick={back} aria-label="Back to map"><Icon name="back" /></button>
        <div className="panel px-3 py-2 min-w-[14rem]">
          {a ? (
            <>
              <div className="flex items-center gap-2"><Icon name="cube" size={16} className="text-accent" /><span className="font-mono font-semibold text-lg leading-none">{a.callsign ?? a.reg ?? h.toUpperCase()}</span>{a.flightNo && <span className="chip">{a.flightNo}</span>}</div>
              <div className="text-xs text-slate-400 mt-0.5">{aircraftTypeName(a.type) ?? a.type ?? ''}{a.reg ? ` · ${a.reg}` : ''}{a.origin && a.dest ? ` · ${a.origin} → ${a.dest}` : ''}</div>
              <dl className="grid grid-cols-4 gap-x-3 mt-2">
                <div className="kv"><dt>Alt</dt><dd>{a.onGround ? 'GND' : formatAltitude(a.altBaro, units)}</dd></div>
                <div className="kv"><dt>GS</dt><dd>{formatSpeed(a.gs, units)}</dd></div>
                <div className="kv"><dt>Hdg</dt><dd>{formatHeading(a.track ?? a.heading)}</dd></div>
                <div className="kv"><dt>V/S</dt><dd>{formatVerticalRate(a.vr, units)}</dd></div>
              </dl>
            </>
          ) : (
            <div className="text-sm text-slate-300">{timedOut ? <>Aircraft not currently tracked. <button className="underline" onClick={back}>Back</button></> : 'Locating aircraft…'}</div>
          )}
        </div>
      </div>

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 panel p-1 flex gap-1" role="tablist" aria-label="Camera mode">
        {MODES.map((m) => (
          <button key={m.key} role="tab" aria-selected={mode === m.key} onClick={() => setMode(m.key)} className={clsx('px-3 py-1.5 rounded-lg text-sm', mode === m.key ? 'bg-accent text-ink font-semibold' : 'text-slate-200 hover:bg-ink-3')}>{m.label}</button>
        ))}
      </div>

      <div className="absolute top-2 right-2 md:top-3 md:right-3 z-20 flex flex-col items-end gap-1 text-[11px]">
        {status && !status.error && !(status.terrain && status.buildings) && (
          <div className="panel px-2 py-1 text-slate-300 flex items-center gap-1"><Icon name="info" size={12} />Add VITE_CESIUM_ION_TOKEN for terrain and 3D buildings</div>
        )}
        {status?.terrain && <div className="panel px-2 py-1 text-slate-300">Cesium World Terrain{status.buildings ? ' · OSM Buildings' : ''}</div>}
        <div className="panel px-2 py-1 text-slate-400">Pitch from vertical rate · roll from turn rate · real-time sun</div>
      </div>
    </div>
  );
}
