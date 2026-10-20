import type { CustomLayerInterface, CustomRenderMethodInput, Map as MlMap } from 'maplibre-gl';
import type { IconKind } from '@contrail/shared';
import { ICON_KINDS } from '@contrail/shared';
import { buildAtlas, ATLAS_CELL } from '@/lib/icons';

/**
 * Aircraft renderer: one GL point sprite per aircraft, drawn in a single instanced call.
 * Interpolation between the last two server positions happens in the vertex shader from a
 * `u_now` uniform, so 10,000+ aircraft animate at 60 fps with no per-frame CPU work or buffer
 * uploads — buffers are rebuilt only when a push arrives (every few seconds).
 */
export interface LayerItem {
  hex: string;
  /** [lat, lon, trackDeg, altFt] at t0 and t1 (ms, performance.now() clock) */
  p0: [number, number, number, number];
  p1: [number, number, number, number];
  t0: number;
  t1: number;
  kind: IconKind;
  color: [number, number, number, number];
  scale: number;
  highlight?: 'selected' | 'emergency' | 'none';
}

const EXTRA_RING = ICON_KINDS.length;      // atlas cell for the selection ring
const EXTRA_HALO = ICON_KINDS.length + 1;  // atlas cell for the soft emergency halo
const CELLS = ICON_KINDS.length + 2;

const VS = `
precision highp float;
attribute vec2 a_p0; attribute vec2 a_p1; attribute vec2 a_h; attribute vec2 a_t; attribute vec4 a_style; attribute vec4 a_color;
uniform mat4 u_matrix; uniform float u_now; uniform float u_size; uniform float u_bearing; uniform float u_dpr;
varying float v_rot; varying vec4 v_color; varying float v_icon; varying float v_pad;
void main() {
  float f = clamp((u_now - a_t.x) / max(a_t.y - a_t.x, 0.001), 0.0, 1.0);
  vec2 p = mix(a_p0, a_p1, f);
  float dh = a_h.y - a_h.x;
  dh = dh - 6.28318530718 * floor((dh + 3.14159265359) / 6.28318530718);
  v_rot = a_h.x + dh * f - u_bearing;
  gl_Position = u_matrix * vec4(p, 0.0, 1.0);
  gl_PointSize = u_size * a_style.y * u_dpr;
  v_color = a_color;
  v_icon = a_style.x;
  v_pad = a_style.z;
}`;

const FS = `
precision mediump float;
uniform sampler2D u_atlas; uniform float u_cells;
varying float v_rot; varying vec4 v_color; varying float v_icon; varying float v_pad;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float s = sin(v_rot), co = cos(v_rot);
  vec2 r = vec2(c.x * co + c.y * s, -c.x * s + c.y * co);
  if (abs(r.x) > 0.5 || abs(r.y) > 0.5) discard;
  vec2 uv = vec2((v_icon + 0.5 + r.x) / u_cells, 0.5 + r.y);
  float a = texture2D(u_atlas, uv).a;
  if (a < 0.05) discard;
  gl_FragColor = vec4(v_color.rgb * v_color.a * a, v_color.a * a);
}`;

interface Mercator { x: number; y: number }
function mercator(lat: number, lon: number): Mercator {
  const x = (lon + 180) / 360;
  const φ = Math.max(-85.05, Math.min(85.05, lat)) * Math.PI / 180;
  const y = (1 - Math.log(Math.tan(φ) + 1 / Math.cos(φ)) / Math.PI) / 2;
  return { x, y };
}

export class AircraftLayer implements CustomLayerInterface {
  readonly id = 'aircraft';
  readonly type = 'custom' as const;
  readonly renderingMode = '2d' as const;

  private map: MlMap | null = null;
  private gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private texture: WebGLTexture | null = null;
  private buffers: Record<string, WebGLBuffer> = {};
  private attribs: Record<string, number> = {};
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
  private count = 0;
  private highlightCount = 0;
  private origin: Mercator = { x: 0.5, y: 0.5 };
  private timeBase = 0;
  private items: LayerItem[] = [];
  private byHex = new Map<string, LayerItem>();
  private atlasIndex: Record<IconKind, number> | null = null;
  private dirty = false;
  private pendingUpload: { main: Float32Array[]; hl: Float32Array[] } | null = null;
  private lastRepaint = 0;
  private repaintPending = false;
  sizePx = 26;
  fps = 30;

  onAdd(map: MlMap, gl: WebGLRenderingContext | WebGL2RenderingContext): void {
    this.map = map;
    this.gl = gl;
    const vs = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vs, VS); gl.compileShader(vs);
    const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fs, FS); gl.compileShader(fs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) console.error('aircraft VS', gl.getShaderInfoLog(vs));
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) console.error('aircraft FS', gl.getShaderInfoLog(fs));
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) console.error('aircraft program', gl.getProgramInfoLog(prog));
    this.program = prog;
    for (const a of ['a_p0', 'a_p1', 'a_h', 'a_t', 'a_style', 'a_color']) {
      this.attribs[a] = gl.getAttribLocation(prog, a);
      this.buffers[a] = gl.createBuffer()!;
      this.buffers[`hl_${a}`] = gl.createBuffer()!;
    }
    for (const u of ['u_matrix', 'u_now', 'u_size', 'u_bearing', 'u_dpr', 'u_atlas', 'u_cells']) this.uniforms[u] = gl.getUniformLocation(prog, u);

    // Atlas: icon kinds + ring + halo
    const { canvas, index } = buildAtlas();
    this.atlasIndex = index;
    const full = document.createElement('canvas');
    full.width = ATLAS_CELL * CELLS; full.height = ATLAS_CELL;
    const ctx = full.getContext('2d')!;
    ctx.drawImage(canvas, 0, 0);
    ctx.save(); ctx.translate(EXTRA_RING * ATLAS_CELL + 32, 32);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, 27, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    ctx.save(); ctx.translate(EXTRA_HALO * ATLAS_CELL + 32, 32);
    const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 30); g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, full);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (this.items.length) this.setItems(this.items);
  }

  onRemove(): void {
    const gl = this.gl;
    if (!gl) return;
    if (this.program) gl.deleteProgram(this.program);
    if (this.texture) gl.deleteTexture(this.texture);
    for (const b of Object.values(this.buffers)) gl.deleteBuffer(b);
    this.gl = null; this.map = null; this.program = null; this.texture = null; this.buffers = {};
  }

  get size(): number { return this.items.length; }

  /** Replace the full set of rendered aircraft (called on every server push). */
  setItems(items: LayerItem[]): void {
    this.items = items;
    this.byHex = new Map(items.map((i) => [i.hex, i]));
    if (!items.length) { this.count = 0; this.highlightCount = 0; this.map?.triggerRepaint(); return; }
    this.timeBase = performance.now();
    const first = mercator(items[0].p1[0], items[0].p1[1]);
    this.origin = first;

    const n = items.length;
    const p0 = new Float32Array(n * 2), p1 = new Float32Array(n * 2), h = new Float32Array(n * 2), t = new Float32Array(n * 2), style = new Float32Array(n * 4), color = new Float32Array(n * 4);
    const hl: LayerItem[] = [];
    const idx = this.atlasIndex!;
    for (let i = 0; i < n; i++) {
      const it = items[i];
      const m0 = mercator(it.p0[0], it.p0[1]), m1 = mercator(it.p1[0], it.p1[1]);
      p0[i * 2] = m0.x - this.origin.x; p0[i * 2 + 1] = m0.y - this.origin.y;
      p1[i * 2] = m1.x - this.origin.x; p1[i * 2 + 1] = m1.y - this.origin.y;
      h[i * 2] = it.p0[2] * Math.PI / 180; h[i * 2 + 1] = it.p1[2] * Math.PI / 180;
      t[i * 2] = (it.t0 - this.timeBase) / 1000; t[i * 2 + 1] = (it.t1 - this.timeBase) / 1000;
      style[i * 4] = idx[it.kind] ?? 0; style[i * 4 + 1] = it.scale; style[i * 4 + 2] = 0; style[i * 4 + 3] = 0;
      color.set(it.color, i * 4);
      if (it.highlight && it.highlight !== 'none') hl.push(it);
    }
    const hn = hl.length;
    const hp0 = new Float32Array(hn * 2), hp1 = new Float32Array(hn * 2), hh = new Float32Array(hn * 2), ht = new Float32Array(hn * 2), hstyle = new Float32Array(hn * 4), hcolor = new Float32Array(hn * 4);
    hl.forEach((it, i) => {
      const m0 = mercator(it.p0[0], it.p0[1]), m1 = mercator(it.p1[0], it.p1[1]);
      hp0[i * 2] = m0.x - this.origin.x; hp0[i * 2 + 1] = m0.y - this.origin.y;
      hp1[i * 2] = m1.x - this.origin.x; hp1[i * 2 + 1] = m1.y - this.origin.y;
      ht[i * 2] = (it.t0 - this.timeBase) / 1000; ht[i * 2 + 1] = (it.t1 - this.timeBase) / 1000;
      const sel = it.highlight === 'selected';
      hstyle[i * 4] = sel ? EXTRA_RING : EXTRA_HALO; hstyle[i * 4 + 1] = (sel ? 1.7 : 2.6) * it.scale;
      hcolor.set(sel ? [0.22, 0.74, 0.97, 1] : [1, 0.25, 0.25, 0.9], i * 4);
    });
    this.count = n; this.highlightCount = hn;
    this.pendingUpload = { main: [p0, p1, h, t, style, color], hl: [hp0, hp1, hh, ht, hstyle, hcolor] };
    this.dirty = true;
    this.map?.triggerRepaint();
  }

  private upload(): void {
    const gl = this.gl;
    if (!gl || !this.pendingUpload) return;
    const names = ['a_p0', 'a_p1', 'a_h', 'a_t', 'a_style', 'a_color'];
    names.forEach((nme, i) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers[nme]); gl.bufferData(gl.ARRAY_BUFFER, this.pendingUpload!.main[i], gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers[`hl_${nme}`]); gl.bufferData(gl.ARRAY_BUFFER, this.pendingUpload!.hl[i], gl.DYNAMIC_DRAW);
    });
    this.pendingUpload = null;
    this.dirty = false;
  }

  /** Current interpolated [lat, lon, track, alt] for an aircraft. */
  interpolated(hex: string, now = performance.now()): [number, number, number, number] | null {
    const it = this.byHex.get(hex);
    if (!it) return null;
    const f = it.t1 <= it.t0 ? 1 : Math.max(0, Math.min(1, (now - it.t0) / (it.t1 - it.t0)));
    let dh = ((it.p1[2] - it.p0[2] + 540) % 360) - 180;
    if (!Number.isFinite(dh)) dh = 0;
    return [it.p0[0] + (it.p1[0] - it.p0[0]) * f, it.p0[1] + (it.p1[1] - it.p0[1]) * f, (it.p0[2] + dh * f + 360) % 360, it.p0[3] + (it.p1[3] - it.p0[3]) * f];
  }

  /** Nearest aircraft to a screen point within `radius` px. */
  pick(x: number, y: number, radius = 16): string | null {
    const map = this.map;
    if (!map) return null;
    radius = Math.max(8, radius * Math.max(0.42, Math.min(1, 0.3 + map.getZoom() * 0.1)));
    const now = performance.now();
    let best: string | null = null, bestD = radius * radius;
    const b = map.getBounds();
    const pad = 1;
    for (const it of this.items) {
      const p = this.interpolated(it.hex, now)!;
      if (p[0] < b.getSouth() - pad || p[0] > b.getNorth() + pad) continue;
      const pt = map.project([p[1], p[0]]);
      const dx = pt.x - x, dy = pt.y - y;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = it.hex; }
    }
    return best;
  }

  /** Visible aircraft with screen positions, for the label canvas. */
  visibleOnScreen(now = performance.now()): { item: LayerItem; x: number; y: number; pos: [number, number, number, number] }[] {
    const map = this.map;
    if (!map) return [];
    const { width, height } = map.getCanvas();
    const dpr = window.devicePixelRatio || 1;
    const w = width / dpr, hgt = height / dpr;
    const out: { item: LayerItem; x: number; y: number; pos: [number, number, number, number] }[] = [];
    for (const it of this.items) {
      const p = this.interpolated(it.hex, now)!;
      const pt = map.project([p[1], p[0]]);
      if (pt.x < -40 || pt.y < -40 || pt.x > w + 40 || pt.y > hgt + 40) continue;
      out.push({ item: it, x: pt.x, y: pt.y, pos: p });
    }
    return out;
  }

  render(gl: WebGLRenderingContext | WebGL2RenderingContext, options: CustomRenderMethodInput): void {
    if (!this.program || !this.map || this.count === 0) return;
    if (this.dirty) this.upload();
    const matrix = options.defaultProjectionData.mainMatrix as unknown as ArrayLike<number>;
    // Translate the matrix by the data origin in float64 so relative float32 positions stay precise at high zoom.
    const wrap = Math.round(this.map.getCenter().lng / 360);
    const ox = this.origin.x + wrap, oy = this.origin.y;
    const m = new Float32Array(16);
    for (let i = 0; i < 12; i++) m[i] = matrix[i];
    for (let r = 0; r < 4; r++) m[12 + r] = matrix[r] * ox + matrix[4 + r] * oy + matrix[12 + r];

    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.uniforms.u_matrix, false, m);
    gl.uniform1f(this.uniforms.u_now, (performance.now() - this.timeBase) / 1000);
    // Shrink icons at low zoom so dense world views stay legible; full size from zoom ~7.
    const z = this.map.getZoom();
    const zoomScale = Math.max(0.42, Math.min(1, 0.3 + z * 0.1));
    gl.uniform1f(this.uniforms.u_size, this.sizePx * zoomScale);
    gl.uniform1f(this.uniforms.u_bearing, this.map.getBearing() * Math.PI / 180);
    gl.uniform1f(this.uniforms.u_dpr, window.devicePixelRatio || 1);
    gl.uniform1f(this.uniforms.u_cells, CELLS);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(this.uniforms.u_atlas, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);

    const draw = (prefix: string, n: number) => {
      const sizes: Record<string, number> = { a_p0: 2, a_p1: 2, a_h: 2, a_t: 2, a_style: 4, a_color: 4 };
      for (const [name, size] of Object.entries(sizes)) {
        const loc = this.attribs[name];
        if (loc < 0) continue;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers[`${prefix}${name}`]);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
      }
      gl.drawArrays(gl.POINTS, 0, n);
    };
    if (this.highlightCount) draw('hl_', this.highlightCount);
    draw('', this.count);
    for (const loc of Object.values(this.attribs)) if (loc >= 0) gl.disableVertexAttribArray(loc);

    // Keep animating while anything is still moving, throttled to this.fps.
    const now = performance.now();
    const interval = 1000 / this.fps;
    const since = now - this.lastRepaint;
    const map = this.map;
    if (since >= interval) { this.lastRepaint = now; map.triggerRepaint(); }
    else if (!this.repaintPending) {
      this.repaintPending = true;
      setTimeout(() => { this.repaintPending = false; this.lastRepaint = performance.now(); map.triggerRepaint(); }, interval - since);
    }
  }
}
