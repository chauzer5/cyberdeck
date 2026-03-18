import { create } from "zustand";

export type Theme = "cyberpunk" | "prismatic" | "deep-space";

const VALID_THEMES: Theme[] = ["prismatic", "cyberpunk", "deep-space"];

interface ThemeState {
  theme: Theme;
  initialized: boolean;
  setTheme: (t: Theme) => void;
  initialize: (t: string | null | undefined) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: "prismatic",
  initialized: false,
  setTheme: (t) => {
    if (!VALID_THEMES.includes(t)) return;
    document.documentElement.setAttribute("data-theme", t);
    set({ theme: t });
  },
  initialize: (value) => {
    const t: Theme = VALID_THEMES.includes(value as Theme) ? (value as Theme) : "prismatic";
    document.documentElement.setAttribute("data-theme", t);
    set({ theme: t, initialized: true });
  },
}));
