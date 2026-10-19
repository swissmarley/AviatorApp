import type { AircraftState } from '@contrail/shared';
import { POSITION_SOURCES, classifyAircraft, emergencyFromSquawk, headingDelta } from '@contrail/shared';
import type { PlaybackFrame } from '@/lib/api';
import type { LayerItem } from '@/map/AircraftLayer';
import { styleFor } from '@/lib/aircraftStyle';
import { setLabelText } from '@/map/LabelCanvas';

export type Row = PlaybackFrame['rows'][number];

export interface ReplayPoint { lat: number; lon: number; track: number; alt: number; gs: number; vr: number; onGround: boolean; callsign?: string; squawk?: string; source: number; ts: number }

export function rowToState(r: Row, ts: number): AircraftState {
  const onGround = r[8] === 1;
  const squawk = r[10] ?? undefined;
  return {
    hex: r[0], callsign: r[1] ?? undefined, lat: r[2], lon: r[3], altBaro: r[4] ?? undefined, gs: r[5] ?? undefined, track: r[6] ?? undefined, vr: r[7] ?? undefined,
    onGround, squawk, emergency: emergencyFromSquawk(squawk),
    category: classifyAircraft({ callsign: r[1] ?? undefined, type: undefined, emitter: undefined, military: false, onGround, desc: undefined, reg: undefined }),
    military: false, source: POSITION_SOURCES[r[9]] ?? 'other', feed: 'playback', seen: 0, seenPos: 0, ts,
  };
}

/** Index of the last frame whose ts ≤ t (−1 when t precedes all frames). */
export function frameIndexAt(frames: PlaybackFrame[], t: number): number {
  let lo = 0, hi = frames.length - 1, ans = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (frames[mid].ts <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
  return ans;
}

function rowMap(f: PlaybackFrame | undefined): Map<string, Row> {
  const m = new Map<string, Row>();
  if (f) for (const r of f.rows) m.set(r[0], r);
  return m;
}

function lerpRow(a: Row, b: Row | undefined, f: number): [number, number, number, number] {
  if (!b || f <= 0) return [a[2], a[3], a[6] ?? 0, a[4] ?? 0];
  const dh = headingDelta(a[6] ?? 0, b[6] ?? a[6] ?? 0);
  return [a[2] + (b[2] - a[2]) * f, a[3] + (b[3] - a[3]) * f, ((a[6] ?? 0) + dh * f + 360) % 360, (a[4] ?? 0) + ((b[4] ?? a[4] ?? 0) - (a[4] ?? 0)) * f];
}

/**
 * Items for replay time `t` (ms). Each item's p0 is the position at `t`, p1 the position at
 * `t + horizonMs*speed` (replay-time), mapped onto wall-clock [now, now + horizonMs] so the GL layer
 * animates smoothly between engine ticks.
 */
export function itemsAt(frames: PlaybackFrame[], t: number, speed: number, horizonMs: number, selectedHex: string | null, playing: boolean): { items: LayerItem[]; count: number } {
  const i = frameIndexAt(frames, t);
  if (i < 0) return { items: [], count: 0 };
  const cur = frames[i], next = frames[i + 1];
  const nextRows = rowMap(next);
  const span = next ? next.ts - cur.ts : 1;
  const f0 = next ? Math.min(1, (t - cur.ts) / span) : 0;
  const tEnd = t + horizonMs * speed;
  const f1 = next ? Math.min(1, (tEnd - cur.ts) / span) : 0;
  const now = performance.now();
  const items: LayerItem[] = [];
  const maxAge = Math.max(span * 2, 60_000);
  for (const r of cur.rows) {
    // Skip aircraft whose last report is long before t (gap), unless they appear in the next frame.
    if (!nextRows.has(r[0]) && t - cur.ts > maxAge) continue;
    const nr = nextRows.get(r[0]);
    const p0 = lerpRow(r, nr, f0), p1 = playing ? lerpRow(r, nr, f1) : p0;
    const st = styleFor(rowToState(r, cur.ts), r[0] === selectedHex);
    items.push({ hex: r[0], p0, p1, t0: now, t1: now + horizonMs, kind: st.kind, color: st.color, scale: st.scale, highlight: st.highlight });
    setLabelText(r[0], r[1] ?? undefined);
  }
  return { items, count: items.length };
}

/** Trail of one aircraft from the start of the loaded range up to time t. */
export function trailUpTo(frames: PlaybackFrame[], hex: string, t: number): { lat: number; lon: number; alt?: number; ts: number }[] {
  const out: { lat: number; lon: number; alt?: number; ts: number }[] = [];
  for (const f of frames) {
    if (f.ts > t) break;
    const r = f.rows.find((x) => x[0] === hex);
    if (r) out.push({ lat: r[2], lon: r[3], alt: r[4] ?? undefined, ts: f.ts });
  }
  return out;
}

export function stateAt(frames: PlaybackFrame[], hex: string, t: number): AircraftState | null {
  const i = frameIndexAt(frames, t);
  for (let k = i; k >= 0 && k > i - 30; k--) {
    const r = frames[k].rows.find((x) => x[0] === hex);
    if (r) return rowToState(r, frames[k].ts);
  }
  return null;
}

export const SPEEDS = [1, 5, 10, 30, 60, 120];

export function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
