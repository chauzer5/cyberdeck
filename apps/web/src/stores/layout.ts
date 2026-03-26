import { create } from "zustand";

interface LayoutState {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  commandBarOpen: boolean;
  setCommandBarOpen: (open: boolean) => void;
  vscodeIframeMounted: boolean;
  setVscodeIframeMounted: (mounted: boolean) => void;
}

export const useLayoutStore = create<LayoutState>((set) => ({
  sidebarOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  commandBarOpen: false,
  setCommandBarOpen: (open) => set({ commandBarOpen: open }),
  vscodeIframeMounted: false,
  setVscodeIframeMounted: (mounted) => set({ vscodeIframeMounted: mounted }),
}));
