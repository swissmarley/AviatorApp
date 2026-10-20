import type { Runway } from '@contrail/shared';

/** North-up SVG diagram of runways from threshold coordinates, projected to local metres. */
export function AirportRunwayDiagram({ runways, centerLat, centerLon }: { runways: Runway[]; centerLat: number; centerLon: number }) {
  const rws = runways.filter((r) => r.leLat !== undefined && r.leLon !== undefined && r.heLat !== undefined && r.heLon !== undefined);
  if (!rws.length) return <div className="text-xs text-slate-500 py-6 text-center">No runway geometry available.</div>;
  const kx = 111320 * Math.cos((centerLat * Math.PI) / 180), ky = 110540;
  const pts = rws.map((r) => ({ r, x1: (r.leLon! - centerLon) * kx, y1: -(r.leLat! - centerLat) * ky, x2: (r.heLon! - centerLon) * kx, y2: -(r.heLat! - centerLat) * ky }));
  const xs = pts.flatMap((p) => [p.x1, p.x2]), ys = pts.flatMap((p) => [p.y1, p.y2]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY, 1000) * 1.35;
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const vb = `${cx - span / 2} ${cy - span / 2} ${span} ${span}`;
  const scale = span < 3000 ? 500 : span < 8000 ? 1000 : 2000;
  const stroke = span / 160;
  return (
    <svg viewBox={vb} className="w-full max-w-md mx-auto h-auto bg-ink rounded-lg border border-line" role="img" aria-label="Runway layout">
      {pts.map((p, i) => (
        <g key={i}>
          <line x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} stroke="#475569" strokeWidth={Math.max(stroke * 2.2, (p.r.widthFt ?? 150) * 0.3048)} strokeLinecap="butt" />
          <line x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} stroke="#e2e8f0" strokeWidth={stroke * 0.25} strokeDasharray={`${stroke * 2} ${stroke * 2}`} />
          <text x={p.x1} y={p.y1} fontSize={span / 28} fill="#f5b400" textAnchor="middle" dominantBaseline="middle" fontFamily="JetBrains Mono, monospace" fontWeight="700" stroke="#0b1220" strokeWidth={span / 400} paintOrder="stroke">{p.r.leIdent}</text>
          <text x={p.x2} y={p.y2} fontSize={span / 28} fill="#f5b400" textAnchor="middle" dominantBaseline="middle" fontFamily="JetBrains Mono, monospace" fontWeight="700" stroke="#0b1220" strokeWidth={span / 400} paintOrder="stroke">{p.r.heIdent}</text>
        </g>
      ))}
      {/* north arrow */}
      <g transform={`translate(${cx + span / 2 - span / 12}, ${cy - span / 2 + span / 12})`}>
        <path d={`M0 ${-span / 30} L${span / 90} ${span / 60} L0 ${span / 120} L${-span / 90} ${span / 60} Z`} fill="#38bdf8" />
        <text y={span / 22} fontSize={span / 36} fill="#38bdf8" textAnchor="middle">N</text>
      </g>
      {/* scale bar */}
      <g transform={`translate(${cx - span / 2 + span / 20}, ${cy + span / 2 - span / 20})`}>
        <line x1={0} y1={0} x2={scale} y2={0} stroke="#cbd5e1" strokeWidth={span / 300} />
        <text x={scale / 2} y={-span / 80} fontSize={span / 36} fill="#cbd5e1" textAnchor="middle">{scale >= 1000 ? `${scale / 1000} km` : `${scale} m`}</text>
      </g>
    </svg>
  );
}
