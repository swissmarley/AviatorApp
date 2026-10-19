import { useMemo, useState } from 'react';
import type { TrailPoint } from '@contrail/shared';

/**
 * Altitude & ground-speed history as two stacked single-series line charts sharing one time
 * axis (never a dual-axis chart), with a shared crosshair + tooltip.
 */
export function FlightChart({ points, height = 150 }: { points: TrailPoint[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const data = useMemo(() => points.filter((p) => p.alt !== undefined || p.gs !== undefined), [points]);
  if (data.length < 2) return <div className="text-xs text-slate-500 py-4 text-center">Not enough track data yet.</div>;
  const w = 320, padL = 40, padR = 8, padT = 6, h1 = height / 2 - 10, gap = 18;
  const t0 = data[0].ts, t1 = data[data.length - 1].ts || t0 + 1;
  const x = (t: number) => padL + ((t - t0) / Math.max(1, t1 - t0)) * (w - padL - padR);
  const maxAlt = Math.max(1000, ...data.map((p) => p.alt ?? 0));
  const maxGs = Math.max(100, ...data.map((p) => p.gs ?? 0));
  const yAlt = (v: number) => padT + h1 - (v / maxAlt) * h1;
  const yGs = (v: number) => padT + h1 + gap + h1 - (v / maxGs) * h1;
  const path = (get: (p: TrailPoint) => number | undefined, y: (v: number) => number) => {
    let d = ''; let pen = false;
    for (const p of data) { const v = get(p); if (v === undefined) { pen = false; continue; } d += `${pen ? 'L' : 'M'}${x(p.ts).toFixed(1)},${y(v).toFixed(1)} `; pen = true; }
    return d;
  };
  const hi = hover === null ? null : data[Math.max(0, Math.min(data.length - 1, Math.round(((hover - padL) / (w - padL - padR)) * (data.length - 1))))];
  const fmtT = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const onMove = (e: React.MouseEvent<SVGSVGElement> | React.TouchEvent<SVGSVGElement>) => {
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    setHover(((clientX - rect.left) / rect.width) * w);
  };
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${w} ${height}`} className="w-full h-auto select-none" onMouseMove={onMove} onMouseLeave={() => setHover(null)} onTouchMove={onMove} onTouchEnd={() => setHover(null)} role="img" aria-label="Altitude and ground speed over time">
        {[0, 0.5, 1].map((f) => (<g key={f}>
          <line x1={padL} x2={w - padR} y1={yAlt(maxAlt * f)} y2={yAlt(maxAlt * f)} stroke="#263147" strokeWidth={1} />
          <text x={padL - 4} y={yAlt(maxAlt * f) + 3} fontSize={8} fill="#94a3b8" textAnchor="end">{Math.round((maxAlt * f) / 1000)}k</text>
          <line x1={padL} x2={w - padR} y1={yGs(maxGs * f)} y2={yGs(maxGs * f)} stroke="#263147" strokeWidth={1} />
          <text x={padL - 4} y={yGs(maxGs * f) + 3} fontSize={8} fill="#94a3b8" textAnchor="end">{Math.round(maxGs * f)}</text>
        </g>))}
        <text x={padL} y={padT + 2} fontSize={8} fill="#cbd5e1" dominantBaseline="hanging">Altitude ft</text>
        <text x={padL} y={padT + h1 + gap + 2} fontSize={8} fill="#cbd5e1" dominantBaseline="hanging">Ground speed kt</text>
        <path d={path((p) => p.alt, yAlt)} fill="none" stroke="#3987e5" strokeWidth={2} strokeLinejoin="round" />
        <path d={path((p) => p.gs, yGs)} fill="none" stroke="#d95926" strokeWidth={2} strokeLinejoin="round" />
        <text x={padL} y={height - 1} fontSize={8} fill="#94a3b8">{fmtT(t0)}</text>
        <text x={w - padR} y={height - 1} fontSize={8} fill="#94a3b8" textAnchor="end">{fmtT(t1)}</text>
        {hi && (<g>
          <line x1={x(hi.ts)} x2={x(hi.ts)} y1={padT} y2={height - 8} stroke="#cbd5e1" strokeWidth={1} strokeDasharray="2 2" />
          {hi.alt !== undefined && <circle cx={x(hi.ts)} cy={yAlt(hi.alt)} r={4} fill="#3987e5" stroke="#0b1220" strokeWidth={2} />}
          {hi.gs !== undefined && <circle cx={x(hi.ts)} cy={yGs(hi.gs)} r={4} fill="#d95926" stroke="#0b1220" strokeWidth={2} />}
        </g>)}
      </svg>
      {hi && (
        <div className="absolute top-0 right-0 bg-ink-3 border border-line rounded-md px-2 py-1 text-[11px] font-mono pointer-events-none">
          <div className="text-slate-300">{fmtT(hi.ts)}</div>
          <div><span className="inline-block w-2 h-2 rounded-sm mr-1" style={{ background: '#3987e5' }} />{hi.alt !== undefined ? `${Math.round(hi.alt).toLocaleString()} ft` : '—'}</div>
          <div><span className="inline-block w-2 h-2 rounded-sm mr-1" style={{ background: '#d95926' }} />{hi.gs !== undefined ? `${Math.round(hi.gs)} kt` : '—'}</div>
        </div>
      )}
    </div>
  );
}

/** Simple sparkline/area for the stats page. */
export function TimeSeries({ data, height = 160, color = '#3987e5', label }: { data: { ts: string; count: number }[]; height?: number; color?: string; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (data.length < 2) return <div className="text-xs text-slate-500 py-6 text-center">Collecting samples… check back in a few minutes.</div>;
  const w = 600, padL = 44, padR = 8, padT = 8, padB = 18;
  const t0 = new Date(data[0].ts).getTime(), t1 = new Date(data[data.length - 1].ts).getTime();
  const max = Math.max(1, ...data.map((d) => d.count));
  const x = (t: number) => padL + ((t - t0) / Math.max(1, t1 - t0)) * (w - padL - padR);
  const y = (v: number) => padT + (height - padT - padB) - (v / max) * (height - padT - padB);
  const d = data.map((p, i) => `${i ? 'L' : 'M'}${x(new Date(p.ts).getTime()).toFixed(1)},${y(p.count).toFixed(1)}`).join(' ');
  const hi = hover === null ? null : data[Math.max(0, Math.min(data.length - 1, Math.round(((hover - padL) / (w - padL - padR)) * (data.length - 1))))];
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${w} ${height}`} className="w-full h-auto" role="img" aria-label={label} onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setHover(((e.clientX - r.left) / r.width) * w); }} onMouseLeave={() => setHover(null)}>
        {[0, 0.5, 1].map((f) => (<g key={f}><line x1={padL} x2={w - padR} y1={y(max * f)} y2={y(max * f)} stroke="#263147" /><text x={padL - 6} y={y(max * f) + 3} fontSize={10} fill="#94a3b8" textAnchor="end">{Math.round(max * f).toLocaleString()}</text></g>))}
        <path d={`${d} L${x(t1)},${y(0)} L${x(t0)},${y(0)} Z`} fill={color} opacity={0.12} />
        <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
        <text x={padL} y={height - 4} fontSize={10} fill="#94a3b8">{new Date(t0).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</text>
        <text x={w - padR} y={height - 4} fontSize={10} fill="#94a3b8" textAnchor="end">{new Date(t1).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</text>
        {hi && <g><line x1={x(new Date(hi.ts).getTime())} x2={x(new Date(hi.ts).getTime())} y1={padT} y2={height - padB} stroke="#cbd5e1" strokeDasharray="2 2" /><circle cx={x(new Date(hi.ts).getTime())} cy={y(hi.count)} r={4} fill={color} stroke="#0b1220" strokeWidth={2} /></g>}
      </svg>
      {hi && <div className="absolute top-1 right-1 bg-ink-3 border border-line rounded-md px-2 py-1 text-[11px] font-mono pointer-events-none">{new Date(hi.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {hi.count.toLocaleString()}</div>}
    </div>
  );
}

/** Horizontal bar list (top-N). */
export function BarList({ items, color = '#3987e5' }: { items: { label: string; sub?: string; value: number; href?: string }[]; color?: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.length) return <div className="text-xs text-slate-500 py-4 text-center">No data yet.</div>;
  return (
    <ul className="space-y-1.5">
      {items.map((it) => (
        <li key={it.label} className="text-xs">
          <div className="flex justify-between gap-2 mb-0.5"><span className="truncate">{it.href ? <a href={it.href} className="hover:underline">{it.label}</a> : it.label}{it.sub && <span className="text-slate-400"> · {it.sub}</span>}</span><span className="font-mono tabular-nums text-slate-300">{it.value.toLocaleString()}</span></div>
          <div className="h-1.5 rounded-sm bg-ink-3 overflow-hidden"><div className="h-full rounded-sm" style={{ width: `${(it.value / max) * 100}%`, background: color }} /></div>
        </li>
      ))}
    </ul>
  );
}
