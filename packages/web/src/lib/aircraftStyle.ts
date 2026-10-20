import type { AircraftState, IconKind } from '@contrail/shared';
import { ICON_SIZE, iconKindFor } from '@contrail/shared';

export type Rgba = [number, number, number, number];

const hex = (h: string, a = 1): Rgba => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255, a];

export const COLORS = {
  airborne: hex('#f5c542'),
  ground: hex('#8fa3bf'),
  military: hex('#9acd32'),
  helicopter: hex('#fb923c'),
  glider: hex('#a3e635'),
  private: hex('#fde68a'),
  cargo: hex('#f59e0b'),
  emergency: hex('#ef4444'),
  selected: hex('#38bdf8'),
  estimated: hex('#f5c542', 0.45),
  dimmed: hex('#64748b', 0.25),
};

export const CATEGORY_COLORS_CSS: Record<string, string> = {
  passenger: '#f5c542', cargo: '#f59e0b', military: '#9acd32', private: '#fde68a', helicopter: '#fb923c', glider: '#a3e635', ground: '#8fa3bf', unknown: '#f5c542',
};

export function styleFor(a: AircraftState, selected: boolean, iconScale = 1): { kind: IconKind; color: Rgba; scale: number; highlight: 'selected' | 'emergency' | 'none' } {
  const kind = iconKindFor(a);
  let color: Rgba;
  if (selected) color = COLORS.selected;
  else if (a.emergency !== 'none') color = COLORS.emergency;
  else if (a.onGround) color = COLORS.ground;
  else if (a.source === 'estimated') color = COLORS.estimated;
  else color = COLORS[(a.category in COLORS ? a.category : 'airborne') as keyof typeof COLORS] ?? COLORS.airborne;
  const scale = ICON_SIZE[kind] * iconScale * (selected ? 1.15 : 1);
  return { kind, color, scale, highlight: selected ? 'selected' : a.emergency !== 'none' ? 'emergency' : 'none' };
}

export function sourceLabel(s: AircraftState['source']): string {
  switch (s) {
    case 'adsb': return 'ADS-B';
    case 'mlat': return 'MLAT';
    case 'tisb': return 'TIS-B';
    case 'adsc': return 'ADS-C';
    case 'flarm': return 'FLARM';
    case 'estimated': return 'Estimated';
    default: return 'Other';
  }
}

export function sourceColor(s: AircraftState['source']): string {
  switch (s) {
    case 'adsb': return '#22c55e';
    case 'mlat': return '#38bdf8';
    case 'tisb': return '#a78bfa';
    case 'adsc': return '#f472b6';
    case 'flarm': return '#2dd4bf';
    case 'estimated': return '#f59e0b';
    default: return '#94a3b8';
  }
}
