import { describe, expect, it } from 'vitest';
import { parseCallsign, classifyAircraft, iconKindFor, emergencyFromSquawk, encodeFull, decodeFull, encodePos, decodePos, altitudeColor, formatAltitude, formatSpeed, type AircraftState } from '../src/index.js';

const base: AircraftState = {
  hex: 'abc123', callsign: 'BAW117', lat: 51.47, lon: -0.46, altBaro: 36000, gs: 450, track: 275.4, vr: -64, squawk: '2201',
  onGround: false, emergency: 'none', category: 'passenger', military: false, source: 'adsb', feed: 'adsblol', seen: 1, seenPos: 1.2, ts: 1700000000000,
  reg: 'G-XLEA', type: 'A388', operator: 'BAW', flightNo: 'BA117', origin: 'EGLL', dest: 'KJFK',
};

describe('callsign parsing', () => {
  it('parses airline callsigns into operator and IATA flight number', () => {
    const p = parseCallsign('BAW117');
    expect(p.operator).toBe('BAW');
    expect(p.flightNo).toBe('BA117');
    expect(p.airline?.name).toBe('British Airways');
    expect(p.military).toBe(false);
  });
  it('detects military prefixes', () => {
    expect(parseCallsign('RCH472').military).toBe(true);
    expect(parseCallsign('RRR7221').military).toBe(true);
  });
  it('handles registrations as callsigns', () => {
    const p = parseCallsign('N12345');
    expect(p.flightNo).toBeUndefined();
  });
});

describe('classification', () => {
  it('classifies cargo operators', () => {
    expect(classifyAircraft({ callsign: 'FDX12', type: 'B77L', military: false, onGround: false })).toBe('cargo');
  });
  it('classifies helicopters by type and emitter', () => {
    expect(classifyAircraft({ callsign: 'GXYZ', type: 'EC35', military: false, onGround: false })).toBe('helicopter');
    expect(classifyAircraft({ emitter: 'A7', military: false, onGround: false })).toBe('helicopter');
  });
  it('classifies ground vehicles and gliders from emitter category', () => {
    expect(classifyAircraft({ emitter: 'C2', military: false, onGround: true })).toBe('ground');
    expect(classifyAircraft({ emitter: 'B1', military: false, onGround: false })).toBe('glider');
  });
  it('classifies GA as private', () => {
    expect(classifyAircraft({ callsign: 'N172SP', type: 'C172', military: false, onGround: false })).toBe('private');
  });
  it('picks icon kinds', () => {
    expect(iconKindFor({ category: 'passenger', type: 'A388' })).toBe('heavy');
    expect(iconKindFor({ category: 'passenger', type: 'A320' })).toBe('jet');
    expect(iconKindFor({ category: 'private', type: 'C172' })).toBe('light');
    expect(iconKindFor({ category: 'passenger', type: 'DH8D' })).toBe('prop');
  });
});

describe('squawk', () => {
  it('maps emergency squawks', () => {
    expect(emergencyFromSquawk('7700')).toBe('general');
    expect(emergencyFromSquawk('7600')).toBe('nordo');
    expect(emergencyFromSquawk('7500')).toBe('unlawful');
    expect(emergencyFromSquawk('1200')).toBe('none');
  });
});

describe('wire format', () => {
  it('round-trips full rows', () => {
    const row = encodeFull(base);
    const back = decodeFull(row);
    expect(back.hex).toBe('abc123');
    expect(back.callsign).toBe('BAW117');
    expect(back.lat).toBeCloseTo(51.47, 4);
    expect(back.altBaro).toBe(36000);
    expect(back.track).toBe(275);
    expect(back.category).toBe('passenger');
    expect(back.source).toBe('adsb');
    expect(back.origin).toBe('EGLL');
    expect(back.feed).toBe('adsblol');
  });
  it('round-trips position rows with flags', () => {
    const row = encodePos({ ...base, onGround: true, military: true, emergency: 'general' });
    const back = decodePos(row);
    expect(back.onGround).toBe(true);
    expect(back.military).toBe(true);
    expect(back.emergency).toBe('general');
  });
});

describe('formatting', () => {
  it('altitude colour ramp interpolates', () => {
    expect(altitudeColor(0)).toEqual([255, 255, 255]);
    expect(altitudeColor(60000)).toEqual([120, 255, 160]);
    const mid = altitudeColor(15000);
    expect(mid.every((c) => c >= 0 && c <= 255)).toBe(true);
  });
  it('formats units', () => {
    expect(formatAltitude(36000, 'metric')).toBe('10,973 m');
    expect(formatSpeed(450, 'metric')).toBe('833 km/h');
    expect(formatSpeed(450, 'aviation')).toBe('450 kt');
  });
});
