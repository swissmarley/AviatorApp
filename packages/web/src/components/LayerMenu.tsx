import clsx from 'clsx';
import { MAP_STYLES } from '@/lib/mapStyles';
import { useSettings, type LayerKey } from '@/state/settings';
import { Icon } from './Icon';

const LAYERS: { key: LayerKey; label: string; hint?: string }[] = [
  { key: 'airports', label: 'Airports' },
  { key: 'labels', label: 'Aircraft labels' },
  { key: 'fir', label: 'ATC / FIR boundaries' },
  { key: 'radar', label: 'Weather radar', hint: 'RainViewer' },
  { key: 'clouds', label: 'Cloud cover', hint: 'IR satellite' },
  { key: 'airways', label: 'Airways' },
  { key: 'navaids', label: 'Navaids', hint: 'zoom ≥ 6' },
  { key: 'terminator', label: 'Day / night' },
];

export function LayerMenu({ onClose }: { onClose: () => void }) {
  const { settings, layers, update, toggleLayer } = useSettings();
  return (
    <div className="panel w-72 p-3 text-sm" role="dialog" aria-label="Map layers">
      <div className="flex items-center justify-between mb-2"><span className="font-semibold">Map</span><button className="icon-btn w-7 h-7" onClick={onClose} aria-label="Close"><Icon name="close" size={14} /></button></div>
      <div className="grid grid-cols-4 gap-1 mb-3">
        {MAP_STYLES.map((s) => (
          <button key={s.key} onClick={() => update({ mapStyle: s.key })} className={clsx('rounded-lg px-1 py-1.5 text-xs border', settings.mapStyle === s.key ? 'bg-accent text-ink border-accent font-semibold' : 'bg-ink-3 border-line hover:bg-line')}>{s.label}</button>
        ))}
      </div>
      <div className="text-[11px] uppercase tracking-wide text-slate-400 mb-1">Layers</div>
      <ul className="space-y-0.5">
        {LAYERS.map((l) => (
          <li key={l.key}>
            <label className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-ink-3 cursor-pointer">
              <input type="checkbox" checked={layers[l.key]} onChange={() => toggleLayer(l.key)} className="accent-amber-400" />
              <span className="flex-1">{l.label}</span>
              {l.hint && <span className="text-[10px] text-slate-500">{l.hint}</span>}
            </label>
          </li>
        ))}
      </ul>
      <div className="mt-3 text-[11px] uppercase tracking-wide text-slate-400 mb-1">Icons</div>
      <label className="flex items-center gap-2 px-2 text-xs">Size<input type="range" min={0.5} max={2} step={0.1} value={settings.iconSize} onChange={(e) => update({ iconSize: Number(e.target.value) })} className="flex-1 accent-amber-400" /><span className="font-mono w-8 text-right">{settings.iconSize.toFixed(1)}×</span></label>
      <label className="flex items-center gap-2 px-2 text-xs mt-1">Trail<select value={settings.trailLength} onChange={(e) => update({ trailLength: Number(e.target.value) })} className="input py-1 flex-1"><option value={0}>Whole flight</option><option value={5}>5 min</option><option value={15}>15 min</option><option value={60}>1 hour</option></select></label>
    </div>
  );
}
