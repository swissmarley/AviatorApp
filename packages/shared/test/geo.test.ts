import { describe, expect, it } from 'vitest';
import { bboxContains, bearingDeg, destinationPoint, haversineKm, headingDelta, intermediatePoint, lookAngles, parseBBox, subsolarPoint, terminatorPolygon } from '../src/geo.js';

describe('geo', () => {
  it('haversine distance London→New York ≈ 5570 km', () => {
    expect(haversineKm(51.5074, -0.1278, 40.7128, -74.006)).toBeCloseTo(5570, -2);
  });
  it('bearing from equator north is 0', () => {
    expect(bearingDeg(0, 0, 10, 0)).toBeCloseTo(0, 1);
    expect(bearingDeg(0, 0, 0, 10)).toBeCloseTo(90, 1);
  });
  it('destination point round-trips with bearing/distance', () => {
    const [lat, lon] = destinationPoint(48.8566, 2.3522, 45, 100);
    expect(haversineKm(48.8566, 2.3522, lat, lon)).toBeCloseTo(100, 1);
    expect(bearingDeg(48.8566, 2.3522, lat, lon)).toBeCloseTo(45, 0);
  });
  it('intermediate point at f=0.5 is equidistant', () => {
    const [lat, lon] = intermediatePoint(51.5, -0.1, 40.7, -74, 0.5);
    const a = haversineKm(51.5, -0.1, lat, lon), b = haversineKm(40.7, -74, lat, lon);
    expect(Math.abs(a - b)).toBeLessThan(1);
  });
  it('heading delta wraps', () => {
    expect(headingDelta(350, 10)).toBe(20);
    expect(headingDelta(10, 350)).toBe(-20);
    expect(headingDelta(0, 180)).toBe(180);
  });
  it('bbox contains handles antimeridian crossing', () => {
    expect(bboxContains({ west: 170, east: -170, south: -10, north: 10 }, 0, 175)).toBe(true);
    expect(bboxContains({ west: 170, east: -170, south: -10, north: 10 }, 0, -175)).toBe(true);
    expect(bboxContains({ west: 170, east: -170, south: -10, north: 10 }, 0, 0)).toBe(false);
  });
  it('parseBBox validates', () => {
    expect(parseBBox('-10,40,20,60')).toEqual({ west: -10, south: 40, east: 20, north: 60 });
    expect(parseBBox('a,b,c,d')).toBeNull();
    expect(parseBBox('0,60,10,40')).toBeNull();
  });
  it('subsolar point near solstice/equinox is plausible', () => {
    const s = subsolarPoint(new Date('2026-06-21T12:00:00Z'));
    expect(s.lat).toBeCloseTo(23.4, 0);
    expect(Math.abs(s.lon)).toBeLessThan(5);
    const e = subsolarPoint(new Date('2026-03-20T12:00:00Z'));
    expect(Math.abs(e.lat)).toBeLessThan(1);
  });
  it('terminator polygon is a closed ring spanning the globe', () => {
    const ring = terminatorPolygon(new Date('2026-06-21T12:00:00Z'));
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    expect(ring.length).toBeGreaterThan(100);
  });
  it('look angles: target overhead has elevation ~90', () => {
    const la = lookAngles(50, 8, 0, 50.0001, 8, 10000);
    expect(la.elevation).toBeGreaterThan(85);
  });
});
