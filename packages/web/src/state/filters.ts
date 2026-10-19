import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AircraftState, FilterSpec } from '@contrail/shared';

interface FilterStore {
  active: FilterSpec;
  saved: FilterSpec[];
  setActive: (spec: FilterSpec) => void;
  patch: (patch: Partial<FilterSpec>) => void;
  clear: () => void;
  save: (name: string) => void;
  remove: (id: string) => void;
  load: (id: string) => void;
}

export const EMPTY_FILTER: FilterSpec = { airborne: 'any' };

export function isFilterActive(f: FilterSpec): boolean {
  return !!(f.airlines?.length || f.types?.length || f.altMin !== undefined || f.altMax !== undefined || f.speedMin !== undefined || f.speedMax !== undefined || f.origin || f.dest || f.categories?.length || (f.airborne && f.airborne !== 'any') || f.sources?.length || f.text);
}

export function matchesFilter(a: AircraftState, f: FilterSpec): boolean {
  if (f.airlines?.length && !(a.operator && f.airlines.includes(a.operator))) return false;
  if (f.types?.length && !(a.type && f.types.includes(a.type))) return false;
  if (f.altMin !== undefined && (a.altBaro ?? 0) < f.altMin) return false;
  if (f.altMax !== undefined && (a.altBaro ?? 0) > f.altMax) return false;
  if (f.speedMin !== undefined && (a.gs ?? 0) < f.speedMin) return false;
  if (f.speedMax !== undefined && (a.gs ?? 0) > f.speedMax) return false;
  if (f.origin && a.origin !== f.origin) return false;
  if (f.dest && a.dest !== f.dest) return false;
  if (f.categories?.length && !f.categories.includes(a.category)) return false;
  if (f.airborne === 'airborne' && a.onGround) return false;
  if (f.airborne === 'ground' && !a.onGround) return false;
  if (f.sources?.length && !f.sources.includes(a.source)) return false;
  if (f.text) {
    const t = f.text.toUpperCase();
    if (!(a.callsign?.includes(t) || a.reg?.toUpperCase().includes(t) || a.flightNo?.includes(t) || a.hex.toUpperCase().includes(t) || a.type?.includes(t))) return false;
  }
  return true;
}

export const useFilters = create<FilterStore>()(
  persist(
    (set, get) => ({
      active: EMPTY_FILTER,
      saved: [],
      setActive: (spec) => set({ active: spec }),
      patch: (patch) => set({ active: { ...get().active, ...patch } }),
      clear: () => set({ active: EMPTY_FILTER }),
      save: (name) => set({ saved: [...get().saved, { ...get().active, id: crypto.randomUUID(), name }] }),
      remove: (id) => set({ saved: get().saved.filter((s) => s.id !== id) }),
      load: (id) => { const s = get().saved.find((x) => x.id === id); if (s) set({ active: { ...s } }); },
    }),
    { name: 'contrail:filters' },
  ),
);
