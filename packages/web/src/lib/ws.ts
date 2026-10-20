import type { ClientMessage, ServerMessage } from '@contrail/shared';
import { API_BASE } from './api';
import { useAircraft } from '@/state/aircraft';

/** Resilient WebSocket client feeding the aircraft store. */
class LiveClient {
  private ws: WebSocket | null = null;
  private url: string;
  private retry = 0;
  private timer: number | undefined;
  private lastView: ClientMessage | null = null;
  private lastSelect: string | null = null;
  private wanted = false;

  constructor() {
    const explicit = import.meta.env.VITE_WS_URL;
    if (explicit) this.url = explicit;
    else {
      const base = API_BASE ? new URL(API_BASE, location.href) : new URL(location.href);
      base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
      base.pathname = '/ws'; base.search = ''; base.hash = '';
      this.url = base.toString();
    }
  }

  connect(): void {
    this.wanted = true;
    if (this.timer) { clearTimeout(this.timer); this.timer = undefined; }
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      useAircraft.getState().setConnected(true);
      if (this.lastView) this.send(this.lastView);
      if (this.lastSelect) this.send({ t: 'select', hex: this.lastSelect });
    };
    ws.onmessage = (ev) => {
      let msg: ServerMessage;
      try { msg = JSON.parse(ev.data as string) as ServerMessage; } catch { return; }
      const st = useAircraft.getState();
      switch (msg.t) {
        case 'hello': st.setConnected(true, msg.feeds); break;
        case 'snap': st.applySnapshot(msg.full, msg.ts); break;
        case 'upd': st.applyUpdate(msg.full, msg.pos, msg.rm, msg.ts); break;
        case 'sel': st.applySelection(msg.hex, msg.trail, msg.full); break;
        case 'emerg': st.setEmergencies(msg.list); break;
        default: break;
      }
    };
    ws.onclose = () => {
      if (this.ws !== ws) return; // an older socket closing after a reconnect
      useAircraft.getState().setConnected(false);
      this.ws = null;
      if (!this.wanted) return;
      const delay = Math.min(15000, 500 * Math.pow(2, this.retry++));
      this.timer = window.setTimeout(() => this.connect(), delay);
    };
    ws.onerror = () => ws.close();
  }

  disconnect(): void {
    this.wanted = false;
    if (this.timer) { clearTimeout(this.timer); this.timer = undefined; }
    const ws = this.ws;
    this.ws = null;
    if (ws) { ws.onclose = null; ws.onmessage = null; ws.close(); }
    useAircraft.getState().setConnected(false);
  }

  private send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  setView(bbox: [number, number, number, number], zoom: number): void {
    this.lastView = { t: 'view', bbox, zoom };
    this.send(this.lastView);
  }

  select(hex: string | null): void {
    this.lastSelect = hex;
    useAircraft.getState().setSelected(hex);
    this.send({ t: 'select', hex });
  }
}

export const live = new LiveClient();
