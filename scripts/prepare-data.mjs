#!/usr/bin/env node
/**
 * Prepares the reference datasets bundled with the server:
 *   - OurAirports airports/runways/navaids (filtered to keep the repo small)
 *   - VATSpy FIR boundaries (coordinates rounded, properties trimmed)
 *
 * Usage: node scripts/prepare-data.mjs [--src <dir-with-csvs>] [--download]
 * With --download the upstream files are fetched into a temp dir first.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parse } from 'csv-parse/sync';

const args = process.argv.slice(2);
const getArg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const download = args.includes('--download');
let src = getArg('--src');
const outDir = path.resolve('packages/server/data');
fs.mkdirSync(outDir, { recursive: true });

const UPSTREAM = {
  'airports.csv': 'https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/airports.csv',
  'runways.csv': 'https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/runways.csv',
  'navaids.csv': 'https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/navaids.csv',
  'Boundaries.geojson': 'https://raw.githubusercontent.com/vatsimnetwork/vatspy-data-project/master/Boundaries.geojson',
};

if (download) {
  src = fs.mkdtempSync(path.join(os.tmpdir(), 'contrail-data-'));
  for (const [name, url] of Object.entries(UPSTREAM)) {
    process.stdout.write(`downloading ${name}… `);
    const res = await fetch(url, { headers: { 'user-agent': 'contrail-data-prep/0.1' } });
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    fs.writeFileSync(path.join(src, name), Buffer.from(await res.arrayBuffer()));
    console.log('ok');
  }
}
if (!src) { console.error('pass --src <dir> or --download'); process.exit(1); }

const read = (f) => fs.readFileSync(path.join(src, f), 'utf8');
const csv = (f) => parse(read(f), { columns: true, skip_empty_lines: true, relax_column_count: true });
const esc = (v) => (v === undefined || v === null || v === '' ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const writeCsv = (file, cols, rows) => {
  const out = [cols.join(',')];
  for (const r of rows) out.push(cols.map((c) => esc(r[c])).join(','));
  fs.writeFileSync(path.join(outDir, file), out.join('\n') + '\n');
  console.log(`${file}: ${rows.length} rows, ${(fs.statSync(path.join(outDir, file)).size / 1024).toFixed(0)} KB`);
};

// Airports: keep everything with an IATA code, all large/medium, and small airports with scheduled service.
const airports = csv('airports.csv').filter((a) =>
  a.type === 'large_airport' || a.type === 'medium_airport' || a.iata_code ||
  (a.type === 'small_airport' && a.scheduled_service === 'yes'));
const keep = new Set(airports.map((a) => a.ident));
writeCsv('airports.csv', ['id', 'ident', 'type', 'name', 'latitude_deg', 'longitude_deg', 'elevation_ft', 'continent', 'iso_country', 'iso_region', 'municipality', 'scheduled_service', 'icao_code', 'iata_code', 'gps_code', 'local_code', 'home_link', 'wikipedia_link'],
  airports.map((a) => ({ ...a, latitude_deg: Number(a.latitude_deg).toFixed(5), longitude_deg: Number(a.longitude_deg).toFixed(5) })));

const runways = csv('runways.csv').filter((r) => keep.has(r.airport_ident) && r.closed !== '1');
writeCsv('runways.csv', ['airport_ident', 'length_ft', 'width_ft', 'surface', 'lighted', 'closed', 'le_ident', 'le_latitude_deg', 'le_longitude_deg', 'le_elevation_ft', 'le_heading_degT', 'he_ident', 'he_latitude_deg', 'he_longitude_deg', 'he_elevation_ft', 'he_heading_degT'], runways);

const navaids = csv('navaids.csv').filter((n) => n.latitude_deg && n.longitude_deg);
writeCsv('navaids.csv', ['ident', 'name', 'type', 'frequency_khz', 'latitude_deg', 'longitude_deg', 'elevation_ft', 'iso_country', 'associated_airport'],
  navaids.map((n) => ({ ...n, latitude_deg: Number(n.latitude_deg).toFixed(4), longitude_deg: Number(n.longitude_deg).toFixed(4) })));

// FIR boundaries: round coordinates to 2 decimals (~1 km) and keep only the id/oceanic flags.
const fir = JSON.parse(read('Boundaries.geojson'));
const round = (c) => Array.isArray(c[0]) ? c.map(round) : [Math.round(c[0] * 100) / 100, Math.round(c[1] * 100) / 100];
const dedupe = (ring) => ring.filter((p, i) => i === 0 || p[0] !== ring[i - 1][0] || p[1] !== ring[i - 1][1]);
const simplify = (g) => {
  if (g.type === 'Polygon') return { type: 'Polygon', coordinates: g.coordinates.map((r) => dedupe(round(r))) };
  if (g.type === 'MultiPolygon') return { type: 'MultiPolygon', coordinates: g.coordinates.map((p) => p.map((r) => dedupe(round(r)))) };
  return g;
};
const firOut = {
  type: 'FeatureCollection',
  attribution: 'FIR boundaries © VATSpy Data Project contributors',
  features: fir.features.filter((f) => !String(f.properties.id).includes("-")).map((f) => ({
    type: 'Feature',
    properties: { id: f.properties.id, oceanic: f.properties.oceanic === '1' || f.properties.oceanic === 1, region: f.properties.region, division: f.properties.division },
    geometry: simplify(f.geometry),
  })),
};
fs.writeFileSync(path.join(outDir, 'fir-boundaries.geojson'), JSON.stringify(firOut));
console.log(`fir-boundaries.geojson: ${firOut.features.length} features, ${(fs.statSync(path.join(outDir, 'fir-boundaries.geojson')).size / 1024).toFixed(0)} KB`);
