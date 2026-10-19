import { useUi } from '@/state/ui';
import clsx from 'clsx';

export function Toast() {
  const toast = useUi((s) => s.toast);
  if (!toast) return null;
  return (
    <div className={clsx('fixed left-1/2 -translate-x-1/2 bottom-24 md:bottom-8 z-[60] px-4 py-2 rounded-lg text-sm shadow-xl border', toast.kind === 'error' ? 'bg-red-950 border-red-700 text-red-100' : toast.kind === 'success' ? 'bg-emerald-950 border-emerald-700 text-emerald-100' : 'bg-ink-2 border-line text-slate-100')} role="status">
      {toast.text}
    </div>
  );
}
