import { Link, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import { Logo } from './Logo';
import { Icon } from './Icon';
import { SearchBox } from './SearchBox';
import { useAircraft } from '@/state/aircraft';
import { useAuth } from '@/state/auth';

const NAV = [
  { to: '/', label: 'Map', icon: 'plane' },
  { to: '/disruptions', label: 'Airports', icon: 'tower' },
  { to: '/playback', label: 'Playback', icon: 'clock' },
  { to: '/stats', label: 'Stats', icon: 'chart' },
  { to: '/ar', label: 'AR', icon: 'camera' },
];

export function TopBar({ children }: { children?: React.ReactNode }) {
  const loc = useLocation();
  const connected = useAircraft((s) => s.connected);
  const count = useAircraft((s) => s.count);
  const user = useAuth((s) => s.user);
  return (
    <header className="pointer-events-none absolute top-0 inset-x-0 z-30 p-2 md:p-3 flex items-start gap-2 md:gap-3">
      <Link to="/" className="pointer-events-auto panel px-3 h-11 flex items-center shrink-0" aria-label="Contrail home"><Logo /></Link>
      <div className="pointer-events-auto flex-1 max-w-xl"><SearchBox /></div>
      <nav className="pointer-events-auto hidden md:flex panel h-11 items-center px-1 gap-0.5 shrink-0" aria-label="Main">
        {NAV.map((n) => (
          <Link key={n.to} to={n.to} className={clsx('flex items-center gap-1.5 px-3 h-9 rounded-lg text-sm', (n.to === '/' ? loc.pathname === '/' || loc.pathname.startsWith('/flight') : loc.pathname.startsWith(n.to)) ? 'bg-ink-3 text-white' : 'text-slate-300 hover:bg-ink-3')}>
            <Icon name={n.icon} size={16} />{n.label}
          </Link>
        ))}
        <Link to="/account" className={clsx('flex items-center gap-1.5 px-3 h-9 rounded-lg text-sm', loc.pathname.startsWith('/account') ? 'bg-ink-3 text-white' : 'text-slate-300 hover:bg-ink-3')} title={user ? user.email : 'Account'}>
          <Icon name="user" size={16} />{user ? 'Account' : 'Sign in'}
        </Link>
      </nav>
      <div className="pointer-events-auto hidden lg:flex panel h-11 items-center px-3 gap-2 text-xs text-slate-300 shrink-0" title={connected ? 'Live feed connected' : 'Reconnecting…'}>
        <span className={clsx('w-2 h-2 rounded-full', connected ? 'bg-emerald-400' : 'bg-red-400 pulse-red')} />
        <span className="font-mono tabular-nums">{count.toLocaleString()}</span> in view
      </div>
      {children}
    </header>
  );
}

export function MobileNav() {
  const loc = useLocation();
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 panel rounded-none border-x-0 border-b-0 safe-bottom flex justify-around px-1" aria-label="Main">
      {[...NAV, { to: '/account', label: 'Account', icon: 'user' }].map((n) => (
        <Link key={n.to} to={n.to} className={clsx('flex flex-col items-center gap-0.5 py-2 px-2 text-[10px]', (n.to === '/' ? loc.pathname === '/' || loc.pathname.startsWith('/flight') : loc.pathname.startsWith(n.to)) ? 'text-accent' : 'text-slate-400')}>
          <Icon name={n.icon} size={20} />{n.label}
        </Link>
      ))}
    </nav>
  );
}
