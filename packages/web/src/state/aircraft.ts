import { create } from 'zustand';
import type { AircraftState, EmergencyKind, TrailPoint } from '@contrail/shared';
import { decodeFull, decodePos, type FullRow, type PosRow, type TrailRow } from '@contrail/shared';

/**
 * Live aircraft state. Each entry keeps the previous and latest server positions so the
 * renderer can interpolate smoothly between pushes without React re-rendering per frame.
 * The Map itself is mutated in place; `version` bumps so subscribers re-render on pushes.
 */
export interface LiveAircraft {
  state: AircraftState;
  /** interpolation endpoints (lat, lon, track, alt) and times (ms) */
  p0: [number, number, number, number];
  p1: [number, number, number, number];
  t0: number;
  t1: number;
  /** last client time this aircraft was included in a push */
  lastPush: number;
}

export interface Emergency { hex: string; callsign?: string; squawk?: string; emergency: EmergencyKind; lat: number; lon: number }

interface AircraftStore {
  aircraft: Map<string, LiveAircraft>;
  version: number;
  count: number;
  serverTs: number;
  connected: boolean;
  feeds: string[];
  selectedHex: string | null;
  selectedTrail: TrailPoint[];
  emergencies: Emergency[];
  pushIntervalMs: number;
  applySnapshot: (full: FullRow[], ts: number) => void;
  applyUpdate: (full: FullRow[], pos: PosRow[], rm: string[], ts: number) => void;
  applySelection: (hex: string, trail: TrailRow[], full?: FullRow) => void;
  setSelected: (hex: string | null) => void;
  setEmergencies: (list: Emergency[]) => void;
  setConnected: (connected: boolean, feeds?: string[]) => void;
  clear: () => void;
}

function endpoints(prev: LiveAircraft | undefined, s: AircraftState, now: number, interval: number): Pick<LiveAircraft, 'p0' | 'p1' | 't0' | 't1'> {
  const p1: [number, number, number, number] = [s.lat, s.lon, s.track ?? s.heading ?? 0, s.altBaro ?? 0];
  if (!prev) return { p0: p1, p1, t0: now, t1: now + interval };
  const cur = interpolate(prev, now);
  // Guard against teleports (feed switch / estimated snap): skip animation for big jumps.
  const jump = Math.abs(cur[0] - p1[0]) + Math.abs(cur[1] - p1[1]);
  if (jump > 2) return { p0: p1, p1, t0: now, t1: now + interval };
  return { p0: cur, p1, t0: now, t1: now + interval * 1.05 };
}

export function interpolate(a: LiveAircraft, now: number): [number, number, number, number] {
  const f = a.t1 <= a.t0 ? 1 : Math.max(0, Math.min(1, (now - a.t0) / (a.t1 - a.t0)));
  let dh = ((a.p1[2] - a.p0[2] + 540) % 360) - 180;
  if (!Number.isFinite(dh)) dh = 0;
  return [a.p0[0] + (a.p1[0] - a.p0[0]) * f, a.p0[1] + (a.p1[1] - a.p0[1]) * f, (a.p0[2] + dh * f + 360) % 360, a.p0[3] + (a.p1[3] - a.p0[3]) * f];
}

export const useAircraft = create<AircraftStore>((set, get) => ({
  aircraft: new Map(),
  version: 0,
  count: 0,
  serverTs: 0,
  connected: false,
  feeds: [],
  selectedHex: null,
  selectedTrail: [],
  emergencies: [],
  pushIntervalMs: 5000,

  applySnapshot: (full, ts) => {
    const now = performance.now();
    const { aircraft, pushIntervalMs } = get();
    const next = new Map<string, LiveAircraft>();
    for (const row of full) {
      const s = decodeFull(row);
      const prev = aircraft.get(s.hex);
      next.set(s.hex, { state: s, ...endpoints(prev, s, now, pushIntervalMs), lastPush: now });
    }
    set({ aircraft: next, version: get().version + 1, count: next.size, serverTs: ts });
  },

  applyUpdate: (full, pos, rm, ts) => {
    const now = performance.now();
    const { aircraft, pushIntervalMs } = get();
    for (const row of full) {
      const s = decodeFull(row);
      const prev = aircraft.get(s.hex);
      aircraft.set(s.hex, { state: s, ...endpoints(prev, s, now, pushIntervalMs), lastPush: now });
    }
    for (const row of pos) {
      const prev = aircraft.get(row[0]);
      if (!prev) continue;
      const s = decodePos(row, { ...prev.state }) as AircraftState;
      s.seen = s.seenPos;
      aircraft.set(s.hex, { state: s, ...endpoints(prev, s, now, pushIntervalMs), lastPush: now });
    }
    for (const hex of rm) aircraft.delete(hex);
    set({ version: get().version + 1, count: aircraft.size, serverTs: ts });
  },

  applySelection: (hex, trail, full) => {
    if (hex !== get().selectedHex) return;
    const points: TrailPoint[] = trail.map((r) => ({ ts: r[0], lat: r[1], lon: r[2], alt: r[3] ?? undefined, gs: r[4] ?? undefined, track: r[5] ?? undefined, vr: r[6] ?? undefined }));
    if (full) {
      const now = performance.now();
      const s = decodeFull(full);
      const prev = get().aircraft.get(s.hex);
      get().aircraft.set(s.hex, { state: s, ...endpoints(prev, s, now, get().pushIntervalMs), lastPush: now });
    }
    set({ selectedTrail: points, version: get().version + 1 });
  },

  setSelected: (hex) => set({ selectedHex: hex, selectedTrail: hex === get().selectedHex ? get().selectedTrail : [] }),
  setEmergencies: (list) => set({ emergencies: list }),
  setConnected: (connected, feeds) => set({ connected, ...(feeds ? { feeds } : {}) }),
  clear: () => set({ aircraft: new Map(), version: get().version + 1, count: 0 }),
}));
