import type { AirportBoard, AirportWeather, Airport, Runway, DelaySeverity, FlightInfo, AircraftPhoto, AircraftState, StatsSummary, TrailPoint, UserSettings, Bookmark, AlertRule } from '@contrail/shared';

export const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

let authToken: string | null = null;
export function setAuthToken(t: string | null): void { authToken = t; try { t ? localStorage.setItem('contrail:token', t) : localStorage.removeItem('contrail:token'); } catch { /* ignore */ } }
export function getAuthToken(): string | null { if (authToken) return authToken; try { authToken = localStorage.getItem('contrail:token'); } catch { /* ignore */ } return authToken; }

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string> ?? {}) };
  if (init?.body && !headers['content-type']) headers['content-type'] = 'application/json';
  const token = getAuthToken();
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers, credentials: 'include' });
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = ((await res.json()) as { error?: string }).error ?? msg; } catch { /* ignore */ }
    throw new ApiError(res.status, msg);
  }
  return res.json() as Promise<T>;
}

export interface AircraftDetail {
  live: AircraftState | null;
  lastSeen: string | null;
  airline: { icao?: string; iata?: string; name?: string; cargo?: boolean } | null;
  typeName: string | null;
  flight: FlightInfo | null;
  origin: Airport | null;
  dest: Airport | null;
  progress: { flownKm: number; remainingKm: number; totalKm: number; fraction: number } | null;
  photo: AircraftPhoto | null;
}

export const getAircraftDetail = (hex: string) => api<AircraftDetail>(`/api/aircraft/${hex}`);
export const getAircraftTrack = (hex: string) => api<{ hex: string; points: TrailPoint[] }>(`/api/aircraft/${hex}/track`);
export const getAirport = (code: string) => api<{ airport: Airport; runways: Runway[] }>(`/api/airports/${code}`);
export const getAirportBoard = (code: string) => api<AirportBoard>(`/api/airports/${code}/board`);
export const getAirportWeather = (code: string) => api<AirportWeather>(`/api/airports/${code}/weather`);
export const getAirportTraffic = (code: string) => api<{ aircraft: AircraftState[] }>(`/api/airports/${code}/traffic`);
export const getDisruptions = () => api<{ generatedAt: string; airports: DelaySeverity[] }>(`/api/airports/disruptions`);
export const getStats = (range: '1h' | '24h' | '7d') => api<StatsSummary>(`/api/stats?range=${range}`);
export const getHealth = () => api<{ ok: boolean; db: boolean; feeds: unknown[]; providers: Record<string, unknown> }>(`/api/health`);

export interface SearchResults {
  aircraft: { hex: string; callsign?: string; flightNo?: string; reg?: string; type?: string; operator?: string; airline?: string; origin?: string; dest?: string; onGround: boolean; lat: number; lon: number }[];
  airports: { icao?: string; iata?: string; ident: string; name: string; municipality?: string; country: string; type: string; lat: number; lon: number }[];
  airlines: { icao: string; iata?: string; name: string; live: number }[];
  types: { icao: string; name: string }[];
  history: { hex: string; callsign?: string; reg?: string; type?: string; lastSeen: string; origin?: string; dest?: string }[];
}
export const search = (q: string) => api<SearchResults>(`/api/search?q=${encodeURIComponent(q)}`);

export interface StoredFlight { id: number; hex: string; callsign?: string; flight_no?: string; reg?: string; type?: string; operator?: string; category?: string; first_seen: string; last_seen: string; origin?: string | null; dest?: string | null; max_alt?: number; position_count: number; ground_start?: boolean; ground_end?: boolean }
export const getHistoryByReg = (reg: string) => api<{ flights: StoredFlight[] }>(`/api/history/registration/${encodeURIComponent(reg)}`);
export const getHistoryByFlight = (no: string) => api<{ flights: StoredFlight[] }>(`/api/history/flight/${encodeURIComponent(no)}`);
export const getStoredTrack = (id: number) => api<{ hex: string; points: TrailPoint[] }>(`/api/history/flights/${id}/track`);
export interface PlaybackFrame { ts: number; rows: [string, string | null, number, number, number | null, number | null, number | null, number | null, number, number, string | null][] }
export const getPlayback = (bbox: string, from: string, to: string, step?: number) => api<{ from: string; to: string; step: number; frames: PlaybackFrame[]; truncated: boolean }>(`/api/history/positions?bbox=${bbox}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${step ? `&step=${step}` : ''}`);

export interface Me { user: { id: string; email: string; displayName?: string }; settings: UserSettings; bookmarks: Bookmark[]; filters: { id: string; name: string; spec: Record<string, unknown> }[]; alerts: AlertRule[]; events: { id: number; firedAt: string; title: string; body: string; payload: { url?: string; hex?: string }; read: boolean }[]; pushSubscriptions: number }
export const authStatus = () => api<{ accountsEnabled: boolean; user: { id: string; email: string } | null; notifications: { push: boolean; email: boolean; vapidPublicKey?: string } }>(`/api/auth/status`);
export const getMe = () => api<Me>(`/api/me`);
