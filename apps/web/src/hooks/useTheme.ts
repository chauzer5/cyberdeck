import { useEffect } from "react";
import { trpc } from "@/trpc";
import { useThemeStore, type Theme } from "@/stores/theme";

export type { Theme } from "@/stores/theme";

export function useTheme() {
  const { theme, setTheme: storeSetTheme, initialized, initialize } = useThemeStore();
  const { data } = trpc.settings.get.useQuery(
    { key: "theme" },
    { refetchOnWindowFocus: false },
  );
  const setSetting = trpc.settings.set.useMutation();

  // Initialize from server once
  useEffect(() => {
    if (!initialized && data !== undefined) {
      initialize(data);
    }
  }, [initialized, data, initialize]);

  function setTheme(t: Theme) {
    storeSetTheme(t);
    setSetting.mutate({ key: "theme", value: t });
  }

  return { theme, setTheme };
}
