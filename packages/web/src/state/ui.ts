import { create } from 'zustand';

interface UiStore {
  follow: boolean;
  panelOpen: boolean;
  sheetExpanded: boolean;
  layersOpen: boolean;
  filtersOpen: boolean;
  searchOpen: boolean;
  toast: { id: number; text: string; kind?: 'info' | 'error' | 'success' } | null;
  setFollow: (v: boolean) => void;
  setPanelOpen: (v: boolean) => void;
  setSheetExpanded: (v: boolean) => void;
  setLayersOpen: (v: boolean) => void;
  setFiltersOpen: (v: boolean) => void;
  setSearchOpen: (v: boolean) => void;
  notify: (text: string, kind?: 'info' | 'error' | 'success') => void;
}

let toastId = 0;
export const useUi = create<UiStore>((set) => ({
  follow: false,
  panelOpen: false,
  sheetExpanded: false,
  layersOpen: false,
  filtersOpen: false,
  searchOpen: false,
  toast: null,
  setFollow: (follow) => set({ follow }),
  setPanelOpen: (panelOpen) => set({ panelOpen }),
  setSheetExpanded: (sheetExpanded) => set({ sheetExpanded }),
  setLayersOpen: (layersOpen) => set({ layersOpen, filtersOpen: layersOpen ? false : undefined as unknown as boolean }),
  setFiltersOpen: (filtersOpen) => set({ filtersOpen, layersOpen: filtersOpen ? false : undefined as unknown as boolean }),
  setSearchOpen: (searchOpen) => set({ searchOpen }),
  notify: (text, kind = 'info') => {
    const id = ++toastId;
    set({ toast: { id, text, kind } });
    setTimeout(() => set((s) => (s.toast?.id === id ? { toast: null } : {})), 3500);
  },
}));
