import { useRef, useState } from 'react';
import clsx from 'clsx';

/** Mobile bottom sheet with three snap points (peek / half / full) driven by drag. */
export function BottomSheet({ children, open, onClose }: { children: React.ReactNode; open: boolean; onClose: () => void }) {
  const [snap, setSnap] = useState<0 | 1 | 2>(1);
  const start = useRef<{ y: number; snap: number } | null>(null);
  if (!open) return null;
  const heights = ['30vh', '55vh', '92vh'];
  const onPointerDown = (e: React.PointerEvent) => { start.current = { y: e.clientY, snap }; (e.target as HTMLElement).setPointerCapture(e.pointerId); };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!start.current) return;
    const dy = e.clientY - start.current.y;
    if (dy > 60) { if (snap === 0) onClose(); else setSnap((snap - 1) as 0 | 1 | 2); }
    else if (dy < -60 && snap < 2) setSnap((snap + 1) as 0 | 1 | 2);
    start.current = null;
  };
  return (
    <div className={clsx('md:hidden fixed inset-x-0 bottom-0 z-40 panel rounded-b-none border-b-0 flex flex-col transition-[height] duration-200')} style={{ height: heights[snap] }}>
      <div className="flex justify-center py-2 cursor-grab touch-none" onPointerDown={onPointerDown} onPointerUp={onPointerUp} onClick={() => setSnap(snap === 2 ? 1 : 2)}><span className="w-10 h-1.5 rounded-full bg-slate-500" /></div>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}
