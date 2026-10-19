import clsx from 'clsx';
import type { FlightStatus } from '@contrail/shared';

/** Colour scale shared by the delay gauge and the disruption map (0..10). */
export function delayColor(idx: number): string {
  if (idx < 2) return '#22c55e';
  if (idx < 5) return '#f59e0b';
  if (idx < 8) return '#f97316';
  return '#ef4444';
}

export function delayLabel(idx: number): string {
  if (idx < 2) return 'Normal';
  if (idx < 5) return 'Minor delays';
  if (idx < 8) return 'Significant delays';
  return 'Severe disruption';
}

export function DelayGauge({ index, avgDelayMin, cancelled, compact }: { index: number; avgDelayMin: number; cancelled: number; compact?: boolean }) {
  const color = delayColor(index);
  const pct = Math.max(0, Math.min(1, index / 10));
  return (
    <div className={clsx('flex items-center gap-3', compact ? '' : 'p-3')}>
      <svg width={compact ? 48 : 72} height={compact ? 48 : 72} viewBox="0 0 72 72" role="img" aria-label={`Delay index ${index.toFixed(1)} of 10`}>
        <circle cx="36" cy="36" r="30" fill="none" stroke="#263147" strokeWidth="8" />
        <circle cx="36" cy="36" r="30" fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${pct * 188.5} 188.5`} transform="rotate(-90 36 36)" />
        <text x="36" y="40" textAnchor="middle" fontSize="18" fontWeight="700" fill="#f8fafc" fontFamily="JetBrains Mono, monospace">{index.toFixed(1)}</text>
      </svg>
      <div className="text-sm">
        <div className="font-semibold" style={{ color }}>{delayLabel(index)}</div>
        <div className="text-xs text-slate-400">Delay index {index.toFixed(1)} / 10</div>
        {!compact && <div className="text-xs text-slate-400 mt-0.5">Avg delay <span className="font-mono text-slate-200">{avgDelayMin} min</span> · Cancelled <span className="font-mono text-slate-200">{cancelled}</span></div>}
      </div>
    </div>
  );
}

export function StatusBadge({ status, delayMin }: { status: FlightStatus; delayMin?: number }) {
  const late = status === 'delayed' || (delayMin ?? 0) >= 15;
  const cls = status === 'cancelled' ? 'border-red-500 text-red-300 bg-red-950/60'
    : late ? 'border-amber-500 text-amber-300 bg-amber-950/50'
    : status === 'enroute' || status === 'departed' ? 'border-sky-500 text-sky-300'
    : status === 'landed' || status === 'arrived' ? 'border-emerald-500 text-emerald-300'
    : status === 'diverted' ? 'border-fuchsia-500 text-fuchsia-300'
    : '';
  return <span className={clsx('chip capitalize', cls)}>{status}{delayMin !== undefined && delayMin >= 5 ? ` +${delayMin}m` : ''}</span>;
}

export const FLIGHT_CATEGORY_COLOR: Record<string, string> = { VFR: '#22c55e', MVFR: '#3b82f6', IFR: '#ef4444', LIFR: '#d946ef' };

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { key: T; label: string; count?: number }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="flex gap-1 overflow-x-auto scroll-thin border-b border-line" role="tablist">
      {tabs.map((t) => (
        <button key={t.key} role="tab" aria-selected={value === t.key} onClick={() => onChange(t.key)} className={clsx('px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px', value === t.key ? 'border-accent text-white' : 'border-transparent text-slate-400 hover:text-slate-200')}>
          {t.label}{t.count !== undefined && <span className="ml-1.5 text-[10px] font-mono text-slate-400">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
