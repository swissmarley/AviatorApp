import { lazy, Suspense, useEffect } from 'react';
import { Route, Routes, useNavigate } from 'react-router-dom';
import { MapPage } from './pages/MapPage';
import { Toast } from './components/Toast';
import { useAuth } from './state/auth';

const AirportPage = lazy(() => import('./pages/AirportPage').then((m) => ({ default: m.AirportPage })));
const DisruptionsPage = lazy(() => import('./pages/DisruptionsPage').then((m) => ({ default: m.DisruptionsPage })));
const PlaybackPage = lazy(() => import('./pages/PlaybackPage').then((m) => ({ default: m.PlaybackPage })));
const StatsPage = lazy(() => import('./pages/StatsPage').then((m) => ({ default: m.StatsPage })));
const ArPage = lazy(() => import('./pages/ArPage').then((m) => ({ default: m.ArPage })));
const AccountPage = lazy(() => import('./pages/AccountPage').then((m) => ({ default: m.AccountPage })));
const ThreeDPage = lazy(() => import('./pages/ThreeDPage').then((m) => ({ default: m.ThreeDPage })));
const HistoryPage = lazy(() => import('./pages/HistoryPage').then((m) => ({ default: m.HistoryPage })));

function Loading() {
  return <div className="h-full w-full flex items-center justify-center text-slate-400 text-sm">Loading…</div>;
}

export default function App() {
  const navigate = useNavigate();
  const init = useAuth((s) => s.init);
  useEffect(() => { void init(); }, [init]);
  useEffect(() => {
    const onAirport = (e: Event) => navigate(`/airport/${(e as CustomEvent<string>).detail}`);
    window.addEventListener('contrail:airport', onAirport);
    return () => window.removeEventListener('contrail:airport', onAirport);
  }, [navigate]);

  return (
    <div className="h-full w-full relative overflow-hidden">
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<MapPage />} />
          <Route path="/flight/:hex" element={<MapPage />} />
          <Route path="/airport/:code" element={<AirportPage />} />
          <Route path="/disruptions" element={<DisruptionsPage />} />
          <Route path="/playback" element={<PlaybackPage />} />
          <Route path="/history/:kind/:id" element={<HistoryPage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/ar" element={<ArPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/3d/:hex" element={<ThreeDPage />} />
          <Route path="*" element={<MapPage />} />
        </Routes>
      </Suspense>
      <Toast />
    </div>
  );
}
