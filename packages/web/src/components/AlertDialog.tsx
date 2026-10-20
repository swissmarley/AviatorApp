import { useState } from 'react';
import type { AlertKind } from '@contrail/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/state/auth';
import { useUi } from '@/state/ui';
import { Icon } from './Icon';

export function AlertDialog({ subject, onClose }: { subject: string; onClose: () => void }) {
  const [kinds, setKinds] = useState<AlertKind[]>(['departure', 'landing']);
  const [channels, setChannels] = useState<('push' | 'email')[]>(['push']);
  const [busy, setBusy] = useState(false);
  const notifications = useAuth((s) => s.notifications);
  const refresh = useAuth((s) => s.refresh);
  const notify = useUi((s) => s.notify);
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const submit = async () => {
    setBusy(true);
    try {
      for (const kind of kinds) await api('/api/me/alerts', { method: 'POST', body: JSON.stringify({ kind, subject, channels }) });
      await refresh();
      notify(`Alert set for ${subject}`, 'success');
      onClose();
    } catch (e) { notify((e as Error).message, 'error'); } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end md:items-center justify-center p-3" onClick={onClose}>
      <div className="panel w-full max-w-sm p-4 text-sm" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Set alert">
        <div className="flex items-center justify-between mb-3"><span className="font-semibold">Alert for <span className="font-mono">{subject}</span></span><button className="icon-btn w-7 h-7" onClick={onClose} aria-label="Close"><Icon name="close" size={14} /></button></div>
        <div className="text-[11px] uppercase tracking-wide text-slate-400 mb-1">Notify me on</div>
        <div className="grid grid-cols-2 gap-1 mb-3">
          {(['departure', 'landing', 'delay', 'emergency'] as AlertKind[]).map((k) => <label key={k} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-ink-3 cursor-pointer capitalize"><input type="checkbox" checked={kinds.includes(k)} onChange={() => setKinds(toggle(kinds, k))} className="accent-amber-400" />{k}</label>)}
        </div>
        <div className="text-[11px] uppercase tracking-wide text-slate-400 mb-1">Via</div>
        <div className="grid grid-cols-2 gap-1 mb-3">
          <label className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-ink-3 cursor-pointer"><input type="checkbox" checked={channels.includes('push')} onChange={() => setChannels(toggle(channels, 'push'))} className="accent-amber-400" />Push{!notifications.push && <span className="text-[10px] text-slate-500">(server not configured)</span>}</label>
          <label className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-ink-3 cursor-pointer"><input type="checkbox" checked={channels.includes('email')} onChange={() => setChannels(toggle(channels, 'email'))} className="accent-amber-400" />Email{!notifications.email && <span className="text-[10px] text-slate-500">(server not configured)</span>}</label>
        </div>
        <button className="btn btn-primary w-full justify-center" disabled={busy || !kinds.length || !channels.length} onClick={submit}>Save alert</button>
      </div>
    </div>
  );
}
