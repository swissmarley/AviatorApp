import type { WebSocket } from 'ws';
import type { AircraftState, BBox, ClientMessage, FullRow, PosRow, ServerMessage, TrailRow } from '@contrail/shared';
import { bboxContains, encodeFull, encodePos, expandBBox, haversineKm, kmToNm } from '@contrail/shared';
import { config } from '../config.js';
import { log } from '../log.js';
import { store } from '../store/aircraftStore.js';
import type { InterestArea } from '../feeds/types.js';

interface Client {
  ws: WebSocket;
  bbox?: BBox;
  zoom: number;
  selected?: string;
  /** hex → static hash the client already has */
  known: Map<string, string>;
  lastView: number;
  alive: boolean;
}

/**
 * Pushes viewport-scoped aircraft updates to connected clients every WS_PUSH_INTERVAL_MS.
 * The first message after a viewport change is a snapshot; subsequent ticks send position rows
 * for known aircraft, full rows for new or changed ones, and removals.
 */
export class Hub {
  private clients = new Set<Client>();
  private timer?: NodeJS.Timeout;
  private lastEmergencyKey = '';

  start(): void {
    this.timer = setInterval(() => this.tick(), config.WS_PUSH_INTERVAL_MS);
    setInterval(() => this.heartbeat(), 30000);
  }

  stop(): void { if (this.timer) clearInterval(this.timer); for (const c of this.clients) c.ws.close(); }

  get clientCount(): number { return this.clients.size; }

  /** Areas connected clients are looking at, for feeds that poll by region. */
  interestAreas(): InterestArea[] {
    const out: InterestArea[] = [];
    for (const c of this.clients) {
      if (!c.bbox) continue;
      const lat = (c.bbox.north + c.bbox.south) / 2;
      const lon = (c.bbox.east + c.bbox.west) / 2;
      const diagKm = haversineKm(c.bbox.south, c.bbox.west, c.bbox.north, c.bbox.east);
      out.push({ lat, lon, radiusNm: Math.min(250, Math.max(25, kmToNm(diagKm / 2))), priority: c.zoom });
    }
    return out;
  }

  add(ws: WebSocket, feeds: string[]): void {
    const client: Client = { ws, zoom: 2, known: new Map(), lastView: 0, alive: true };
    this.clients.add(client);
    this.send(client, { t: 'hello', ts: Date.now(), feeds, version: '0.1.0' });
    ws.on('message', (data) => {
      let msg: ClientMessage;
      try { msg = JSON.parse(data.toString()) as ClientMessage; } catch { return; }
      this.handle(client, msg);
    });
    ws.on('pong', () => { client.alive = true; });
    ws.on('close', () => this.clients.delete(client));
    ws.on('error', (err) => { log.debug({ err: err.message }, 'ws error'); this.clients.delete(client); });
  }

  private handle(c: Client, msg: ClientMessage): void {
    switch (msg.t) {
      case 'view': {
        const [west, south, east, north] = msg.bbox;
        if (![west, south, east, north].every(Number.isFinite)) return;
        c.bbox = expandBBox({ west, south, east, north }, 1.15);
        c.zoom = msg.zoom;
        c.lastView = Date.now();
        this.push(c, true);
        break;
      }
      case 'select':
        c.selected = msg.hex ?? undefined;
        if (c.selected) this.sendSelection(c);
        break;
      case 'ping':
        this.send(c, { t: 'pong', ts: Date.now() });
        break;
    }
  }

  private sendSelection(c: Client): void {
    if (!c.selected) return;
    const a = store.get(c.selected);
    const trail: TrailRow[] = store.trail(c.selected).map((p) => [p.ts, p.lat, p.lon, p.alt ?? null, p.gs ?? null, p.track ?? null, p.vr ?? null]);
    this.send(c, { t: 'sel', hex: c.selected, trail, full: a ? encodeFull(a) : undefined });
  }

  private visible(c: Client): AircraftState[] {
    if (!c.bbox) return [];
    const list = store.inBBox(c.bbox);
    if (list.length > config.WS_MAX_AIRCRAFT) {
      // Prefer airborne traffic when a viewport holds more than the cap.
      list.sort((a, b) => Number(a.onGround) - Number(b.onGround));
      list.length = config.WS_MAX_AIRCRAFT;
    }
    if (c.selected) {
      const sel = store.get(c.selected);
      if (sel && !bboxContains(c.bbox, sel.lat, sel.lon)) list.push(sel);
    }
    return list;
  }

  private push(c: Client, snapshot: boolean): void {
    if (c.ws.readyState !== c.ws.OPEN || !c.bbox) return;
    const list = this.visible(c);
    const ts = Date.now();
    if (snapshot) {
      c.known.clear();
      const full: FullRow[] = [];
      for (const a of list) { full.push(encodeFull(a)); c.known.set(a.hex, hashOf(a)); }
      this.send(c, { t: 'snap', ts, full, count: full.length });
      return;
    }
    const full: FullRow[] = [], pos: PosRow[] = [];
    const seen = new Set<string>();
    for (const a of list) {
      seen.add(a.hex);
      const h = hashOf(a);
      if (c.known.get(a.hex) !== h) { full.push(encodeFull(a)); c.known.set(a.hex, h); }
      else pos.push(encodePos(a));
    }
    const rm: string[] = [];
    for (const hex of c.known.keys()) if (!seen.has(hex)) { rm.push(hex); c.known.delete(hex); }
    this.send(c, { t: 'upd', ts, full, pos, rm, count: list.length });
  }

  private tick(): void {
    for (const c of this.clients) {
      try { this.push(c, false); if (c.selected) this.sendSelection(c); } catch (err) { log.debug({ err: (err as Error).message }, 'push failed'); }
    }
    const em = store.emergencies();
    const key = em.map((a) => `${a.hex}:${a.emergency}`).sort().join(',');
    if (key !== this.lastEmergencyKey) {
      this.lastEmergencyKey = key;
      const msg: ServerMessage = { t: 'emerg', list: em.map((a) => ({ hex: a.hex, callsign: a.callsign, squawk: a.squawk, emergency: a.emergency, lat: a.lat, lon: a.lon })) };
      for (const c of this.clients) this.send(c, msg);
    }
  }

  private heartbeat(): void {
    for (const c of this.clients) {
      if (!c.alive) { c.ws.terminate(); this.clients.delete(c); continue; }
      c.alive = false;
      try { c.ws.ping(); } catch { /* ignore */ }
    }
  }

  private send(c: Client, msg: ServerMessage): void {
    if (c.ws.readyState !== c.ws.OPEN) return;
    c.ws.send(JSON.stringify(msg));
  }
}

function hashOf(a: AircraftState): string {
  return `${a.callsign ?? ''}|${a.reg ?? ''}|${a.type ?? ''}|${a.category}|${a.operator ?? ''}|${a.origin ?? ''}|${a.dest ?? ''}|${a.feed}|${a.desc ?? ''}|${a.emitter ?? ''}`;
}

export const hub = new Hub();
