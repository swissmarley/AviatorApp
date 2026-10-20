import { beforeAll, describe, expect, it } from 'vitest';
import { AircraftStore } from '../src/store/aircraftStore.js';
import { mapReadsbAircraft, sourceFromReadsbType } from '../src/feeds/readsb.js';

describe('readsb mapping', () => {
  it('maps a tar1090-style aircraft', () => {
    const a = mapReadsbAircraft({ hex: 'ABC123', type: 'adsb_icao', flight: 'DLH4YA  ', r: 'D-AIZZ', t: 'A320', alt_baro: 35000, gs: 440, track: 120, baro_rate: -640, squawk: '1000', category: 'A3', lat: 50.1, lon: 8.6, seen_pos: 0.4, seen: 0.1, dbFlags: 0 }, 1_700_000_000_000, 'adsblol');
    expect(a).not.toBeNull();
    expect(a!.hex).toBe('abc123');
    expect(a!.callsign).toBe('DLH4YA');
    expect(a!.source).toBe('adsb');
    expect(a!.onGround).toBe(false);
    expect(a!.vr).toBe(-640);
    expect(a!.ts).toBe(1_700_000_000_000 - 400);
  });
  it('handles ground and mlat', () => {
    const a = mapReadsbAircraft({ hex: 'abc124', type: 'mlat', alt_baro: 'ground', lat: 1, lon: 2, mlat: ['lat', 'lon'], dbFlags: 1 }, 1, 'x');
    expect(a!.onGround).toBe(true);
    expect(a!.altBaro).toBe(0);
    expect(a!.source).toBe('mlat');
    expect(a!.military).toBe(true);
  });
  it('drops aircraft without a position', () => {
    expect(mapReadsbAircraft({ hex: 'abc125', type: 'mode_s' }, 1, 'x')).toBeNull();
  });
  it('maps source types', () => {
    expect(sourceFromReadsbType('adsb_icao')).toBe('adsb');
    expect(sourceFromReadsbType('adsr_icao')).toBe('adsb');
    expect(sourceFromReadsbType('tisb_trackfile')).toBe('tisb');
    expect(sourceFromReadsbType('adsc')).toBe('adsc');
    expect(sourceFromReadsbType(undefined, ['lat'])).toBe('mlat');
  });
});

describe('AircraftStore', () => {
  let store: AircraftStore;
  beforeAll(() => { store = new AircraftStore(); });

  it('ingests, classifies and emits appear', () => {
    const events: string[] = [];
    store.on((e) => events.push(e.type));
    const now = Date.now();
    store.ingest('adsblol', { ts: now, coverage: 'global', aircraft: [{ hex: 'aaa111', lat: 50, lon: 8, ts: now, source: 'adsb', onGround: false, callsign: 'BAW117', type: 'A388', altBaro: 36000, gs: 450, track: 270, squawk: '2201' }] });
    const a = store.get('aaa111')!;
    expect(a.category).toBe('passenger');
    expect(a.operator).toBe('BAW');
    expect(a.flightNo).toBe('BA117');
    expect(events).toContain('appear');
  });

  it('prefers newer positions and a better source at the same age', () => {
    const now = Date.now();
    store.ingest('opensky', { ts: now, coverage: 'global', aircraft: [{ hex: 'aaa111', lat: 50.1, lon: 8.1, ts: now - 10000, source: 'mlat', onGround: false }] });
    expect(store.get('aaa111')!.lat).toBe(50); // older report ignored
    store.ingest('opensky', { ts: now, coverage: 'global', aircraft: [{ hex: 'aaa111', lat: 50.2, lon: 8.2, ts: now + 2000, source: 'mlat', onGround: false }] });
    expect(store.get('aaa111')!.lat).toBe(50.2);
    expect(store.get('aaa111')!.source).toBe('mlat');
    store.ingest('adsblol', { ts: now, coverage: 'global', aircraft: [{ hex: 'aaa111', lat: 50.21, lon: 8.21, ts: now + 2100, source: 'adsb', onGround: false }] });
    expect(store.get('aaa111')!.source).toBe('adsb');
  });

  it('emits emergency, airborne and landed transitions', () => {
    const events: string[] = [];
    store.on((e) => events.push(e.type));
    const now = Date.now() + 5000;
    store.ingest('adsblol', { ts: now, coverage: 'global', aircraft: [{ hex: 'aaa111', lat: 50.3, lon: 8.3, ts: now, source: 'adsb', onGround: false, squawk: '7700' }] });
    expect(store.get('aaa111')!.emergency).toBe('general');
    expect(events).toContain('emergency');
    store.ingest('adsblol', { ts: now, coverage: 'global', aircraft: [{ hex: 'aaa111', lat: 50.3, lon: 8.3, ts: now + 1000, source: 'adsb', onGround: true, squawk: '1000' }] });
    expect(events).toContain('landed');
  });

  it('dead-reckons quiet airborne aircraft and marks them estimated', () => {
    const s = new AircraftStore();
    const past = Date.now() - 30_000;
    s.ingest('adsblol', { ts: past, coverage: 'global', aircraft: [{ hex: 'bbb222', lat: 40, lon: -74, ts: past, source: 'adsb', onGround: false, gs: 480, track: 90, altBaro: 35000 }] });
    s.tick();
    const a = s.get('bbb222')!;
    expect(a.source).toBe('estimated');
    expect(a.lon).toBeGreaterThan(-74); // moved east
    expect(a.lat).toBeCloseTo(40, 1);
  });

  it('expires stale aircraft', () => {
    const s = new AircraftStore();
    const past = Date.now() - 10 * 60_000;
    s.ingest('adsblol', { ts: past, coverage: 'global', aircraft: [{ hex: 'ccc333', lat: 40, lon: -74, ts: past, source: 'adsb', onGround: false }] });
    s.tick();
    expect(s.get('ccc333')).toBeUndefined();
  });

  it('searches live aircraft', () => {
    expect(store.search('BAW')[0]?.hex).toBe('aaa111');
    expect(store.search('BA117')[0]?.hex).toBe('aaa111');
    expect(store.search('zzz')).toHaveLength(0);
  });
});
