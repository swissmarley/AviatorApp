import { create } from 'zustand';
import { api, authStatus, getMe, setAuthToken, type Me } from '@/lib/api';
import { useSettings } from './settings';

interface AuthStore {
  ready: boolean;
  accountsEnabled: boolean;
  notifications: { push: boolean; email: boolean; vapidPublicKey?: string };
  user: { id: string; email: string } | null;
  me: Me | null;
  init: () => Promise<void>;
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuth = create<AuthStore>((set, get) => ({
  ready: false,
  accountsEnabled: false,
  notifications: { push: false, email: false },
  user: null,
  me: null,
  init: async () => {
    try {
      const s = await authStatus();
      set({ accountsEnabled: s.accountsEnabled, user: s.user, notifications: s.notifications, ready: true });
      if (s.user) await get().refresh();
    } catch {
      set({ ready: true });
    }
  },
  refresh: async () => {
    try {
      const me = await getMe();
      set({ me, user: me.user });
      useSettings.getState().replace(me.settings);
    } catch {
      set({ me: null });
    }
  },
  login: async (email, password) => {
    const r = await api<{ user: { id: string; email: string }; token: string }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    setAuthToken(r.token);
    set({ user: r.user });
    await get().refresh();
  },
  register: async (email, password, displayName) => {
    const r = await api<{ user: { id: string; email: string }; token: string }>('/api/auth/register', { method: 'POST', body: JSON.stringify({ email, password, displayName }) });
    setAuthToken(r.token);
    set({ user: r.user });
    await get().refresh();
  },
  logout: async () => {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
    setAuthToken(null);
    set({ user: null, me: null });
  },
}));
