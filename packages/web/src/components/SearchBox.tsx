import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { search, type SearchResults } from '@/lib/api';
import { Icon } from './Icon';
import { useFilters } from '@/state/filters';
import { useUi } from '@/state/ui';

export function SearchBox() {
  const [q, setQ] = useState('');
  const [res, setRes] = useState<SearchResults | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const box = useRef<HTMLDivElement>(null);
  const patch = useFilters((s) => s.patch);
  const notify = useUi((s) => s.notify);

  useEffect(() => {
    if (q.trim().length < 2) { setRes(null); return; }
    const id = setTimeout(async () => {
      setBusy(true);
      try { setRes(await search(q.trim())); setOpen(true); } catch { setRes(null); } finally { setBusy(false); }
    }, 220);
    return () => clearTimeout(id);
  }, [q]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    const onKey = (e: KeyboardEvent) => { if (e.key === '/' && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); box.current?.querySelector('input')?.focus(); } };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, []);

  const go = (path: string) => { setOpen(false); setQ(''); navigate(path); };
  const empty = res && !res.aircraft.length && !res.airports.length && !res.airlines.length && !res.types.length && !res.history.length;

  return (
    <div ref={box} className="relative">
      <div className="panel h-11 flex items-center px-3 gap-2">
        <Icon name="search" size={18} className="text-slate-400 shrink-0" />
        <input value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => res && setOpen(true)} placeholder="Flight, callsign, registration, airline, airport, type…" className="bg-transparent flex-1 outline-none text-sm placeholder:text-slate-500 min-w-0" aria-label="Search" />
        {busy && <span className="w-3 h-3 rounded-full border-2 border-slate-500 border-t-transparent animate-spin" />}
        {q && <button className="text-slate-400 hover:text-white" onClick={() => { setQ(''); setRes(null); }} aria-label="Clear"><Icon name="close" size={16} /></button>}
      </div>
      {open && res && (
        <div className="absolute top-12 inset-x-0 panel max-h-[70vh] overflow-auto scroll-thin p-1 text-sm">
          {empty && <div className="px-3 py-3 text-slate-400">No matches for “{q}”.</div>}
          {res.aircraft.length > 0 && <Group title="Live aircraft">{res.aircraft.map((a) => (
            <Row key={a.hex} onClick={() => go(`/flight/${a.hex}`)} title={a.callsign ?? a.reg ?? a.hex.toUpperCase()} sub={[a.flightNo, a.airline, a.type, a.reg, a.origin && a.dest ? `${a.origin} → ${a.dest}` : undefined].filter(Boolean).join(' · ')} badge={a.onGround ? 'GND' : 'AIR'} />
          ))}</Group>}
          {res.history.length > 0 && <Group title="Recently tracked">{res.history.map((a) => (
            <Row key={a.hex} onClick={() => go(`/history/registration/${a.reg ?? a.hex}`)} title={a.callsign ?? a.reg ?? a.hex} sub={[a.type, a.reg, a.origin && a.dest ? `${a.origin} → ${a.dest}` : undefined, new Date(a.lastSeen).toLocaleString()].filter(Boolean).join(' · ')} badge="HIST" />
          ))}</Group>}
          {res.airports.length > 0 && <Group title="Airports">{res.airports.map((a) => (
            <Row key={a.ident} onClick={() => go(`/airport/${a.icao ?? a.iata ?? a.ident}`)} title={`${a.name}`} sub={[a.iata, a.icao, a.municipality, a.country].filter(Boolean).join(' · ')} badge={a.iata ?? a.icao ?? a.ident} />
          ))}</Group>}
          {res.airlines.length > 0 && <Group title="Airlines">{res.airlines.map((a) => (
            <Row key={a.icao} onClick={() => { patch({ airlines: [a.icao] }); notify(`Filtering by ${a.name}`); setOpen(false); navigate('/'); }} title={a.name} sub={`${a.icao}${a.iata ? ` / ${a.iata}` : ''} · ${a.live} live · click to filter the map`} badge={a.icao} />
          ))}</Group>}
          {res.types.length > 0 && <Group title="Aircraft types">{res.types.map((t) => (
            <Row key={t.icao} onClick={() => { patch({ types: [t.icao] }); notify(`Filtering by ${t.name}`); setOpen(false); navigate('/'); }} title={t.name} sub={`${t.icao} · click to filter the map`} badge={t.icao} />
          ))}</Group>}
        </div>
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="py-1"><div className="px-3 py-1 text-[11px] uppercase tracking-wide text-slate-400">{title}</div>{children}</div>;
}
function Row({ title, sub, badge, onClick }: { title: string; sub?: string; badge?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full text-left px-3 py-2 rounded-lg hover:bg-ink-3 flex items-center gap-3">
      {badge && <span className="chip font-mono w-14 justify-center shrink-0">{badge}</span>}
      <span className="min-w-0"><span className="block truncate">{title}</span>{sub && <span className="block text-xs text-slate-400 truncate">{sub}</span>}</span>
    </button>
  );
}
