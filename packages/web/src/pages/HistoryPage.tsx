import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Map as MlMap } from 'maplibre-gl';
import clsx from 'clsx';
import type { TrailPoint } from '@contrail/shared';
import { formatDuration } from '@contrail/shared';
import { MapView } from '@/map/MapView';
import { TopBar, MobileNav } from '@/components/TopBar';
import { FlightChart } from '@/components/Chart';
import { Icon } from '@/components/Icon';
import { ApiError, getHistoryByFlight, getHistoryByReg, getStoredTrack, type StoredFlight } from '@/lib/api';

type Kind = 'registration' | 'flight';

export function HistoryPage() {
  const { kind = 'registration', id = '' } = useParams<{ kind: Kind; id: string }>();
  const navigate = useNavigate();
  const [flights, setFlights] = useState<StoredFlight[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState(id);
  const [active, setActive] = useState<StoredFlight | null>(null);
  const [track, setTrack] = useState<TrailPoint[]>([]);
  const mapRef = useRef<MlMap | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null); setFlights([]); setActive(null); setTrack([]); setQuery(id);
    (kind === 'flight' ? getHistoryByFlight(id) : getHistoryByReg(id))
      .then((r) => { if (!cancelled) { setFlights(r.flights); if (r.flights[0]) void select(r.flights[0]); } })
      .catch((e) => { if (!cancelled) setError(e instanceof ApiError && e.status === 503 ? 'History requires a database: set DATABASE_URL (docker-compose starts TimescaleDB) and restart the server.' : (e as Error).message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, id]);

  const fit = useCallback((pts: TrailPoint[]) => {
    const map = mapRef.current;
    if (!map || pts.length < 2) return;
    let w = 180, s = 90, e = -180, n = -90;
    for (const p of pts) { w = Math.min(w, p.lon); e = Math.max(e, p.lon); s = Math.min(s, p.lat); n = Math.max(n, p.lat); }
    map.fitBounds([[w, s], [e, n]], { padding: 40, maxZoom: 10, duration: 400 });
  }, []);

  const select = async (f: StoredFlight) => {
    setActive(f);
    try { const t = await getStoredTrack(f.id); setTrack(t.points); fit(t.points); } catch { setTrack([]); }
  };
  const onMapReady = useCallback((map: MlMap) => { mapRef.current = map; }, []);
  useEffect(() => { fit(track); }, [track, fit]);

  const submit = (e: React.FormEvent) => { e.preventDefault(); if (query.trim()) navigate(`/history/${kind}/${encodeURIComponent(query.trim().toUpperCase())}`); };
  const fmtDate = (s: string) => new Date(s).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const duration = (f: StoredFlight) => formatDuration((new Date(f.last_seen).getTime() - new Date(f.first_seen).getTime()) / 60000);
  const inProgress = (f: StoredFlight) => Date.now() - new Date(f.last_seen).getTime() < 5 * 60_000 && !f.ground_end;

  return (
    <div className="h-full w-full relative overflow-hidden">
      <TopBar />
      <div className="absolute inset-0 pt-14 md:pt-16 pb-16 md:pb-0 flex flex-col md:flex-row">
        <section className="md:w-[460px] md:h-full overflow-auto scroll-thin p-3 space-y-3 shrink-0">
          <div className="panel p-3 text-sm">
            <div className="flex items-center gap-2 mb-2">
              <Link to="/" className="icon-btn w-8 h-8" aria-label="Back to map"><Icon name="back" size={16} /></Link>
              <div>
                <div className="text-[11px] uppercase tracking-wide text-slate-400">{kind === 'flight' ? 'Route history' : 'Past flights'}</div>
                <h1 className="text-lg font-semibold font-mono leading-tight">{id}</h1>
              </div>
            </div>
            <form onSubmit={submit} className="flex gap-1">
              <select className="input w-32" value={kind} onChange={(e) => navigate(`/history/${e.target.value}/${encodeURIComponent(query || id)}`)}>
                <option value="registration">Registration</option>
                <option value="flight">Flight no.</option>
              </select>
              <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={kind === 'flight' ? 'BA117 or BAW117' : 'G-XLEA or hex'} />
              <button className="btn" type="submit">Go</button>
            </form>
          </div>

          <div className="panel overflow-hidden text-sm">
            {loading && <div className="p-4 text-slate-400">Loading…</div>}
            {error && <div className="p-4 text-amber-300 text-xs">{error}</div>}
            {!loading && !error && !flights.length && <div className="p-4 text-slate-400 text-xs">No recorded flights for {id}. Flights appear here once the aircraft has been tracked by this server.</div>}
            {flights.length > 0 && (
              <table className="w-full text-xs">
                <thead className="text-[10px] uppercase tracking-wide text-slate-400 bg-ink-3/60"><tr><th className="text-left px-3 py-2">Date</th><th className="text-left px-2 py-2">{kind === 'flight' ? 'Reg' : 'Flight'}</th><th className="text-left px-2 py-2">Route</th><th className="text-right px-2 py-2">Duration</th><th className="text-right px-3 py-2">Max alt</th></tr></thead>
                <tbody>
                  {flights.map((f) => (
                    <tr key={f.id} onClick={() => void select(f)} className={clsx('cursor-pointer border-t border-line hover:bg-ink-3', active?.id === f.id && 'bg-ink-3')}>
                      <td className="px-3 py-2 whitespace-nowrap">{fmtDate(f.first_seen)}{inProgress(f) && <span className="chip ml-1 border-emerald-600 text-emerald-300">live</span>}</td>
                      <td className="px-2 py-2 font-mono">{kind === 'flight' ? (f.reg ?? f.hex.toUpperCase()) : (f.flight_no ?? f.callsign ?? '—')}</td>
                      <td className="px-2 py-2 font-mono whitespace-nowrap">{f.origin ?? '?'} → {f.dest ?? '?'}</td>
                      <td className="px-2 py-2 text-right font-mono">{duration(f)}</td>
                      <td className="px-3 py-2 text-right font-mono">{f.max_alt ? `${Math.round(f.max_alt / 100)}00` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {active && (
            <div className="panel p-3 text-sm">
              <div className="flex items-center justify-between mb-2">
                <div><div className="font-mono font-semibold">{active.callsign ?? active.flight_no ?? active.hex.toUpperCase()}</div><div className="text-xs text-slate-400">{[active.reg, active.type, active.category].filter(Boolean).join(' · ')}</div></div>
                <div className="flex gap-1">
                  {inProgress(active) && <Link to={`/flight/${active.hex}`} className="btn text-xs">Live</Link>}
                  <Link to={`/history/${kind === 'flight' ? 'registration' : 'flight'}/${encodeURIComponent(kind === 'flight' ? (active.reg ?? active.hex) : (active.flight_no ?? active.callsign ?? ''))}`} className="btn text-xs">{kind === 'flight' ? 'Airframe history' : 'Route history'}</Link>
                </div>
              </div>
              <dl className="grid grid-cols-3 gap-2 mb-2">
                <div className="kv"><dt>First seen</dt><dd className="font-sans text-xs">{fmtDate(active.first_seen)}</dd></div>
                <div className="kv"><dt>Last seen</dt><dd className="font-sans text-xs">{fmtDate(active.last_seen)}</dd></div>
                <div className="kv"><dt>Positions</dt><dd>{active.position_count || track.length}</dd></div>
              </dl>
              <FlightChart points={track} />
            </div>
          )}
        </section>
        <section className="flex-1 min-h-[280px] relative m-3 md:ml-0 rounded-xl overflow-hidden border border-line">
          <MapView mode="playback" selectedHex={active?.hex ?? null} onSelect={() => undefined} items={[]} trail={track} onMapReady={onMapReady} className="absolute inset-0" />
        </section>
      </div>
      <MobileNav />
    </div>
  );
}
