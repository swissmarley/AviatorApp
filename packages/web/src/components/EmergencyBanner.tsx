import { useNavigate } from 'react-router-dom';
import { emergencyLabel } from '@contrail/shared';
import { useAircraft } from '@/state/aircraft';
import { Icon } from './Icon';

export function EmergencyBanner() {
  const list = useAircraft((s) => s.emergencies);
  const navigate = useNavigate();
  if (!list.length) return null;
  return (
    <div className="absolute top-14 md:top-16 inset-x-0 z-30 flex justify-center pointer-events-none px-2">
      <div className="pointer-events-auto bg-red-950/95 border border-red-600 text-red-50 rounded-xl shadow-2xl px-3 py-2 flex flex-wrap items-center gap-2 max-w-3xl" role="alert">
        <span className="flex items-center gap-1.5 font-semibold text-sm pulse-red"><Icon name="alert" size={16} />Emergency squawk</span>
        {list.slice(0, 4).map((e) => (
          <button key={e.hex} onClick={() => navigate(`/flight/${e.hex}`)} className="text-xs bg-red-900/70 hover:bg-red-800 border border-red-700 rounded-lg px-2 py-1 font-mono">
            {e.callsign ?? e.hex.toUpperCase()} · {e.squawk ?? '—'} <span className="font-sans text-red-200">{emergencyLabel(e.emergency, e.squawk)}</span>
          </button>
        ))}
        {list.length > 4 && <span className="text-xs text-red-200">+{list.length - 4} more</span>}
      </div>
    </div>
  );
}
