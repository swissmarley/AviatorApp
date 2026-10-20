import { useState } from 'react';
import clsx from 'clsx';
import { AIRCRAFT_CATEGORIES, POSITION_SOURCES, type AircraftCategory, type PositionSource } from '@contrail/shared';
import { EMPTY_FILTER, isFilterActive, useFilters } from '@/state/filters';
import { useAuth } from '@/state/auth';
import { api } from '@/lib/api';
import { useUi } from '@/state/ui';
import { Icon } from './Icon';
import { sourceLabel } from '@/lib/aircraftStyle';

const CATEGORY_LABEL: Record<AircraftCategory, string> = { passenger: 'Passenger', cargo: 'Cargo', military: 'Military', private: 'Private / GA', helicopter: 'Helicopter', glider: 'Glider', ground: 'Ground vehicle', unknown: 'Unknown' };

export function FilterPanel({ onClose }: { onClose: () => void }) {
  const { active, saved, patch, clear, save, remove, load } = useFilters();
  const [name, setName] = useState('');
  const user = useAuth((s) => s.user);
  const me = useAuth((s) => s.me);
  const refresh = useAuth((s) => s.refresh);
  const notify = useUi((s) => s.notify);
  const list = (v?: string[]) => (v ?? []).join(', ');
  const parseList = (s: string) => s.split(/[\s,]+/).map((x) => x.trim().toUpperCase()).filter(Boolean);
  const toggleCat = (c: AircraftCategory) => { const cur = active.categories ?? []; patch({ categories: cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c] }); };
  const toggleSrc = (c: PositionSource) => { const cur = active.sources ?? []; patch({ sources: cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c] }); };
  const num = (v: string) => (v === '' ? undefined : Number(v));

  const saveCurrent = async () => {
    if (!name.trim()) return;
    save(name.trim());
    if (user) { try { await api('/api/me/filters', { method: 'POST', body: JSON.stringify({ name: name.trim(), spec: active }) }); await refresh(); } catch { /* local only */ } }
    setName('');
    notify('Filter saved', 'success');
  };

  return (
    <div className="panel w-80 max-h-[75vh] overflow-auto scroll-thin p-3 text-sm" role="dialog" aria-label="Filters">
      <div className="flex items-center justify-between mb-2"><span className="font-semibold">Filters {isFilterActive(active) && <span className="chip ml-1 bg-accent text-ink border-accent">on</span>}</span>
        <div className="flex gap-1">{isFilterActive(active) && <button className="btn btn-ghost text-xs" onClick={clear}>Reset</button>}<button className="icon-btn w-7 h-7" onClick={onClose} aria-label="Close"><Icon name="close" size={14} /></button></div></div>

      <Field label="Airlines (ICAO)"><input className="input" placeholder="BAW, DLH, UAL" defaultValue={list(active.airlines)} onBlur={(e) => patch({ airlines: parseList(e.target.value) })} /></Field>
      <Field label="Aircraft types"><input className="input" placeholder="A320, B738" defaultValue={list(active.types)} onBlur={(e) => patch({ types: parseList(e.target.value) })} /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Origin"><input className="input" placeholder="EGLL" defaultValue={active.origin ?? ''} onBlur={(e) => patch({ origin: e.target.value.trim().toUpperCase() || undefined })} /></Field>
        <Field label="Destination"><input className="input" placeholder="KJFK" defaultValue={active.dest ?? ''} onBlur={(e) => patch({ dest: e.target.value.trim().toUpperCase() || undefined })} /></Field>
        <Field label="Altitude min (ft)"><input className="input" type="number" defaultValue={active.altMin ?? ''} onBlur={(e) => patch({ altMin: num(e.target.value) })} /></Field>
        <Field label="Altitude max (ft)"><input className="input" type="number" defaultValue={active.altMax ?? ''} onBlur={(e) => patch({ altMax: num(e.target.value) })} /></Field>
        <Field label="Speed min (kt)"><input className="input" type="number" defaultValue={active.speedMin ?? ''} onBlur={(e) => patch({ speedMin: num(e.target.value) })} /></Field>
        <Field label="Speed max (kt)"><input className="input" type="number" defaultValue={active.speedMax ?? ''} onBlur={(e) => patch({ speedMax: num(e.target.value) })} /></Field>
      </div>
      <Field label="Status">
        <div className="flex gap-1">{(['any', 'airborne', 'ground'] as const).map((v) => <button key={v} onClick={() => patch({ airborne: v })} className={clsx('btn text-xs flex-1 justify-center', active.airborne === v && 'btn-primary')}>{v === 'any' ? 'All' : v === 'airborne' ? 'Airborne' : 'On ground'}</button>)}</div>
      </Field>
      <Field label="Category">
        <div className="flex flex-wrap gap-1">{AIRCRAFT_CATEGORIES.map((c) => <button key={c} onClick={() => toggleCat(c)} className={clsx('chip cursor-pointer', active.categories?.includes(c) && 'bg-accent text-ink border-accent')}>{CATEGORY_LABEL[c]}</button>)}</div>
      </Field>
      <Field label="Data source">
        <div className="flex flex-wrap gap-1">{POSITION_SOURCES.map((c) => <button key={c} onClick={() => toggleSrc(c)} className={clsx('chip cursor-pointer', active.sources?.includes(c) && 'bg-accent text-ink border-accent')}>{sourceLabel(c)}</button>)}</div>
      </Field>

      <div className="mt-3 border-t border-line pt-3">
        <div className="text-[11px] uppercase tracking-wide text-slate-400 mb-1">Saved filters</div>
        <div className="flex gap-1 mb-2"><input className="input" placeholder="Name this filter" value={name} onChange={(e) => setName(e.target.value)} /><button className="btn" onClick={saveCurrent} disabled={!name.trim() || !isFilterActive(active)}>Save</button></div>
        <ul className="space-y-1">
          {saved.map((s) => <li key={s.id} className="flex items-center gap-1"><button className="btn flex-1 justify-start" onClick={() => load(s.id!)}>{s.name}</button><button className="icon-btn w-8 h-8" onClick={() => remove(s.id!)} aria-label="Delete"><Icon name="trash" size={14} /></button></li>)}
          {me?.filters.filter((f) => !saved.some((s) => s.name === f.name)).map((f) => <li key={f.id} className="flex items-center gap-1"><button className="btn flex-1 justify-start" onClick={() => useFilters.getState().setActive({ ...EMPTY_FILTER, ...(f.spec as object) })}>{f.name} <span className="text-[10px] text-slate-400 ml-1">account</span></button></li>)}
          {!saved.length && !me?.filters.length && <li className="text-xs text-slate-500">Combine the fields above, then save the set to reuse it.</li>}
        </ul>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block mb-2"><span className="block text-[11px] uppercase tracking-wide text-slate-400 mb-1">{label}</span>{children}</label>;
}
