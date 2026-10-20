/** Where a position report came from. */
export type PositionSource =
  | 'adsb'      // ADS-B (1090ES / UAT)
  | 'mlat'      // multilateration
  | 'tisb'      // TIS-B rebroadcast
  | 'adsc'      // ADS-C (satellite)
  | 'flarm'
  | 'other'
  | 'estimated'; // dead-reckoned by Contrail because the feed went quiet

export const POSITION_SOURCES: PositionSource[] = ['adsb', 'mlat', 'tisb', 'adsc', 'flarm', 'other', 'estimated'];

/** Product-level category used for filtering and icon selection. */
export type AircraftCategory =
  | 'passenger'
  | 'cargo'
  | 'military'
  | 'private'
  | 'helicopter'
  | 'glider'
  | 'ground'
  | 'unknown';

export const AIRCRAFT_CATEGORIES: AircraftCategory[] = [
  'passenger', 'cargo', 'military', 'private', 'helicopter', 'glider', 'ground', 'unknown',
];

/** Emergency / special condition as reported by the transponder or derived from squawk. */
export type EmergencyKind = 'none' | 'general' | 'lifeguard' | 'minfuel' | 'nordo' | 'unlawful' | 'downed' | 'reserved';

export interface AircraftState {
  /** ICAO 24-bit address, lowercase hex. */
  hex: string;
  callsign?: string;
  /** Registration (tail number). */
  reg?: string;
  /** ICAO aircraft type designator, e.g. A320, B738. */
  type?: string;
  /** Free-text aircraft description, e.g. "Airbus A320-214". */
  desc?: string;
  /** ICAO airline code derived from callsign, e.g. BAW. */
  operator?: string;
  /** IATA-style flight number derived from callsign, e.g. BA117. */
  flightNo?: string;
  lat: number;
  lon: number;
  /** Barometric altitude in feet. */
  altBaro?: number;
  /** Geometric (GNSS) altitude in feet. */
  altGeom?: number;
  /** Ground speed in knots. */
  gs?: number;
  /** True airspeed in knots, when reported. */
  tas?: number;
  /** Ground track in degrees true. */
  track?: number;
  /** True heading in degrees, when reported. */
  heading?: number;
  /** Vertical rate in feet/min. */
  vr?: number;
  squawk?: string;
  onGround: boolean;
  emergency: EmergencyKind;
  category: AircraftCategory;
  /** ADS-B emitter category (A0-A7, B0-B7, C0-C7, D0-D7). */
  emitter?: string;
  military: boolean;
  source: PositionSource;
  /** Feed that produced this state: opensky | adsblol | airplaneslive | synthetic | playback */
  feed: string;
  /** Seconds since the last message of any kind. */
  seen: number;
  /** Seconds since the last position report. */
  seenPos: number;
  /** Position timestamp, ms since epoch. */
  ts: number;
  /** Signal strength in dBFS when the feed reports it. */
  rssi?: number;
  /** Origin airport ICAO (from route lookup). */
  origin?: string;
  /** Destination airport ICAO. */
  dest?: string;
  /** Turn rate in deg/s derived from consecutive tracks. */
  turnRate?: number;
}

export interface TrailPoint {
  ts: number;
  lat: number;
  lon: number;
  alt?: number;
  gs?: number;
  track?: number;
  vr?: number;
  source?: PositionSource;
}

export interface BBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

export type AirportType = 'large_airport' | 'medium_airport' | 'small_airport' | 'heliport' | 'seaplane_base' | 'balloonport' | 'closed';

export interface Airport {
  id: number;
  ident: string;
  icao?: string;
  iata?: string;
  name: string;
  type: AirportType;
  lat: number;
  lon: number;
  elevationFt?: number;
  country: string;
  region?: string;
  municipality?: string;
  scheduledService: boolean;
  continent?: string;
  wikipedia?: string;
  home?: string;
  tz?: string;
}

export interface Runway {
  airportIdent: string;
  lengthFt?: number;
  widthFt?: number;
  surface?: string;
  lighted: boolean;
  closed: boolean;
  leIdent?: string;
  leLat?: number;
  leLon?: number;
  leHeading?: number;
  leElevationFt?: number;
  heIdent?: string;
  heLat?: number;
  heLon?: number;
  heHeading?: number;
  heElevationFt?: number;
}

export interface Navaid {
  ident: string;
  name: string;
  type: string;
  frequencyKhz?: number;
  lat: number;
  lon: number;
  elevationFt?: number;
  country?: string;
  associatedAirport?: string;
}

export type FlightStatus =
  | 'scheduled'
  | 'boarding'
  | 'departed'
  | 'enroute'
  | 'landed'
  | 'arrived'
  | 'delayed'
  | 'cancelled'
  | 'diverted'
  | 'unknown';

export interface FlightLeg {
  airport: string;          // ICAO
  iata?: string;
  name?: string;
  scheduled?: string;       // ISO
  estimated?: string;
  actual?: string;
  terminal?: string;
  gate?: string;
  runway?: string;
  lat?: number;
  lon?: number;
}

export interface FlightInfo {
  callsign?: string;
  flightNo?: string;
  airline?: { icao?: string; iata?: string; name?: string };
  aircraft?: { reg?: string; type?: string; model?: string };
  departure?: FlightLeg;
  arrival?: FlightLeg;
  status: FlightStatus;
  delayMin?: number;
  codeshares?: string[];
  source: string;
  distanceKm?: number;
}

export interface BoardEntry {
  flightNo?: string;
  callsign?: string;
  airline?: string;
  airlineIcao?: string;
  counterpart: { icao?: string; iata?: string; name?: string };
  scheduled?: string;
  estimated?: string;
  actual?: string;
  terminal?: string;
  gate?: string;
  status: FlightStatus;
  delayMin?: number;
  aircraftType?: string;
  reg?: string;
  hex?: string;
}

export interface AirportBoard {
  icao: string;
  generatedAt: string;
  source: string;
  arrivals: BoardEntry[];
  departures: BoardEntry[];
  onGround: { hex: string; callsign?: string; reg?: string; type?: string; category: AircraftCategory }[];
  delayIndex: number; // 0..10
  avgDelayMin: number;
  cancelled: number;
}

export interface Metar {
  icao: string;
  raw: string;
  observed?: string;
  tempC?: number;
  dewpointC?: number;
  windDirDeg?: number;
  windSpeedKt?: number;
  windGustKt?: number;
  visibilityMi?: number | string;
  altimeterInHg?: number;
  flightCategory?: 'VFR' | 'MVFR' | 'IFR' | 'LIFR';
  clouds?: { cover: string; baseFt?: number }[];
  wx?: string;
}

export interface Taf {
  icao: string;
  raw: string;
  issued?: string;
  validFrom?: string;
  validTo?: string;
}

export interface AirportWeather {
  metar?: Metar;
  taf?: Taf;
  fetchedAt: string;
}

export interface AircraftPhoto {
  url: string;
  thumbUrl?: string;
  photographer?: string;
  link?: string;
  attribution: string;
  source: 'planespotters' | 'none';
}

export interface DelaySeverity {
  icao: string;
  iata?: string;
  name: string;
  lat: number;
  lon: number;
  delayIndex: number;
  avgDelayMin: number;
  cancelled: number;
  sampled: number;
}

export interface FilterSpec {
  id?: string;
  name?: string;
  airlines?: string[];       // ICAO codes
  types?: string[];          // ICAO type codes
  altMin?: number;
  altMax?: number;
  speedMin?: number;
  speedMax?: number;
  origin?: string;
  dest?: string;
  categories?: AircraftCategory[];
  airborne?: 'any' | 'airborne' | 'ground';
  sources?: PositionSource[];
  text?: string;
}

export type AlertKind = 'departure' | 'landing' | 'delay' | 'emergency';

export interface AlertRule {
  id: string;
  kind: AlertKind;
  /** Flight number, callsign, registration or hex. Use '*' with kind=emergency for all. */
  subject: string;
  channels: ('push' | 'email')[];
  enabled: boolean;
  createdAt: string;
  lastFiredAt?: string;
}

export interface UserSettings {
  units: 'aviation' | 'metric' | 'imperial';
  timeZone: 'local' | 'utc' | string;
  iconSize: number;        // 0.5..2
  trailLength: number;     // minutes, 0 = whole flight
  mapStyle: 'dark' | 'light' | 'satellite' | 'terrain';
  labels: boolean;
}

export const DEFAULT_SETTINGS: UserSettings = {
  units: 'aviation',
  timeZone: 'local',
  iconSize: 1,
  trailLength: 0,
  mapStyle: 'dark',
  labels: true,
};

export interface Bookmark {
  id: string;
  kind: 'location' | 'flight' | 'airport';
  label: string;
  data: { lat?: number; lon?: number; zoom?: number; hex?: string; reg?: string; callsign?: string; icao?: string };
  createdAt: string;
}

export interface StatsSummary {
  generatedAt: string;
  live: { total: number; airborne: number; onGround: number; bySource: Record<string, number>; byCategory: Record<string, number> };
  trackedOverTime: { ts: string; count: number }[];
  busiestAirports: { icao: string; name?: string; count: number }[];
  busiestAirlines: { icao: string; name?: string; count: number }[];
  feeds: { name: string; aircraft: number; lastUpdate?: string; healthy: boolean; error?: string }[];
}
