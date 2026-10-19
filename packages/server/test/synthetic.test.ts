import { describe, expect, it, beforeAll } from 'vitest';
import { reference } from '../src/data/reference.js';
import { SyntheticAdapter } from '../src/feeds/synthetic.js';

describe('synthetic feed', () => {
  beforeAll(async () => { await reference.load(); });

  it('generates deterministic, plausible traffic', async () => {
    const a = new SyntheticAdapter(300, 7);
    await a.init();
    const r1 = await a.poll([]);
    expect(r1.aircraft.length).toBeGreaterThan(200);
    for (const ac of r1.aircraft) {
      expect(ac.lat).toBeGreaterThanOrEqual(-90); expect(ac.lat).toBeLessThanOrEqual(90);
      expect(ac.lon).toBeGreaterThanOrEqual(-180); expect(ac.lon).toBeLessThanOrEqual(180);
      if (!ac.onGround) expect(ac.altBaro).toBeGreaterThan(0);
      expect(ac.hex).toMatch(/^[0-9a-f]{6}$/);
    }
    const b = new SyntheticAdapter(300, 7);
    await b.init();
    const r2 = await b.poll([]);
    expect(r2.aircraft.map((x) => x.hex).sort()).toEqual(r1.aircraft.map((x) => x.hex).sort());
  });

  it('includes a mix of categories and sources', async () => {
    const a = new SyntheticAdapter(600, 3);
    await a.init();
    const r = await a.poll([]);
    const emitters = new Set(r.aircraft.map((x) => x.emitter));
    expect(emitters.has('A7')).toBe(true); // helicopters
    expect(emitters.has('C1') || emitters.has('C2')).toBe(true); // ground vehicles
    const sources = new Set(r.aircraft.map((x) => x.source));
    expect(sources.has('adsb')).toBe(true);
    expect(sources.has('mlat')).toBe(true);
    expect(r.aircraft.some((x) => x.origin && x.dest)).toBe(true);
  });
});
