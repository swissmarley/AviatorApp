import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import type { Airport, AirportType, BBox, Navaid, Runway } from '@contrail/shared';
import { bboxContains, haversineKm } from '@contrail/shared';
import { config } from '../config.js';
import { log } from '../log.js';
import { fetchText } from '../services/http.js';

const UPSTREAM: Record<string, string> = {
  'airports.csv': 'https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/airports.csv',
  'runways.csv': 'https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/runways.csv',
  'navaids.csv': 'https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/navaids.csv',
};

class ReferenceData {
  airports: Airport[] = [];
  runways = new Map<string, Runway[]>();
  navaids: Navaid[] = [];
  private byIdent = new Map<string, Airport>();
  private byIata = new Map<string, Airport>();
  /** 2°×2° grid for fast nearest/bbox queries. */
  private grid = new Map<string, Airport[]>();
  private navGrid = new Map<string, Navaid[]>();
  private searchIndex: { key: string; airport: Airport }[] = [];

  async load(): Promise<void> {
    const dataDir = config.DATA_DIR;
    const cacheDir = path.join(dataDir, 'cache');
    if (config.OURAIRPORTS_REFRESH) {
      fs.mkdirSync(cacheDir, { recursive: true });
      for (const [name, url] of Object.entries(UPSTREAM)) {
        try {
          const text = await fetchText(url, { timeoutMs: 60000 });
          fs.writeFileSync(path.join(cacheDir, name), text);
          log.info({ name }, 'refreshed OurAirports dataset');
        } catch (err) {
          log.warn({ name, err: (err as Error).message }, 'OurAirports refresh failed, using bundled copy');
        }
      }
    }
    const read = (name: string) => {
      const cached = path.join(cacheDir, name);
      const file = fs.existsSync(cached) ? cached : path.join(dataDir, name);
      return parse(fs.readFileSync(file, 'utf8'), { columns: true, skip_empty_lines: true, relax_column_count: true }) as Record<string, string>[];
    };

    const num = (v: string | undefined) => (v === undefined || v === '' ? undefined : Number(v));
    this.airports = read('airports.csv')
      .filter((r) => r.latitude_deg && r.longitude_deg)
      .map((r) => ({
        id: Number(r.id),
        ident: r.ident,
        icao: r.icao_code || (/^[A-Z]{4}$/.test(r.ident) ? r.ident : undefined) || (/^[A-Z]{4}$/.test(r.gps_code ?? '') ? r.gps_code : undefined),
        iata: r.iata_code || undefined,
        name: r.name,
        type: r.type as AirportType,
        lat: Number(r.latitude_deg),
        lon: Number(r.longitude_deg),
        elevationFt: num(r.elevation_ft),
        country: r.iso_country,
        region: r.iso_region || undefined,
        municipality: r.municipality || undefined,
        scheduledService: r.scheduled_service === 'yes',
        continent: r.continent || undefined,
        wikipedia: r.wikipedia_link || undefined,
        home: r.home_link || undefined,
      }));

    this.byIdent.clear(); this.byIata.clear(); this.grid.clear(); this.searchIndex = [];
    for (const a of this.airports) {
      this.byIdent.set(a.ident.toUpperCase(), a);
      if (a.icao) this.byIdent.set(a.icao.toUpperCase(), a);
      if (a.iata) this.byIata.set(a.iata.toUpperCase(), a);
      this.cell(this.grid, a.lat, a.lon).push(a);
      this.searchIndex.push({ key: `${a.icao ?? ''} ${a.iata ?? ''} ${a.name} ${a.municipality ?? ''}`.toLowerCase(), airport: a });
    }

    this.runways.clear();
    for (const r of read('runways.csv')) {
      if (r.closed === '1') continue;
      const rw: Runway = {
        airportIdent: r.airport_ident,
        lengthFt: num(r.length_ft), widthFt: num(r.width_ft), surface: r.surface || undefined,
        lighted: r.lighted === '1', closed: r.closed === '1',
        leIdent: r.le_ident || undefined, leLat: num(r.le_latitude_deg), leLon: num(r.le_longitude_deg), leHeading: num(r.le_heading_degT), leElevationFt: num(r.le_elevation_ft),
        heIdent: r.he_ident || undefined, heLat: num(r.he_latitude_deg), heLon: num(r.he_longitude_deg), heHeading: num(r.he_heading_degT), heElevationFt: num(r.he_elevation_ft),
      };
      const list = this.runways.get(r.airport_ident) ?? [];
      list.push(rw);
      this.runways.set(r.airport_ident, list);
    }

    this.navaids = read('navaids.csv')
      .filter((r) => r.latitude_deg && r.longitude_deg)
      .map((r) => ({
        ident: r.ident, name: r.name, type: r.type, frequencyKhz: num(r.frequency_khz),
        lat: Number(r.latitude_deg), lon: Number(r.longitude_deg), elevationFt: num(r.elevation_ft),
        country: r.iso_country || undefined, associatedAirport: r.associated_airport || undefined,
      }));
    this.navGrid.clear();
    for (const n of this.navaids) this.cell(this.navGrid, n.lat, n.lon).push(n);

    log.info({ airports: this.airports.length, runways: this.runways.size, navaids: this.navaids.length }, 'reference data loaded');
  }

  private cell<T>(grid: Map<string, T[]>, lat: number, lon: number): T[] {
    const key = `${Math.floor(lat / 2)}:${Math.floor(lon / 2)}`;
    let list = grid.get(key);
    if (!list) { list = []; grid.set(key, list); }
    return list;
  }

  airport(code?: string): Airport | undefined {
    if (!code) return undefined;
    const c = code.toUpperCase();
    return this.byIdent.get(c) ?? this.byIata.get(c);
  }

  airportByIata(iata?: string): Airport | undefined {
    return iata ? this.byIata.get(iata.toUpperCase()) : undefined;
  }

  runwaysFor(ident: string): Runway[] {
    const a = this.airport(ident);
    return (a && this.runways.get(a.ident)) ?? [];
  }

  inBBox(b: BBox, minType: AirportType[] = ['large_airport', 'medium_airport', 'small_airport']): Airport[] {
    const types = new Set(minType);
    const out: Airport[] = [];
    for (const a of this.airports) if (types.has(a.type) && bboxContains(b, a.lat, a.lon)) out.push(a);
    return out;
  }

  navaidsInBBox(b: BBox): Navaid[] {
    const out: Navaid[] = [];
    for (const n of this.navaids) if (bboxContains(b, n.lat, n.lon)) out.push(n);
    return out;
  }

  /** Nearest airport (optionally of given types) within maxKm. */
  nearest(lat: number, lon: number, maxKm = 30, types?: AirportType[]): { airport: Airport; distKm: number } | undefined {
    let best: { airport: Airport; distKm: number } | undefined;
    const span = Math.ceil(maxKm / 200) + 1;
    const cy = Math.floor(lat / 2), cx = Math.floor(lon / 2);
    for (let dy = -span; dy <= span; dy++) {
      for (let dx = -span; dx <= span; dx++) {
        const list = this.grid.get(`${cy + dy}:${cx + dx}`);
        if (!list) continue;
        for (const a of list) {
          if (types && !types.includes(a.type)) continue;
          const d = haversineKm(lat, lon, a.lat, a.lon);
          if (d <= maxKm && (!best || d < best.distKm)) best = { airport: a, distKm: d };
        }
      }
    }
    return best;
  }

  search(q: string, limit = 10): Airport[] {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    const exact = this.airport(s);
    const out: Airport[] = exact ? [exact] : [];
    const rank = (a: Airport) => (a.type === 'large_airport' ? 0 : a.type === 'medium_airport' ? 1 : 2);
    const matches = this.searchIndex
      .filter((e) => e.key.includes(s) && e.airport !== exact)
      .map((e) => e.airport)
      .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
    return out.concat(matches).slice(0, limit);
  }

  majorAirports(limit = 300): Airport[] {
    return this.airports.filter((a) => a.type === 'large_airport' && a.scheduledService).slice(0, limit);
  }
}

export const reference = new ReferenceData();
