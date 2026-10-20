import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import type { AlertKind, UserSettings } from '@contrail/shared';
import { TopBar, MobileNav } from '@/components/TopBar';
import { Icon } from '@/components/Icon';
import { useAuth } from '@/state/auth';
import { useSettings } from '@/state/settings';
import { useUi } from '@/state/ui';
import { api } from '@/lib/api';
import { currentSubscription, disablePush, enablePush, pushSupported } from '@/lib/push';
import { MAP_STYLES } from '@/lib/mapStyles';

export function AccountPage() {
  const { ready, accountsEnabled, user, me, notifications, login, register, logout, refresh } = useAuth();
  return (
    <div className="h-full overflow-auto scroll-thin">
      <TopBar />
      <main className="max-w-4xl mx-auto px-3 pt-16 md:pt-20 pb-24 md:pb-10 space-y-4">
        {!ready ? <div className="text-slate-400 text-sm">Loading…</div> : !user ? (
          <AuthForm enabled={accountsEnabled} onLogin={login} onRegister={register} />
        ) : (
          <>
            <section className="panel p-4 flex flex-wrap items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-ink-3 flex items-center justify-center"><Icon name="user" /></div>
              <div className="flex-1 min-w-0"><div className="font-semibold">{me?.user.displayName ?? user.email}</div><div className="text-xs text-slate-400 truncate">{user.email}</div></div>
              <button className="btn" onClick={() => void logout()}>Sign out</button>
            </section>
            <SettingsSection />
            <NotificationsSection push={notifications.push} email={notifications.email} vapid={notifications.vapidPublicKey} subscriptions={me?.pushSubscriptions ?? 0} onChange={refresh} />
            <AlertsSection alerts={me?.alerts ?? []} events={me?.events ?? []} onChange={refresh} />
            <BookmarksSection bookmarks={me?.bookmarks ?? []} onChange={refresh} />
          </>
        )}
        {!user && <SettingsSection />}
      </main>
      <MobileNav />
    </div>
  );
}

function AuthForm({ enabled, onLogin, onRegister }: { enabled: boolean; onLogin: (e: string, p: string) => Promise<void>; onRegister: (e: string, p: string, n?: string) => Promise<void> }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try { if (mode === 'login') await onLogin(email, password); else await onRegister(email, password, name || undefined); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  return (
    <section className="panel p-5 max-w-md mx-auto">
      <h1 className="text-lg font-semibold mb-1">{mode === 'login' ? 'Sign in' : 'Create your account'}</h1>
      <p className="text-xs text-slate-400 mb-4">Accounts keep bookmarks, saved filters, alerts and settings in sync across devices.</p>
      {!enabled && <div className="mb-3 rounded-lg bg-amber-950/60 border border-amber-700 text-amber-100 text-xs px-3 py-2">The server is running without a database, so accounts are disabled. Set DATABASE_URL (docker-compose does this for you) to enable them. Settings below are still saved in this browser.</div>}
      <form onSubmit={submit} className="space-y-3">
        {mode === 'register' && <label className="block text-xs text-slate-400">Display name<input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} /></label>}
        <label className="block text-xs text-slate-400">Email<input className="input mt-1" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
        <label className="block text-xs text-slate-400">Password<input className="input mt-1" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>
        {error && <div className="text-xs text-red-300">{error}</div>}
        <button className="btn btn-primary w-full justify-center" disabled={busy || !enabled}>{mode === 'login' ? 'Sign in' : 'Create account'}</button>
      </form>
      <button className="mt-3 text-xs text-accent-2 hover:underline" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? 'No account yet? Create one' : 'Already registered? Sign in'}</button>
    </section>
  );
}

function SettingsSection() {
  const { settings, update } = useSettings();
  const user = useAuth((s) => s.user);
  const notify = useUi((s) => s.notify);
  const [tzList] = useState<string[]>(() => { try { return (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? []; } catch { return []; } });
  const save = async (patch: Partial<UserSettings>) => {
    update(patch);
    if (user) { try { await api('/api/me/settings', { method: 'PUT', body: JSON.stringify(patch) }); } catch (e) { notify((e as Error).message, 'error'); } }
  };
  return (
    <section className="panel p-4">
      <h2 className="font-semibold mb-3 flex items-center gap-2"><Icon name="settings" size={16} />Settings</h2>
      <div className="grid sm:grid-cols-2 gap-4 text-sm">
        <Field label="Units">
          <div className="flex gap-1">{(['aviation', 'metric', 'imperial'] as const).map((u) => <button key={u} onClick={() => void save({ units: u })} className={clsx('btn flex-1 justify-center capitalize', settings.units === u && 'btn-primary')}>{u}</button>)}</div>
          <p className="text-[11px] text-slate-500 mt-1">Aviation: ft, kt, nm · Metric: m, km/h, km · Imperial: ft, mph, mi</p>
        </Field>
        <Field label="Time zone">
          <select className="input" value={settings.timeZone} onChange={(e) => void save({ timeZone: e.target.value })}>
            <option value="local">Device local time</option>
            <option value="utc">UTC</option>
            {tzList.map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
        </Field>
        <Field label={`Aircraft icon size · ${settings.iconSize.toFixed(1)}×`}><input type="range" min={0.5} max={2} step={0.1} value={settings.iconSize} onChange={(e) => void save({ iconSize: Number(e.target.value) })} className="w-full accent-amber-400" /></Field>
        <Field label="Trail length">
          <select className="input" value={settings.trailLength} onChange={(e) => void save({ trailLength: Number(e.target.value) })}>
            <option value={0}>Whole flight</option><option value={5}>5 minutes</option><option value={15}>15 minutes</option><option value={30}>30 minutes</option><option value={60}>1 hour</option>
          </select>
        </Field>
        <Field label="Default map style"><div className="flex gap-1">{MAP_STYLES.map((s) => <button key={s.key} onClick={() => void save({ mapStyle: s.key })} className={clsx('btn flex-1 justify-center', settings.mapStyle === s.key && 'btn-primary')}>{s.label}</button>)}</div></Field>
        <Field label="Aircraft labels"><label className="flex items-center gap-2"><input type="checkbox" checked={settings.labels} onChange={(e) => void save({ labels: e.target.checked })} className="accent-amber-400" />Show callsign labels when zoomed in</label></Field>
      </div>
      <InstallHint />
    </section>
  );
}

function InstallHint() {
  const [prompt, setPrompt] = useState<(Event & { prompt: () => Promise<void> }) | null>(null);
  useEffect(() => {
    const h = (e: Event) => { e.preventDefault(); setPrompt(e as Event & { prompt: () => Promise<void> }); };
    window.addEventListener('beforeinstallprompt', h);
    return () => window.removeEventListener('beforeinstallprompt', h);
  }, []);
  const standalone = window.matchMedia('(display-mode: standalone)').matches;
  if (standalone) return null;
  return (
    <div className="mt-4 text-xs text-slate-400 flex flex-wrap items-center gap-2">
      <Icon name="external" size={14} /> Contrail is an installable app.
      {prompt ? <button className="btn text-xs" onClick={() => void prompt.prompt()}>Install</button> : <span>Use your browser's “Install app” / “Add to Home Screen” option.</span>}
    </div>
  );
}

function NotificationsSection({ push, email, vapid, subscriptions, onChange }: { push: boolean; email: boolean; vapid?: string; subscriptions: number; onChange: () => Promise<void> }) {
  const notify = useUi((s) => s.notify);
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  useEffect(() => { void currentSubscription().then((s) => setSubscribed(!!s)); }, []);
  const toggle = async () => {
    try {
      if (subscribed) { await disablePush(); setSubscribed(false); notify('Push disabled'); }
      else { await enablePush(vapid!); setSubscribed(true); notify('Push enabled on this device', 'success'); }
      await onChange();
    } catch (e) { notify((e as Error).message, 'error'); }
  };
  const test = async () => { try { const r = await api<{ sent: number }>('/api/me/push/test', { method: 'POST' }); notify(`Sent to ${r.sent} device(s)`, 'success'); } catch (e) { notify((e as Error).message, 'error'); } };
  return (
    <section className="panel p-4 text-sm">
      <h2 className="font-semibold mb-2 flex items-center gap-2"><Icon name="bell" size={16} />Notifications</h2>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="rounded-lg bg-ink-3/60 p-3">
          <div className="font-medium">Push</div>
          {!push ? <p className="text-xs text-slate-400 mt-1">Server has no VAPID keys. Generate them with <code className="font-mono">npx web-push generate-vapid-keys</code> and set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY.</p>
            : !pushSupported() ? <p className="text-xs text-slate-400 mt-1">Not supported in this browser.</p>
            : <div className="flex items-center gap-2 mt-2"><button className={clsx('btn', !subscribed && 'btn-primary')} onClick={toggle} disabled={subscribed === null}>{subscribed ? 'Disable on this device' : 'Enable on this device'}</button>{subscribed && <button className="btn" onClick={test}>Send test</button>}<span className="text-xs text-slate-400">{subscriptions} device(s)</span></div>}
        </div>
        <div className="rounded-lg bg-ink-3/60 p-3">
          <div className="font-medium">Email</div>
          <p className="text-xs text-slate-400 mt-1">{email ? 'Alerts can be emailed to your account address.' : 'Server has no SMTP_URL configured; email alerts are disabled.'}</p>
        </div>
      </div>
    </section>
  );
}

const KINDS: AlertKind[] = ['departure', 'landing', 'delay', 'emergency'];

function AlertsSection({ alerts, events, onChange }: { alerts: { id: string; kind: AlertKind; subject: string; channels: string[]; enabled: boolean; lastFiredAt?: string }[]; events: { id: number; firedAt: string; title: string; body: string; payload: { url?: string; hex?: string }; read: boolean }[]; onChange: () => Promise<void> }) {
  const notify = useUi((s) => s.notify);
  const [subject, setSubject] = useState('');
  const [kind, setKind] = useState<AlertKind>('departure');
  const [channels, setChannels] = useState<('push' | 'email')[]>(['push']);
  const navigate = useNavigate();
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await api('/api/me/alerts', { method: 'POST', body: JSON.stringify({ kind, subject: subject.trim(), channels }) }); setSubject(''); await onChange(); notify('Alert added', 'success'); } catch (err) { notify((err as Error).message, 'error'); }
  };
  const del = async (id: string) => { await api(`/api/me/alerts/${id}`, { method: 'DELETE' }); await onChange(); };
  const toggle = async (id: string, enabled: boolean) => { await api(`/api/me/alerts/${id}`, { method: 'PATCH', body: JSON.stringify({ enabled }) }); await onChange(); };
  useEffect(() => { if (events.some((e) => !e.read)) api('/api/me/alerts/events/read', { method: 'POST' }).catch(() => undefined); }, [events]);
  return (
    <section className="panel p-4 text-sm">
      <h2 className="font-semibold mb-2 flex items-center gap-2"><Icon name="alert" size={16} />Alerts</h2>
      <form onSubmit={add} className="grid sm:grid-cols-[1fr_auto_auto_auto] gap-2 items-end mb-3">
        <label className="text-xs text-slate-400">Flight no., callsign, registration or hex (<span className="font-mono">*</span> = any aircraft, emergencies only)<input className="input mt-1 font-mono uppercase" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="BA117" required /></label>
        <label className="text-xs text-slate-400">Event<select className="input mt-1 capitalize" value={kind} onChange={(e) => setKind(e.target.value as AlertKind)}>{KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</select></label>
        <div className="flex gap-1 pb-0.5">{(['push', 'email'] as const).map((c) => <button type="button" key={c} onClick={() => setChannels(channels.includes(c) ? channels.filter((x) => x !== c) : [...channels, c])} className={clsx('chip cursor-pointer', channels.includes(c) && 'bg-accent text-ink border-accent')}>{c}</button>)}</div>
        <button className="btn btn-primary" disabled={!subject.trim() || !channels.length}>Add</button>
      </form>
      <ul className="divide-y divide-line">
        {alerts.map((a) => (
          <li key={a.id} className="py-2 flex items-center gap-3">
            <span className="font-mono font-semibold w-24 truncate">{a.subject}</span>
            <span className="chip capitalize">{a.kind}</span>
            <span className="text-xs text-slate-400 flex-1">{a.channels.join(' + ')}{a.lastFiredAt ? ` · last fired ${new Date(a.lastFiredAt).toLocaleString()}` : ''}</span>
            <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={a.enabled} onChange={(e) => void toggle(a.id, e.target.checked)} className="accent-amber-400" />on</label>
            <button className="icon-btn w-8 h-8" onClick={() => void del(a.id)} aria-label="Delete"><Icon name="trash" size={14} /></button>
          </li>
        ))}
        {!alerts.length && <li className="py-3 text-xs text-slate-500">No alerts yet. Add one above or use “Alert” in a flight's details panel.</li>}
      </ul>
      {events.length > 0 && (
        <div className="mt-4">
          <div className="text-[11px] uppercase tracking-wide text-slate-400 mb-1">Recent notifications</div>
          <ul className="space-y-1">
            {events.slice(0, 10).map((e) => <li key={e.id} className={clsx('rounded-lg px-3 py-2 bg-ink-3/60 cursor-pointer hover:bg-ink-3', !e.read && 'border border-accent/50')} onClick={() => e.payload.hex && navigate(`/flight/${e.payload.hex}`)}><div className="flex justify-between gap-2"><span className="font-medium">{e.title}</span><span className="text-[11px] text-slate-400">{new Date(e.firedAt).toLocaleString()}</span></div><div className="text-xs text-slate-300">{e.body}</div></li>)}
          </ul>
        </div>
      )}
    </section>
  );
}

function BookmarksSection({ bookmarks, onChange }: { bookmarks: { id: string; kind: string; label: string; data: { lat?: number; lon?: number; zoom?: number; hex?: string; reg?: string; icao?: string } }[]; onChange: () => Promise<void> }) {
  const del = async (id: string) => { await api(`/api/me/bookmarks/${id}`, { method: 'DELETE' }); await onChange(); };
  const href = (b: { kind: string; data: { lat?: number; lon?: number; zoom?: number; hex?: string; reg?: string; icao?: string } }) =>
    b.kind === 'flight' ? (b.data.hex ? `/flight/${b.data.hex}` : `/history/registration/${b.data.reg}`) : b.kind === 'airport' ? `/airport/${b.data.icao}` : `/#map=${b.data.zoom ?? 9}/${b.data.lat}/${b.data.lon}`;
  return (
    <section className="panel p-4 text-sm">
      <h2 className="font-semibold mb-2 flex items-center gap-2"><Icon name="bookmark" size={16} />Bookmarks</h2>
      <ul className="divide-y divide-line">
        {bookmarks.map((b) => (
          <li key={b.id} className="py-2 flex items-center gap-3">
            <span className="chip capitalize w-20 justify-center">{b.kind}</span>
            <Link to={href(b)} className="flex-1 hover:text-accent-2 truncate">{b.label}</Link>
            {b.kind === 'flight' && b.data.reg && <Link to={`/history/registration/${b.data.reg}`} className="text-xs text-slate-400 hover:text-accent-2">history</Link>}
            <button className="icon-btn w-8 h-8" onClick={() => void del(b.id)} aria-label="Delete"><Icon name="trash" size={14} /></button>
          </li>
        ))}
        {!bookmarks.length && <li className="py-3 text-xs text-slate-500">Bookmark map locations from the map (layers menu → “Bookmark this view”), flights from the details panel and airports from their page.</li>}
      </ul>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="block text-[11px] uppercase tracking-wide text-slate-400 mb-1">{label}</span>{children}</label>;
}
