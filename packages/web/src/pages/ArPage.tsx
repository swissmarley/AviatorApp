import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import type { AircraftState } from '@contrail/shared';
import { aircraftTypeName, formatAltitude, formatDistance, haversineKm, headingDelta, lookAngles, airlineByIcao } from '@contrail/shared';
import { Icon } from '@/components/Icon';
import { Logo } from '@/components/Logo';
import { live } from '@/lib/ws';
import { useAircraft, interpolate } from '@/state/aircraft';
import { useSettings } from '@/state/settings';

const H_FOV = 62; // typical phone rear camera, degrees
const MAX_KM = 80;

interface Target { a: AircraftState; azimuth: number; elevation: number; distanceKm: number; lat: number; lon: number; alt: number }

/**
 * AR sky view: camera feed + device orientation + geolocation. Aircraft are projected onto
 * the camera image by azimuth/elevation. Without sensors (desktop) it falls back to a
 * compass list with a manual heading slider.
 */
export function ArPage() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [pos, setPos] = useState<{ lat: number; lon: number; alt: number; acc?: number } | null>(null);
  const [orient, setOrient] = useState<{ heading: number; pitch: number; roll: number; absolute: boolean } | null>(null);
  const [manualHeading, setManualHeading] = useState(0);
  const [camera, setCamera] = useState<'pending' | 'on' | 'off'>('pending');
  const [err, setErr] = useState<string | null>(null);
  const [needsPermission, setNeedsPermission] = useState(false);
  const [, force] = useState(0);
  const version = useAircraft((s) => s.version);
  const units = useSettings((s) => s.settings.units);

  // --- sensors
  useEffect(() => {
    if (!('geolocation' in navigator)) { setErr('Geolocation is not available in this browser.'); return; }
    const id = navigator.geolocation.watchPosition(
      (p) => setPos({ lat: p.coords.latitude, lon: p.coords.longitude, alt: p.coords.altitude ?? 0, acc: p.coords.accuracy }),
      (e) => setErr(e.code === 1 ? 'Location permission denied — allow location to use AR mode.' : `Location error: ${e.message}`),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  const startOrientation = async () => {
    const DOE = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<'granted' | 'denied'> };
    if (typeof DOE.requestPermission === 'function') {
      try { if ((await DOE.requestPermission()) !== 'granted') { setErr('Motion permission denied.'); return; } } catch { setErr('Motion permission denied.'); return; }
    }
    setNeedsPermission(false);
    const handler = (e: DeviceOrientationEvent) => {
      const webkit = (e as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading;
      let heading: number | null = null;
      if (typeof webkit === 'number') heading = webkit;
      else if (e.alpha !== null) heading = (360 - e.alpha) % 360; // alpha is counter-clockwise from north
      if (heading === null) return;
      const screenAngle = (screen.orientation?.angle ?? 0);
      heading = (heading + screenAngle + 360) % 360;
      const beta = e.beta ?? 0, gamma = e.gamma ?? 0;
      // pitch: 0 = horizon, +90 = zenith, when holding the phone upright in portrait
      const pitch = Math.max(-90, Math.min(90, beta - 90));
      setOrient({ heading, pitch, roll: gamma, absolute: e.absolute || typeof webkit === 'number' });
    };
    window.addEventListener('deviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation', handler as EventListener, true);
    return () => window.removeEventListener('deviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation', handler as EventListener, true);
  };
  useEffect(() => {
    const DOE = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
    if (typeof DOE.requestPermission === 'function') { setNeedsPermission(true); return; }
    let cleanup: (() => void) | undefined;
    void startOrientation().then((c) => { cleanup = c as (() => void) | undefined; });
    return () => cleanup?.();
  }, []);

  // --- camera
  useEffect(() => {
    let stream: MediaStream | undefined;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('no camera');
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
        setCamera('on');
      } catch { setCamera('off'); }
    })();
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);

  // --- live data around the user
  useEffect(() => { live.connect(); return () => live.disconnect(); }, []);
  useEffect(() => {
    if (!pos) return;
    const d = 1.2;
    live.setView([pos.lon - d / Math.cos((pos.lat * Math.PI) / 180), pos.lat - d, pos.lon + d / Math.cos((pos.lat * Math.PI) / 180), pos.lat + d], 8);
  }, [pos?.lat.toFixed(1), pos?.lon.toFixed(1)]);
  useEffect(() => { const id = setInterval(() => force((n) => n + 1), 250); return () => clearInterval(id); }, []);

  const heading = orient?.heading ?? manualHeading;
  const pitch = orient?.pitch ?? 15;
  const hasSensors = !!orient;

  const targets = useMemo<Target[]>(() => {
    if (!pos) return [];
    const now = performance.now();
    const out: Target[] = [];
    for (const e of useAircraft.getState().aircraft.values()) {
      const [lat, lon, , altFt] = interpolate(e, now);
      const dist = haversineKm(pos.lat, pos.lon, lat, lon);
      if (dist > MAX_KM) continue;
      const la = lookAngles(pos.lat, pos.lon, pos.alt, lat, lon, altFt * 0.3048);
      out.push({ a: e.state, azimuth: la.azimuth, elevation: la.elevation, distanceKm: la.distanceKm, lat, lon, alt: altFt });
    }
    return out.sort((x, y) => x.distanceKm - y.distanceKm);
  }, [pos, version, heading]);

  const vfov = typeof window !== 'undefined' ? H_FOV * (window.innerHeight / Math.max(1, window.innerWidth)) : 90;
  const inView = targets.map((t) => {
    const dAz = headingDelta(heading, t.azimuth);
    const dEl = t.elevation - pitch;
    const x = 50 + (dAz / H_FOV) * 100;
    const y = 50 - (dEl / vfov) * 100;
    return { t, dAz, dEl, x, y, visible: Math.abs(dAz) < H_FOV / 2 + 4 && Math.abs(dEl) < vfov / 2 + 4 };
  });

  return (
    <div className="h-full w-full relative bg-black text-white overflow-hidden select-none">
      <video ref={videoRef} playsInline muted className={clsx('absolute inset-0 w-full h-full object-cover', camera !== 'on' && 'hidden')} />
      {camera !== 'on' && <div className="absolute inset-0 bg-gradient-to-b from-sky-900 via-ink to-ink" />}

      {/* horizon line & compass tape */}
      <div className="absolute inset-x-0 pointer-events-none" style={{ top: `${50 + (pitch / vfov) * 100}%` }}><div className="border-t border-dashed border-white/30" /></div>
      <CompassTape heading={heading} targets={targets} />

      {/* projected aircraft */}
      {inView.filter((v) => v.visible).map(({ t, x, y }) => (
        <button key={t.a.hex} onClick={() => navigate(`/flight/${t.a.hex}`)} className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center" style={{ left: `${x}%`, top: `${y}%` }}>
          <span className="w-9 h-9 rounded-full border-2 border-accent/90 flex items-center justify-center bg-black/30 backdrop-blur-sm"><Icon name="plane" size={16} className="text-accent" style={{ transform: `rotate(${(t.a.track ?? 0) - heading}deg)` }} /></span>
          <span className="mt-1 px-2 py-0.5 rounded bg-black/60 text-[11px] font-mono leading-tight text-center">
            {t.a.callsign ?? t.a.reg ?? t.a.hex.toUpperCase()}<br />
            <span className="text-slate-200">{formatAltitude(t.alt, units)} · {formatDistance(t.distanceKm, units)}</span>
          </span>
        </button>
      ))}

      {/* off-screen hints */}
      {inView.filter((v) => !v.visible && Math.abs(v.dEl) < vfov).slice(0, 6).map(({ t, dAz }) => (
        <div key={t.a.hex} className={clsx('absolute top-1/2 -translate-y-1/2 text-[10px] font-mono bg-black/50 px-1.5 py-0.5 rounded', dAz < 0 ? 'left-1' : 'right-1')}>{dAz < 0 ? '◀ ' : ''}{t.a.callsign ?? t.a.hex.toUpperCase()}{dAz > 0 ? ' ▶' : ''}</div>
      ))}

      {/* header */}
      <div className="absolute top-0 inset-x-0 p-2 flex items-center gap-2">
        <Link to="/" className="icon-btn" aria-label="Back to map"><Icon name="back" /></Link>
        <div className="panel px-3 h-9 flex items-center gap-2 text-xs"><Logo size={20} /><span className="text-slate-300">AR sky view</span></div>
        <div className="ml-auto panel px-3 h-9 flex items-center gap-3 text-xs font-mono">
          <span>{Math.round(heading).toString().padStart(3, '0')}°</span>
          <span className={clsx(hasSensors ? (orient?.absolute ? 'text-emerald-300' : 'text-amber-300') : 'text-slate-400')}>{hasSensors ? (orient?.absolute ? 'compass' : 'relative') : 'no compass'}</span>
          <span className={pos ? 'text-emerald-300' : 'text-slate-400'}>{pos ? `GPS ±${Math.round(pos.acc ?? 0)} m` : 'no GPS'}</span>
          <span>{targets.length} nearby</span>
        </div>
      </div>

      {/* messages */}
      <div className="absolute inset-x-0 top-14 flex flex-col items-center gap-2 px-3 pointer-events-none">
        {err && <div className="pointer-events-auto panel px-3 py-2 text-xs text-amber-200 border-amber-700">{err}</div>}
        {needsPermission && <button className="pointer-events-auto btn btn-primary" onClick={() => void startOrientation()}>Enable motion & compass</button>}
        {!hasSensors && !needsPermission && <div className="pointer-events-auto panel px-3 py-2 text-xs text-slate-300">No orientation sensor — use the heading slider below, or open this page on a phone.</div>}
        {camera === 'off' && <div className="pointer-events-auto panel px-3 py-2 text-xs text-slate-300">Camera unavailable; showing a synthetic sky.</div>}
        {!pos && !err && <div className="pointer-events-auto panel px-3 py-2 text-xs text-slate-300">Waiting for location…</div>}
      </div>

      {/* bottom: manual heading + nearest list */}
      <div className="absolute inset-x-0 bottom-0 p-2 space-y-2">
        {!hasSensors && <label className="panel flex items-center gap-2 px-3 py-2 text-xs">Heading<input type="range" min={0} max={359} value={manualHeading} onChange={(e) => setManualHeading(Number(e.target.value))} className="flex-1 accent-amber-400" /><span className="font-mono w-10 text-right">{manualHeading}°</span></label>}
        <div className="panel max-h-36 overflow-auto scroll-thin text-xs">
          {targets.slice(0, 8).map((t) => (
            <button key={t.a.hex} onClick={() => navigate(`/flight/${t.a.hex}`)} className="w-full flex items-center gap-3 px-3 py-1.5 hover:bg-ink-3 text-left">
              <span className="font-mono font-semibold w-20 truncate">{t.a.callsign ?? t.a.reg ?? t.a.hex.toUpperCase()}</span>
              <span className="flex-1 truncate text-slate-300">{airlineByIcao(t.a.operator)?.name ?? ''}{t.a.type ? ` · ${aircraftTypeName(t.a.type) ?? t.a.type}` : ''}</span>
              <span className="font-mono text-slate-300">{Math.round(t.azimuth).toString().padStart(3, '0')}° ↑{Math.round(t.elevation)}°</span>
              <span className="font-mono text-slate-300 w-16 text-right">{formatDistance(t.distanceKm, units)}</span>
            </button>
          ))}
          {pos && !targets.length && <div className="px-3 py-2 text-slate-400">No aircraft within {MAX_KM} km right now.</div>}
        </div>
      </div>
    </div>
  );
}

function CompassTape({ heading, targets }: { heading: number; targets: Target[] }) {
  const marks: { deg: number; label: string }[] = [];
  for (let d = 0; d < 360; d += 15) marks.push({ deg: d, label: d % 90 === 0 ? ['N', 'E', 'S', 'W'][d / 90] : d % 45 === 0 ? String(d) : '' });
  return (
    <div className="absolute top-12 inset-x-0 h-8 overflow-hidden pointer-events-none">
      <div className="absolute left-1/2 top-0 h-full border-l-2 border-accent" />
      {marks.map((m) => { const d = headingDelta(heading, m.deg); if (Math.abs(d) > 45) return null; return <div key={m.deg} className="absolute top-0 flex flex-col items-center text-[10px] text-white/80 -translate-x-1/2" style={{ left: `${50 + (d / 90) * 100}%` }}><span className={clsx('block w-px bg-white/70', m.label ? 'h-3' : 'h-1.5')} />{m.label}</div>; })}
      {targets.slice(0, 20).map((t) => { const d = headingDelta(heading, t.azimuth); if (Math.abs(d) > 45) return null; return <span key={t.a.hex} className="absolute bottom-0 w-1.5 h-1.5 rounded-full bg-accent -translate-x-1/2" style={{ left: `${50 + (d / 90) * 100}%` }} />; })}
    </div>
  );
}
