import type { AircraftCategory, AircraftState } from './types.js';
import { aircraftTypeInfo } from './aircraftTypes.js';
import { airlineByIcao, parseCallsign } from './airlines.js';

/**
 * ADS-B emitter category → broad category.
 *  A0 no info, A1 light (<15.5k lb), A2 small, A3 large, A4 high vortex large, A5 heavy,
 *  A6 high performance, A7 rotorcraft, B1 glider, B2 lighter-than-air, B3 parachutist,
 *  B4 ultralight, B6 UAV, B7 space, C1 emergency vehicle, C2 service vehicle, C3 point obstacle...
 */
export function categoryFromEmitter(emitter?: string): AircraftCategory | undefined {
  if (!emitter) return undefined;
  switch (emitter.toUpperCase()) {
    case 'A7': return 'helicopter';
    case 'B1': return 'glider';
    case 'B2': case 'B4': return 'private';
    case 'C1': case 'C2': return 'ground';
    case 'A1': return 'private';
    case 'A6': return 'military';
    default: return undefined;
  }
}

/** Decide the product category from everything we know. */
export function classifyAircraft(a: Pick<AircraftState, 'callsign' | 'type' | 'emitter' | 'military' | 'onGround' | 'desc' | 'reg'>): AircraftCategory {
  const emitterCat = categoryFromEmitter(a.emitter);
  if (emitterCat === 'ground') return 'ground';
  if (emitterCat === 'helicopter' || emitterCat === 'glider') return emitterCat;

  const typeInfo = aircraftTypeInfo(a.type);
  if (typeInfo?.wtc === 'rotor') return 'helicopter';
  if (typeInfo?.wtc === 'glider') return 'glider';

  const parsed = parseCallsign(a.callsign);
  if (a.military || parsed.military) return 'military';

  const airline = parsed.airline ?? airlineByIcao(parsed.operator);
  if (airline) return airline.cargo ? 'cargo' : 'passenger';
  if (typeInfo?.airliner) return 'passenger';

  if (emitterCat === 'private' || emitterCat === 'military') return emitterCat;
  if (typeInfo && (typeInfo.wtc === 'light' || !typeInfo.airliner)) return 'private';

  // Airline-style callsign with an operator we do not know: assume commercial.
  if (parsed.operator && parsed.number) return 'passenger';
  if (a.emitter && /^A[2-5]$/i.test(a.emitter)) return 'passenger';
  return 'unknown';
}

/** Icon family for rendering (atlas key). */
export type IconKind = 'jet' | 'heavy' | 'prop' | 'light' | 'heli' | 'glider' | 'ground' | 'military';

export function iconKindFor(a: Pick<AircraftState, 'category' | 'type' | 'emitter'>): IconKind {
  switch (a.category) {
    case 'helicopter': return 'heli';
    case 'glider': return 'glider';
    case 'ground': return 'ground';
    case 'military': return 'military';
  }
  const t = aircraftTypeInfo(a.type);
  if (t) {
    if (t.wtc === 'heavy' || t.wtc === 'super') return 'heavy';
    if (t.engines === 'turboprop' || t.engines === 'piston') return t.wtc === 'light' ? 'light' : 'prop';
    return 'jet';
  }
  const e = a.emitter?.toUpperCase();
  if (e === 'A5' || e === 'A4') return 'heavy';
  if (e === 'A1') return 'light';
  if (e === 'A2') return 'prop';
  return 'jet';
}

export const ICON_KINDS: IconKind[] = ['jet', 'heavy', 'prop', 'light', 'heli', 'glider', 'ground', 'military'];

/** Relative on-screen size multiplier per icon kind. */
export const ICON_SIZE: Record<IconKind, number> = {
  heavy: 1.35,
  jet: 1.0,
  military: 1.05,
  prop: 0.85,
  light: 0.7,
  heli: 0.75,
  glider: 0.7,
  ground: 0.55,
};
