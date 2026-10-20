import type { Map as MlMap } from 'maplibre-gl';
import type { AircraftLayer } from './AircraftLayer';

export interface PointLabel { lon: number; lat: number; text: string; sub?: string; color?: string; minZoom?: number; priority?: number }

/**
 * 2D canvas overlay for text labels (aircraft callsigns, airport codes, navaid idents, FIR ids).
 * Drawing text ourselves avoids glyph-server dependencies and lets labels follow the
 * interpolated aircraft positions every frame.
 */
export class LabelCanvas {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  // (assigned in constructor)
  private raf = 0;
  private staticLabels: PointLabel[] = [];
  private frameListener = () => this.schedule();
  showAircraftLabels = true;
  light = false;

  constructor(private map: MlMap, private aircraft: AircraftLayer) {
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d")!;
    Object.assign(this.canvas.style, { position: 'absolute', inset: '0', pointerEvents: 'none', width: '100%', height: '100%' });
    map.getContainer().appendChild(this.canvas);
    map.on('render', this.frameListener);
    map.on('resize', this.frameListener);
    this.schedule();
  }

  setStaticLabels(labels: PointLabel[]): void { this.staticLabels = labels; this.schedule(); }

  destroy(): void {
    this.map.off('render', this.frameListener);
    this.map.off('resize', this.frameListener);
    cancelAnimationFrame(this.raf);
    this.canvas.remove();
  }

  private schedule(): void {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => { this.raf = 0; this.draw(); });
  }

  private draw(): void {
    const dpr = window.devicePixelRatio || 1;
    const { clientWidth: w, clientHeight: h } = this.map.getContainer();
    if (this.canvas.width !== w * dpr || this.canvas.height !== h * dpr) { this.canvas.width = w * dpr; this.canvas.height = h * dpr; }
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const zoom = this.map.getZoom();
    const ink = this.light ? '#0f172a' : '#f8fafc';
    const halo = this.light ? 'rgba(255,255,255,0.85)' : 'rgba(11,18,32,0.85)';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';

    // Static labels (airports etc.) with simple collision avoidance.
    const occupied: { x: number; y: number; w: number; h: number }[] = [];
    const collides = (x: number, y: number, bw: number, bh: number) => occupied.some((o) => x < o.x + o.w && x + bw > o.x && y < o.y + o.h && y + bh > o.y);
    const b = this.map.getBounds();
    const sorted = [...this.staticLabels].sort((a, c) => (c.priority ?? 0) - (a.priority ?? 0));
    for (const l of sorted) {
      if (l.minZoom !== undefined && zoom < l.minZoom) continue;
      if (l.lat < b.getSouth() || l.lat > b.getNorth()) continue;
      const pt = this.map.project([l.lon, l.lat]);
      if (pt.x < -50 || pt.y < -20 || pt.x > w + 50 || pt.y > h + 20) continue;
      ctx.font = '600 11px Inter, system-ui, sans-serif';
      const tw = ctx.measureText(l.text).width;
      const x = pt.x + 8, y = pt.y - 8;
      if (collides(x, y - 7, tw, 14)) continue;
      occupied.push({ x, y: y - 7, w: tw, h: 14 });
      ctx.strokeStyle = halo; ctx.lineWidth = 3; ctx.strokeText(l.text, x, y);
      ctx.fillStyle = l.color ?? ink; ctx.fillText(l.text, x, y);
    }

    if (!this.showAircraftLabels || zoom < 7.2) return;
    const visible = this.aircraft.visibleOnScreen();
    if (visible.length > 450) return;
    const detailed = zoom >= 9.5;
    ctx.font = '600 11px Inter, system-ui, sans-serif';
    for (const v of visible) {
      const { item } = v;
      const text = labelText(item.hex);
      if (!text) continue;
      const x = v.x + 13, y = v.y - (detailed ? 8 : 0);
      const tw = ctx.measureText(text).width;
      if (collides(x, y - 7, tw, detailed ? 26 : 14)) continue;
      occupied.push({ x, y: y - 7, w: tw, h: detailed ? 26 : 14 });
      ctx.strokeStyle = halo; ctx.lineWidth = 3; ctx.strokeText(text, x, y);
      ctx.fillStyle = item.highlight === 'selected' ? '#38bdf8' : item.highlight === 'emergency' ? '#f87171' : ink;
      ctx.fillText(text, x, y);
      if (detailed) {
        const sub = `${Math.round(v.pos[3] / 100) > 0 ? 'FL' + String(Math.round(v.pos[3] / 100)).padStart(3, '0') : 'GND'}`;
        ctx.font = '500 10px JetBrains Mono, ui-monospace, monospace';
        ctx.strokeText(sub, x, y + 12);
        ctx.fillStyle = this.light ? '#475569' : '#cbd5e1';
        ctx.fillText(sub, x, y + 12);
        ctx.font = '600 11px Inter, system-ui, sans-serif';
      }
    }
  }
}

const labelLookup = new Map<string, string>();
export function setLabelText(hex: string, text: string | undefined): void { if (text) labelLookup.set(hex, text); else labelLookup.delete(hex); }
export function labelText(hex: string): string | undefined { return labelLookup.get(hex); }
export function resetLabels(): void { labelLookup.clear(); }
