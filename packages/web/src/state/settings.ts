import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_SETTINGS, type UserSettings } from '@contrail/shared';

export type LayerKey = 'airports' | 'fir' | 'radar' | 'clouds' | 'airways' | 'navaids' | 'terminator' | 'labels';

interface SettingsStore {
  settings: UserSettings;
  layers: Record<LayerKey, boolean>;
  update: (patch: Partial<UserSettings>) => void;
  toggleLayer: (key: LayerKey, on?: boolean) => void;
  replace: (s: UserSettings) => void;
}

export const useSettings = create<SettingsStore>()(
  persist(
    (set, get) => ({
      settings: DEFAULT_SETTINGS,
      layers: { airports: true, fir: false, radar: false, clouds: false, airways: false, navaids: false, terminator: true, labels: true },
      update: (patch) => set({ settings: { ...get().settings, ...patch } }),
      toggleLayer: (key, on) => set({ layers: { ...get().layers, [key]: on ?? !get().layers[key] } }),
      replace: (s) => set({ settings: { ...DEFAULT_SETTINGS, ...s } }),
    }),
    { name: 'contrail:settings' },
  ),
);
