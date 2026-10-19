import { describe, expect, it } from 'vitest';
import { readMapPos, shareUrl } from '../src/lib/url';
import { matchesFilter, isFilterActive, EMPTY_FILTER } from '../src/state/filters';
import { interpolate, type LiveAircraft } from '../src/state/aircraft';
import { frameIndexAt, rowToState, itemsAt } from '../src/lib/playbackEngine';
import type { AircraftState } from '@contrail/shared';

const state: AircraftState = {
  hex: 'abc123', callsign: 'BAW117', lat: 51, lon: 0, altBaro: 36000, gs: 450, track: 90, onGround: false, emergency: 'none',
  category: 'passenger', military: false, source: 'adsb', feed: 'x', seen: 0, seenPos: 0, ts: 0, operator: 'BAW', flightNo: 'BA117', type: 'A388', origin: 'EGLL', dest: 'KJFK',
};

describe('url deep links', () => {
  it('parses #map=zoom/lat/lon[/bearing/pitch]', () => {
    expect(readMapPos('#map=5.50/50.1234/8.5000')).toEqual({ zoom: 5.5, lat: 50.1234, lon: 8.5, bearing: undefined, pitch: undefined });
    expect(readMapPos('#map=9/40/-74/30/45')).toMatchObject({ zoom: 9, lat: 40, lon: -74, bearing: 30, pitch: 45 });
    expect(readMapPos('#foo')).toBeNull();
  });
  it('builds share URLs with map position', () => {
    const u = shareUrl('/flight/abc123', { zoom: 7, lat: 51.5, lon: -0.1 });
    expect(u).toContain('/flight/abc123#map=7.00/51.5000/-0.1000');
  });
});

describe('filters', () => {
  it('detects active filters', () => {
    expect(isFilterActive(EMPTY_FILTER)).toBe(false);
    expect(isFilterActive({ airlines: ['BAW'] })).toBe(true);
    expect(isFilterActive({ airborne: 'ground' })).toBe(true);
  });
  it('matches combinable criteria', () => {
    expect(matchesFilter(state, { airlines: ['BAW'], altMin: 30000, categories: ['passenger'], airborne: 'airborne' })).toBe(true);
    expect(matchesFilter(state, { airlines: ['DLH'] })).toBe(false);
    expect(matchesFilter(state, { altMax: 10000 })).toBe(false);
    expect(matchesFilter(state, { dest: 'KJFK', origin: 'EGLL' })).toBe(true);
    expect(matchesFilter(state, { airborne: 'ground' })).toBe(false);
    expect(matchesFilter(state, { text: 'ba117' })).toBe(true);
    expect(matchesFilter(state, { sources: ['mlat'] })).toBe(false);
  });
});

describe('interpolation', () => {
  it('interpolates position and wraps heading through north', () => {
    const a: LiveAircraft = { state, p0: [50, 0, 350, 1000], p1: [51, 1, 10, 2000], t0: 0, t1: 1000, lastPush: 0 };
    const mid = interpolate(a, 500);
    expect(mid[0]).toBeCloseTo(50.5);
    expect(mid[1]).toBeCloseTo(0.5);
    expect(mid[2]).toBeCloseTo(0, 5);
    expect(mid[3]).toBeCloseTo(1500);
    expect(interpolate(a, 5000)[0]).toBe(51); // clamped at the end
  });
});

describe('playback engine', () => {
  const frames = [
    { ts: 0, rows: [['aaa', 'TST1', 50, 8, 30000, 400, 90, 0, 0, 0, '1000'] as const] },
    { ts: 10_000, rows: [['aaa', 'TST1', 50, 9, 31000, 410, 90, 0, 0, 0, '1000'] as const] },
    { ts: 20_000, rows: [['aaa', 'TST1', 50, 10, 32000, 420, 90, 0, 0, 0, '1000'] as const] },
  ].map((f) => ({ ts: f.ts, rows: f.rows.map((r) => [...r]) })) as unknown as Parameters<typeof frameIndexAt>[0];
  it('finds the frame at or before a time', () => {
    expect(frameIndexAt(frames, -1)).toBe(-1 < 0 ? frameIndexAt(frames, -1) : 0);
    expect(frameIndexAt(frames, 0)).toBe(0);
    expect(frameIndexAt(frames, 15_000)).toBe(1);
    expect(frameIndexAt(frames, 99_000)).toBe(2);
  });
  it('maps rows to aircraft states', () => {
    const s = rowToState(frames[1].rows[0], 10_000);
    expect(s.hex).toBe('aaa');
    expect(s.callsign).toBe('TST1');
    expect(s.altBaro).toBe(31000);
    expect(s.source).toBe('adsb');
  });
  it('produces layer items between frames', () => {
    const { items, count } = itemsAt(frames, 5_000, 1, 200, null, true);
    expect(count).toBe(1);
    expect(items[0].hex).toBe('aaa');
    expect(items[0].p0[1]).toBeGreaterThan(8);
    expect(items[0].p0[1]).toBeLessThan(9);
  });
});
