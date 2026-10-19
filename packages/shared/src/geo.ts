import type { BBox } from './types.js';

export const EARTH_RADIUS_KM = 6371.0088;
export const KM_PER_NM = 1.852;
export const FT_PER_M = 3.28084;
export const KT_PER_MS = 1.943844;

export const toRad = (d: number) => (d * Math.PI) / 180;
export const toDeg = (r: number) => (r * 180) / Math.PI;

/** Great-circle distance in km. */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Initial bearing from point 1 to point 2, degrees 0..360. */
export function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const φ1 = toRad(lat1), φ2 = toRad(lat2), Δλ = toRad(lon2 - lon1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Destination point given start, bearing (deg) and distance (km). */
export function destinationPoint(lat: number, lon: number, bearing: number, distKm: number): [number, number] {
  const δ = distKm / EARTH_RADIUS_KM;
  const θ = toRad(bearing);
  const φ1 = toRad(lat), λ1 = toRad(lon);
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return [toDeg(φ2), ((toDeg(λ2) + 540) % 360) - 180];
}

/** Point along the great circle from A to B at fraction f (0..1). */
export function intermediatePoint(lat1: number, lon1: number, lat2: number, lon2: number, f: number): [number, number] {
  const φ1 = toRad(lat1), λ1 = toRad(lon1), φ2 = toRad(lat2), λ2 = toRad(lon2);
  const δ = haversineKm(lat1, lon1, lat2, lon2) / EARTH_RADIUS_KM;
  if (δ < 1e-9) return [lat1, lon1];
  const A = Math.sin((1 - f) * δ) / Math.sin(δ);
  const B = Math.sin(f * δ) / Math.sin(δ);
  const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
  const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
  const z = A * Math.sin(φ1) + B * Math.sin(φ2);
  return [toDeg(Math.atan2(z, Math.sqrt(x * x + y * y))), toDeg(Math.atan2(y, x))];
}

/** Sample a great-circle path into n+1 points. */
export function greatCirclePath(lat1: number, lon1: number, lat2: number, lon2: number, n = 64): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) pts.push(intermediatePoint(lat1, lon1, lat2, lon2, i / n));
  return pts;
}

export function normalizeLon(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

export function normalizeHeading(h: number): number {
  return ((h % 360) + 360) % 360;
}

/** Shortest signed angular difference b - a in degrees (-180..180]. */
export function headingDelta(a: number, b: number): number {
  let d = (b - a) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

export function bboxContains(b: BBox, lat: number, lon: number): boolean {
  if (lat < b.south || lat > b.north) return false;
  if (b.west <= b.east) return lon >= b.west && lon <= b.east;
  // bbox crosses the antimeridian
  return lon >= b.west || lon <= b.east;
}

export function expandBBox(b: BBox, factor: number): BBox {
  const dLat = (b.north - b.south) * (factor - 1) / 2;
  let width = b.east - b.west;
  if (width < 0) width += 360;
  const dLon = width * (factor - 1) / 2;
  return {
    west: Math.max(-180, b.west - dLon),
    east: Math.min(180, b.east + dLon),
    south: Math.max(-90, b.south - dLat),
    north: Math.min(90, b.north + dLat),
  };
}

export function parseBBox(s: string | undefined | null): BBox | null {
  if (!s) return null;
  const parts = s.split(',').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [west, south, east, north] = parts;
  if (south > north) return null;
  return { west, south, east, north };
}

export const kmToNm = (km: number) => km / KM_PER_NM;
export const nmToKm = (nm: number) => nm * KM_PER_NM;
export const ftToM = (ft: number) => ft / FT_PER_M;
export const mToFt = (m: number) => m * FT_PER_M;
export const ktToKmh = (kt: number) => kt * KM_PER_NM;
export const ktToMph = (kt: number) => kt * 1.150779;
export const msToKt = (ms: number) => ms * KT_PER_MS;
export const fpmToMs = (fpm: number) => fpm * 0.00508;

/**
 * Solar sub-point (lat, lon) for a given time — used for the day/night terminator and 3D lighting.
 * Accuracy ~0.5°, fine for display purposes.
 */
export function subsolarPoint(date: Date): { lat: number; lon: number } {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const n = jd - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = toRad((357.528 + 0.9856003 * n) % 360);
  const lambda = toRad(L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g));
  const eps = toRad(23.439 - 0.0000004 * n);
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  let ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  if (ra < 0) ra += 2 * Math.PI;
  const gmst = (18.697374558 + 24.06570982441908 * n) % 24;
  const gmstDeg = gmst * 15;
  const lon = normalizeLon(toDeg(ra) - gmstDeg);
  return { lat: toDeg(dec), lon };
}

/** Night-side polygon (as [lon, lat] ring) for the given time. */
export function terminatorPolygon(date: Date, steps = 180): [number, number][] {
  const sun = subsolarPoint(date);
  const ring: [number, number][] = [];
  const φs = toRad(sun.lat);
  for (let i = 0; i <= steps; i++) {
    const lon = -180 + (360 * i) / steps;
    const Δλ = toRad(lon - sun.lon);
    // latitude where solar elevation is zero: tan(φ) = -cos(Δλ) / tan(φs)
    const lat = toDeg(Math.atan(-Math.cos(Δλ) / Math.tan(φs || 1e-9)));
    ring.push([lon, lat]);
  }
  const polar = sun.lat > 0 ? -90 : 90;
  ring.push([180, polar], [-180, polar], ring[0]);
  return ring;
}

/** Azimuth/elevation of a target (lat, lon, alt m) from an observer (lat, lon, alt m). */
export function lookAngles(
  obsLat: number, obsLon: number, obsAltM: number,
  tgtLat: number, tgtLon: number, tgtAltM: number,
): { azimuth: number; elevation: number; distanceKm: number } {
  const distKm = haversineKm(obsLat, obsLon, tgtLat, tgtLon);
  const az = bearingDeg(obsLat, obsLon, tgtLat, tgtLon);
  const dAltKm = (tgtAltM - obsAltM) / 1000;
  // account for earth curvature drop over distance
  const drop = (distKm * distKm) / (2 * EARTH_RADIUS_KM);
  const el = toDeg(Math.atan2(dAltKm - drop, distKm));
  return { azimuth: az, elevation: el, distanceKm: Math.sqrt(distKm * distKm + dAltKm * dAltKm) };
}
