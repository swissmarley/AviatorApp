import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import type { AircraftState, TrailPoint } from '@contrail/shared';
import { airlineByIcao, aircraftTypeName, emergencyLabel, formatAltitude, formatCoord, formatDistance, formatDuration, formatHeading, formatSpeed, formatTime, formatVerticalRate, formatAgo } from '@contrail/shared';
import { getAircraftDetail, getAircraftTrack, api, type AircraftDetail } from '@/lib/api';
import { useAircraft } from '@/state/aircraft';
import { useSettings } from '@/state/settings';
import { useUi } from '@/state/ui';
import { useAuth } from '@/state/auth';
import { sourceColor, sourceLabel } from '@/lib/aircraftStyle';
import { copyText, readMapPos, shareUrl } from '@/lib/url';
import { FlightChart } from './Chart';
import { Icon } from './Icon';
import { AlertDialog } from './AlertDialog';

export function FlightPanel({ hex, onClose, compact }: { hex: string; onClose: () => void; compact?: boolean }) {
  const [detail, setDetail] = useState<AircraftDetail | null>(null);
  const [track, setTrack] = useState<TrailPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [alertOpen, setAlertOpen] = useState(false);
  const liveEntry = useAircraft((s) => (s.version, s.aircraft.get(hex)));
  const trail = useAircraft((s) => s.selectedTrail);
  const settings = useSettings((s) => s.settings);
  const { follow, setFollow, notify } = useUi();
  const user = useAuth((s) => s.user);
  const me = useAuth((s) => s.me);
  const refresh = useAuth((s) => s.refresh);
  const navigate = useNavigate();
  const live: AircraftState | undefined = liveEntry?.state ?? detail?.live ?? undefined;

  useEffect(() => {
    let cancelled = false;
    setDetail(null); setError(null); setTrack([]);
    getAircraftDetail(hex).then((d) => { if (!cancelled) setDetail(d); }).catch((e) => { if (!cancelled) setError((e as Error).message); });
    getAircraftTrack(hex).then((t) => { if (!cancelled) setTrack(t.points); }).catch(() => undefined);
    const id = setInterval(() => { getAircraftDetail(hex).then((d) => { if (!cancelled) setDetail(d); }).catch(() => undefined); }, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [hex]);

  const chartPoints = useMemo(() => {
    const lastDb = track.length ? track[track.length - 1].ts : 0;
    return [...track, ...trail.filter((p) => p.ts > lastDb)];
  }, [track, trail]);

  const flight = detail?.flight;
  const airline = detail?.airline ?? (live?.operator ? airlineByIcao(live.operator) : undefined);
  const title = live?.callsign ?? flight?.callsign ?? live?.reg ?? hex.toUpperCase();
  const flightNo = live?.flightNo ?? flight?.flightNo;
  const dep = flight?.departure, arr = flight?.arrival;
  const progress = detail?.progress;
  const etaMin = arr?.estimated ? (new Date(arr.estimated).getTime() - Date.now()) / 60000 : progress && live?.gs ? (progress.remainingKm / Math.max(50, live.gs * 1.852)) * 60 : undefined;
  const bookmarked = me?.bookmarks.some((b) => b.kind === 'flight' && (b.data.hex === hex || (live?.reg && b.data.reg === live.reg)));

  const share = async () => {
    const ok = await copyText(shareUrl(`/flight/${hex}`, readMapPos()));
    notify(ok ? 'Link copied' : 'Could not copy link', ok ? 'success' : 'error');
  };
  const bookmark = async () => {
    if (!user) { notify('Sign in to bookmark flights'); navigate('/account'); return; }
    try {
      await api('/api/me/bookmarks', { method: 'POST', body: JSON.stringify({ kind: 'flight', label: `${title}${live?.reg ? ` (${live.reg})` : ''}`, data: { hex, reg: live?.reg, callsign: live?.callsign } }) });
      await refresh();
      notify('Bookmarked', 'success');
    } catch (e) { notify((e as Error).message, 'error'); }
  };

  return (
    <div className={clsx('flex flex-col h-full text-sm', compact ? '' : '')}>
      {/* Header */}
      <div className="flex items-start gap-3 p-3 pb-2 border-b border-line">
        {airline?.icao && <img src={`/api/airlines/${airline.icao}/logo.svg`} alt="" className="w-14 h-7 rounded object-cover shrink-0 mt-0.5" />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-semibold font-mono leading-tight">{title}</h2>
            {flightNo && flightNo !== title && <span className="chip">{flightNo}</span>}
            {live && <SourceBadge a={live} />}
          </div>
          <div className="text-xs text-slate-400 truncate">{airline?.name ?? (live?.operator ? live.operator : live?.category === 'private' ? 'Private' : live?.military ? 'Military' : '')}{detail?.typeName ? ` · ${detail.typeName}` : live?.type ? ` · ${aircraftTypeName(live.type) ?? live.type}` : ''}</div>
        </div>
        <button className="icon-btn w-8 h-8 shrink-0" onClick={onClose} aria-label="Close"><Icon name="close" size={16} /></button>
      </div>

      {live?.emergency && live.emergency !== 'none' && (
        <div className="mx-3 mt-2 rounded-lg bg-red-950 border border-red-700 text-red-100 px-3 py-2 text-xs flex items-center gap-2 pulse-red"><Icon name="alert" size={14} />Squawk {live.squawk}: {emergencyLabel(live.emergency, live.squawk)}</div>
      )}
      {!live && detail && <div className="mx-3 mt-2 rounded-lg bg-ink-3 border border-line px-3 py-2 text-xs text-slate-300">Not currently tracked{detail.lastSeen ? ` · last seen ${new Date(detail.lastSeen).toLocaleString()}` : ''}.</div>}
      {error && <div className="mx-3 mt-2 text-xs text-red-300">{error}</div>}

      <div className="flex-1 overflow-auto scroll-thin">
        {/* Photo */}
        {detail?.photo?.url ? (
          <figure className="relative">
            <img src={detail.photo.url} alt={`${live?.reg ?? title} photo`} className="w-full h-40 object-cover" loading="lazy" />
            <figcaption className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-ink/90 to-transparent px-3 py-1.5 text-[10px] text-slate-200 flex justify-between">
              <span>{detail.photo.attribution}</span>{detail.photo.link && <a href={detail.photo.link} target="_blank" rel="noreferrer" className="underline">Planespotters.net</a>}
            </figcaption>
          </figure>
        ) : detail && !detail.photo?.url ? <div className="h-16 flex items-center justify-center text-xs text-slate-500 bg-ink-3/40">No photo available</div> : <div className="h-16 animate-pulse bg-ink-3/40" />}

        {/* Route */}
        <div className="p-3 border-b border-line">
          {(dep || arr || detail?.origin || detail?.dest) ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <RoutePoint code={dep?.iata ?? detail?.origin?.iata ?? dep?.airport ?? detail?.origin?.icao ?? '—'} name={dep?.name ?? detail?.origin?.municipality ?? detail?.origin?.name} align="left" link={dep?.airport ?? detail?.origin?.icao} />
                <div className="flex-1 flex flex-col items-center text-[10px] text-slate-400">
                  <Icon name="plane" size={16} className="text-slate-300 rotate-90" />
                  {progress && <span>{formatDistance(progress.totalKm, settings.units)}</span>}
                </div>
                <RoutePoint code={arr?.iata ?? detail?.dest?.iata ?? arr?.airport ?? detail?.dest?.icao ?? '—'} name={arr?.name ?? detail?.dest?.municipality ?? detail?.dest?.name} align="right" link={arr?.airport ?? detail?.dest?.icao} />
              </div>
              {progress && (
                <div className="mt-2">
                  <div className="h-1.5 rounded bg-ink-3 overflow-hidden relative"><div className="h-full bg-accent-2 rounded" style={{ width: `${Math.round(progress.fraction * 100)}%` }} /></div>
                  <div className="flex justify-between text-[11px] text-slate-400 mt-1"><span>{formatDistance(progress.flownKm, settings.units)} flown</span><span>{formatDistance(progress.remainingKm, settings.units)} remaining{etaMin !== undefined && etaMin > 0 && !live?.onGround ? ` · ETA ${formatDuration(etaMin)}` : ''}</span></div>
                </div>
              )}
              {(dep?.scheduled || arr?.scheduled || dep?.gate || arr?.gate) && (
                <div className="grid grid-cols-2 gap-3 mt-3 text-xs">
                  <TimeBlock leg={dep} label="Departure" tz={settings.timeZone} />
                  <TimeBlock leg={arr} label="Arrival" tz={settings.timeZone} />
                </div>
              )}
              {flight && <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-400"><span className={clsx('chip', flight.status === 'delayed' || (flight.delayMin ?? 0) >= 15 ? 'border-amber-500 text-amber-300' : flight.status === 'cancelled' ? 'border-red-500 text-red-300' : '')}>{flight.status}{flight.delayMin !== undefined && flight.delayMin >= 5 ? ` · +${flight.delayMin} min` : ''}</span><span>schedule: {flight.source}</span></div>}
            </>
          ) : detail ? <div className="text-xs text-slate-500">Route unknown — no schedule provider matched this callsign.</div> : <div className="h-10 animate-pulse bg-ink-3/40 rounded" />}
        </div>

        {/* Live data */}
        {live && (
          <dl className="grid grid-cols-3 gap-x-3 gap-y-3 p-3 border-b border-line">
            <div className="kv"><dt>Altitude</dt><dd>{live.onGround ? 'Ground' : formatAltitude(live.altBaro, settings.units)}</dd></div>
            <div className="kv"><dt>Ground speed</dt><dd>{formatSpeed(live.gs, settings.units)}</dd></div>
            <div className="kv"><dt>Vertical speed</dt><dd className={clsx((live.vr ?? 0) > 200 && 'text-emerald-300', (live.vr ?? 0) < -200 && 'text-sky-300')}>{formatVerticalRate(live.vr, settings.units)}</dd></div>
            <div className="kv"><dt>Track</dt><dd>{formatHeading(live.track ?? live.heading)}</dd></div>
            <div className="kv"><dt>Squawk</dt><dd>{live.squawk ?? '—'}</dd></div>
            <div className="kv"><dt>Registration</dt><dd>{live.reg ?? '—'}</dd></div>
            <div className="kv"><dt>Type</dt><dd>{live.type ?? '—'}</dd></div>
            <div className="kv"><dt>ICAO hex</dt><dd>{live.hex.toUpperCase()}</dd></div>
            <div className="kv"><dt>Category</dt><dd className="capitalize font-sans">{live.category}{live.military ? ' · mil' : ''}</dd></div>
            <div className="kv col-span-2"><dt>Position</dt><dd>{formatCoord(live.lat, live.lon)}</dd></div>
            <div className="kv"><dt>Last position</dt><dd>{formatAgo(live.seenPos)}</dd></div>
            {live.altGeom !== undefined && <div className="kv"><dt>GNSS altitude</dt><dd>{formatAltitude(live.altGeom, settings.units)}</dd></div>}
            {live.turnRate !== undefined && Math.abs(live.turnRate) > 0.2 && <div className="kv"><dt>Turn rate</dt><dd>{live.turnRate > 0 ? '+' : ''}{live.turnRate.toFixed(1)}°/s</dd></div>}
            <div className="kv"><dt>Feed</dt><dd className="font-sans">{live.feed}</dd></div>
          </dl>
        )}

        <div className="p-3 border-b border-line">
          <div className="text-[11px] uppercase tracking-wide text-slate-400 mb-1">Altitude & speed — this flight</div>
          <FlightChart points={chartPoints} />
        </div>
        <div className="p-3 text-[10px] text-slate-500">Photo © photographer via Planespotters.net where shown. Schedule data from the configured provider.</div>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-5 gap-1 p-2 border-t border-line bg-ink-2">
        <Action icon="cube" label="3D" onClick={() => navigate(`/3d/${hex}`)} disabled={!live} />
        <Action icon="follow" label={follow ? 'Following' : 'Follow'} active={follow} onClick={() => setFollow(!follow)} disabled={!live} />
        <Action icon="share" label="Share" onClick={share} />
        <Action icon="bookmark" label={bookmarked ? 'Saved' : 'Bookmark'} active={!!bookmarked} onClick={bookmark} />
        <Action icon="bell" label="Alert" onClick={() => (user ? setAlertOpen(true) : (notify('Sign in to set alerts'), navigate('/account')))} />
      </div>
      {alertOpen && <AlertDialog subject={flightNo ?? live?.callsign ?? live?.reg ?? hex.toUpperCase()} onClose={() => setAlertOpen(false)} />}
    </div>
  );
}

function Action({ icon, label, onClick, active, disabled }: { icon: string; label: string; onClick: () => void; active?: boolean; disabled?: boolean }) {
  return <button onClick={onClick} disabled={disabled} className={clsx('flex flex-col items-center gap-0.5 py-1.5 rounded-lg text-[10px] hover:bg-ink-3 disabled:opacity-40', active ? 'text-accent' : 'text-slate-200')}><Icon name={icon} size={18} />{label}</button>;
}

function RoutePoint({ code, name, align, link }: { code: string; name?: string; align: 'left' | 'right'; link?: string }) {
  const inner = <><div className="text-2xl font-bold font-mono leading-none">{code}</div><div className="text-[11px] text-slate-400 truncate max-w-[9rem]">{name ?? ''}</div></>;
  return link ? <a href={`/airport/${link}`} className={clsx('block hover:text-accent-2', align === 'right' && 'text-right')}>{inner}</a> : <div className={align === 'right' ? 'text-right' : ''}>{inner}</div>;
}

function TimeBlock({ leg, label, tz }: { leg?: { scheduled?: string; estimated?: string; actual?: string; terminal?: string; gate?: string }; label: string; tz: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="grid grid-cols-3 gap-1 mt-1 font-mono tabular-nums">
        <div><div className="text-[9px] text-slate-500 font-sans">Sched</div>{formatTime(leg?.scheduled, tz)}</div>
        <div><div className="text-[9px] text-slate-500 font-sans">Est</div>{formatTime(leg?.estimated ?? leg?.scheduled, tz)}</div>
        <div><div className="text-[9px] text-slate-500 font-sans">Actual</div>{formatTime(leg?.actual, tz)}</div>
      </div>
      {(leg?.terminal || leg?.gate) && <div className="text-[11px] text-slate-400 mt-1">{leg.terminal ? `Terminal ${leg.terminal}` : ''}{leg.terminal && leg.gate ? ' · ' : ''}{leg.gate ? `Gate ${leg.gate}` : ''}</div>}
    </div>
  );
}

export function SourceBadge({ a }: { a: AircraftState }) {
  return <span className="chip" style={{ borderColor: sourceColor(a.source), color: sourceColor(a.source) }} title={a.source === 'estimated' ? `Dead-reckoned — last real position ${formatAgo(a.seenPos)}` : `Position source: ${sourceLabel(a.source)}`}>{sourceLabel(a.source)}</span>;
}
