import type { AircraftCategory, AircraftState, EmergencyKind, PositionSource } from './types.js';
import { AIRCRAFT_CATEGORIES, POSITION_SOURCES } from './types.js';

/**
 * Compact WebSocket wire format.
 *
 * Server → client messages:
 *   { t: 'hello', ts, feeds }                         on connect
 *   { t: 'snap', ts, full: FullRow[], }               snapshot for the current viewport
 *   { t: 'upd', ts, full: FullRow[], pos: PosRow[], rm: string[] }
 *   { t: 'sel', hex, trail: TrailRow[] }               trail for the selected aircraft
 *   { t: 'emerg', list: [...] }                        global emergency list
 *   { t: 'err', message }
 *
 * Client → server messages:
 *   { t: 'view', bbox: [w,s,e,n], zoom }
 *   { t: 'select', hex | null }
 *   { t: 'ping' }
 */

export const EMERGENCY_KINDS: EmergencyKind[] = ['none', 'general', 'lifeguard', 'minfuel', 'nordo', 'unlawful', 'downed', 'reserved'];

/** Flag bits packed into the position row. */
export const FLAG_ON_GROUND = 1;
export const FLAG_MILITARY = 2;
export const FLAG_EMERGENCY = 4;

/**
 * PosRow: [hex, lat, lon, altBaro, gs, track, vr, squawk, flags, sourceIdx, ts, seenPos, altGeom, heading, emergencyIdx]
 * nulls are encoded as null.
 */
export type PosRow = [
  string, number, number, number | null, number | null, number | null, number | null,
  string | null, number, number, number, number, number | null, number | null, number,
];

/** FullRow = PosRow followed by static fields: callsign, reg, type, desc, catIdx, emitter, operator, flightNo, origin, dest, feed */
export type FullRow = [
  ...PosRow,
  string | null, string | null, string | null, string | null, number, string | null,
  string | null, string | null, string | null, string | null, string,
];

export type TrailRow = [number, number, number, number | null, number | null, number | null, number | null];

export interface ServerHello { t: 'hello'; ts: number; feeds: string[]; version: string }
export interface ServerSnap { t: 'snap'; ts: number; full: FullRow[]; count: number }
export interface ServerUpd { t: 'upd'; ts: number; full: FullRow[]; pos: PosRow[]; rm: string[]; count: number }
export interface ServerSel { t: 'sel'; hex: string; trail: TrailRow[]; full?: FullRow }
export interface ServerEmerg { t: 'emerg'; list: { hex: string; callsign?: string; squawk?: string; emergency: EmergencyKind; lat: number; lon: number }[] }
export interface ServerErr { t: 'err'; message: string }
export interface ServerPong { t: 'pong'; ts: number }
export type ServerMessage = ServerHello | ServerSnap | ServerUpd | ServerSel | ServerEmerg | ServerErr | ServerPong;

export interface ClientView { t: 'view'; bbox: [number, number, number, number]; zoom: number }
export interface ClientSelect { t: 'select'; hex: string | null }
export interface ClientPing { t: 'ping'; ts?: number }
export type ClientMessage = ClientView | ClientSelect | ClientPing;

const num = (v: number | undefined): number | null => (v === undefined || v === null || Number.isNaN(v) ? null : Math.round(v * 1e5) / 1e5);
const int = (v: number | undefined): number | null => (v === undefined || v === null || Number.isNaN(v) ? null : Math.round(v));

export function flagsOf(a: AircraftState): number {
  return (a.onGround ? FLAG_ON_GROUND : 0) | (a.military ? FLAG_MILITARY : 0) | (a.emergency !== 'none' ? FLAG_EMERGENCY : 0);
}

export function encodePos(a: AircraftState): PosRow {
  return [
    a.hex, num(a.lat)!, num(a.lon)!, int(a.altBaro), int(a.gs), int(a.track), int(a.vr),
    a.squawk ?? null, flagsOf(a), POSITION_SOURCES.indexOf(a.source), a.ts, Math.round(a.seenPos * 10) / 10,
    int(a.altGeom), int(a.heading), EMERGENCY_KINDS.indexOf(a.emergency),
  ];
}

export function encodeFull(a: AircraftState): FullRow {
  return [
    ...encodePos(a),
    a.callsign ?? null, a.reg ?? null, a.type ?? null, a.desc ?? null,
    AIRCRAFT_CATEGORIES.indexOf(a.category), a.emitter ?? null, a.operator ?? null, a.flightNo ?? null,
    a.origin ?? null, a.dest ?? null, a.feed,
  ];
}

/** Cheap hash of the static fields so the server knows when to re-send a FullRow. */
export function staticHash(a: AircraftState): string {
  return `${a.callsign ?? ''}|${a.reg ?? ''}|${a.type ?? ''}|${a.category}|${a.operator ?? ''}|${a.origin ?? ''}|${a.dest ?? ''}|${a.feed}|${a.desc ?? ''}`;
}

export function decodePos(row: PosRow, into?: Partial<AircraftState>): Partial<AircraftState> {
  const a: Partial<AircraftState> = into ?? {};
  a.hex = row[0];
  a.lat = row[1];
  a.lon = row[2];
  a.altBaro = row[3] ?? undefined;
  a.gs = row[4] ?? undefined;
  a.track = row[5] ?? undefined;
  a.vr = row[6] ?? undefined;
  a.squawk = row[7] ?? undefined;
  a.onGround = !!(row[8] & FLAG_ON_GROUND);
  a.military = !!(row[8] & FLAG_MILITARY);
  a.source = (POSITION_SOURCES[row[9]] ?? 'other') as PositionSource;
  a.ts = row[10];
  a.seenPos = row[11];
  a.altGeom = row[12] ?? undefined;
  a.heading = row[13] ?? undefined;
  a.emergency = EMERGENCY_KINDS[row[14]] ?? 'none';
  return a;
}

export function decodeFull(row: FullRow): AircraftState {
  const a = decodePos(row as unknown as PosRow) as AircraftState;
  a.callsign = row[15] ?? undefined;
  a.reg = row[16] ?? undefined;
  a.type = row[17] ?? undefined;
  a.desc = row[18] ?? undefined;
  a.category = (AIRCRAFT_CATEGORIES[row[19]] ?? 'unknown') as AircraftCategory;
  a.emitter = row[20] ?? undefined;
  a.operator = row[21] ?? undefined;
  a.flightNo = row[22] ?? undefined;
  a.origin = row[23] ?? undefined;
  a.dest = row[24] ?? undefined;
  a.feed = row[25];
  a.seen = a.seenPos;
  return a;
}
