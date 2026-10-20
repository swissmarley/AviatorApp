import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import clsx from 'clsx';
import { MapView } from '@/map/MapView';
import { TopBar, MobileNav } from '@/components/TopBar';
import { LayerMenu } from '@/components/LayerMenu';
import { FilterPanel } from '@/components/FilterPanel';
import { EmergencyBanner } from '@/components/EmergencyBanner';
import { FlightPanel } from '@/components/FlightPanel';
import { BottomSheet } from '@/components/BottomSheet';
import { Icon } from '@/components/Icon';
import { live } from '@/lib/ws';
import { useUi } from '@/state/ui';
import { isFilterActive, useFilters } from '@/state/filters';
import { useAircraft } from '@/state/aircraft';

export function MapPage() {
  const { hex } = useParams<{ hex?: string }>();
  const navigate = useNavigate();
  const selected = hex?.toLowerCase() ?? null;
  const [menu, setMenu] = useState<'layers' | 'filters' | null>(null);
  const filterOn = useFilters((s) => isFilterActive(s.active));
  const setFollow = useUi((s) => s.setFollow);
  const connected = useAircraft((s) => s.connected);

  useEffect(() => { live.connect(); return () => live.disconnect(); }, []);
  useEffect(() => { if (!selected) setFollow(false); }, [selected, setFollow]);

  const onSelect = useCallback((h: string | null) => {
    navigate(h ? `/flight/${h}${location.hash}` : `/${location.hash}`, { replace: !!selected && !!h });
  }, [navigate, selected]);

  return (
    <div className="h-full w-full relative">
      <MapView mode="live" selectedHex={selected} onSelect={onSelect} />
      <TopBar />
      <EmergencyBanner />

      {/* right-hand controls */}
      <div className="absolute right-2 md:right-3 top-16 md:top-[4.25rem] z-30 flex flex-col gap-2 items-end">
        <button className={clsx('icon-btn', menu === 'layers' && 'bg-ink-3')} onClick={() => setMenu(menu === 'layers' ? null : 'layers')} aria-label="Map style and layers" title="Map & layers"><Icon name="layers" /></button>
        <button className={clsx('icon-btn relative', menu === 'filters' && 'bg-ink-3')} onClick={() => setMenu(menu === 'filters' ? null : 'filters')} aria-label="Filters" title="Filters"><Icon name="filter" />{filterOn && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-accent" />}</button>
        {menu === 'layers' && <LayerMenu onClose={() => setMenu(null)} />}
        {menu === 'filters' && <FilterPanel onClose={() => setMenu(null)} />}
      </div>

      {!connected && <div className="absolute bottom-24 md:bottom-10 left-1/2 -translate-x-1/2 z-20 panel px-3 py-1.5 text-xs text-slate-300 pulse-red">Connecting to live feed…</div>}

      {/* Details: side panel on desktop, bottom sheet on mobile */}
      {selected && (
        <>
          <aside className="hidden md:flex absolute left-3 top-[4.25rem] bottom-8 w-[380px] z-30 panel overflow-hidden flex-col">
            <FlightPanel hex={selected} onClose={() => onSelect(null)} />
          </aside>
          <BottomSheet open onClose={() => onSelect(null)}>
            <FlightPanel hex={selected} onClose={() => onSelect(null)} compact />
          </BottomSheet>
        </>
      )}
      {!selected && <MobileNav />}
      <Legend />
    </div>
  );
}

function Legend() {
  return (
    <div className="hidden lg:flex absolute bottom-8 right-14 z-20 panel px-2 py-1 items-center gap-3 text-[10px] text-slate-300">
      <span className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm" style={{ background: '#f5c542' }} />Airborne</span>
      <span className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm" style={{ background: '#8fa3bf' }} />Ground</span>
      <span className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm" style={{ background: '#9acd32' }} />Military</span>
      <span className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm" style={{ background: '#fb923c' }} />Helicopter</span>
      <span className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm opacity-50" style={{ background: '#f5c542' }} />Estimated</span>
      <span className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-full" style={{ background: '#ef4444' }} />Emergency</span>
    </div>
  );
}
