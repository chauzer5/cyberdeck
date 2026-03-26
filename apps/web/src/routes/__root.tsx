import { createRootRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { CommandBar } from "@/components/command-bar/CommandBar";
import { useLayoutStore } from "@/stores/layout";
import { useTheme } from "@/hooks/useTheme";

const PARTICLES = [
  { left: "15%", duration: "18s", delay: "0s" },
  { left: "35%", duration: "22s", delay: "3s" },
  { left: "55%", duration: "20s", delay: "6s" },
  { left: "75%", duration: "24s", delay: "2s" },
  { left: "90%", duration: "19s", delay: "8s" },
  { left: "8%", duration: "25s", delay: "5s" },
  { left: "45%", duration: "21s", delay: "10s" },
  { left: "65%", duration: "23s", delay: "1s" },
];

function RootLayout() {
  const { theme } = useTheme();
  const commandBarOpen = useLayoutStore((s) => s.commandBarOpen);
  const setCommandBarOpen = useLayoutStore((s) => s.setCommandBarOpen);
  const vscodeIframeMounted = useLayoutStore((s) => s.vscodeIframeMounted);
  const currentPath = useRouterState({ select: (s) => s.location.pathname });
  const isOnCodePage = currentPath === "/code";

  // Global Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandBarOpen(!commandBarOpen);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [commandBarOpen, setCommandBarOpen]);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Cyberpunk overlays */}
      {theme === "cyberpunk" && (
        <>
          <div className="scanlines" />
          <div className="grid-floor" />
          <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
            {PARTICLES.map((p, i) => (
              <div
                key={i}
                className="absolute h-1 w-1 rounded-full bg-neon-pink opacity-0 shadow-[0_0_6px_rgba(255,45,123,0.8)]"
                style={{
                  left: p.left,
                  animation: `float-up ${p.duration} linear ${p.delay} infinite`,
                }}
              />
            ))}
          </div>
        </>
      )}

      {/* Prismatic overlay */}
      {theme === "prismatic" && <div className="prismatic-shimmer" />}

      {/* Deep Space overlay */}
      {theme === "deep-space" && <div className="starfield" />}

      <div className="relative z-10 flex">
        <Sidebar />
      </div>
      <main className="relative flex-1 overflow-hidden">
        <div className="h-full overflow-auto">
          <Outlet />
        </div>
        {/* Persistent VS Code iframe — rendered in root so it survives route changes.
            Visible only on /code, but stays mounted (hidden) on other pages to preserve state. */}
        {vscodeIframeMounted && (
          <div
            id="vscode-iframe-container"
            className="absolute inset-0"
            style={{
              visibility: isOnCodePage ? "visible" : "hidden",
              zIndex: isOnCodePage ? 10 : -1,
            }}
          >
            <iframe
              src="http://127.0.0.1:8767"
              className="h-full w-full border-0"
              title="VS Code"
              allow="clipboard-read; clipboard-write"
            />
          </div>
        )}
      </main>

      {commandBarOpen && (
        <CommandBar onClose={() => setCommandBarOpen(false)} />
      )}
    </div>
  );
}

export const rootRoute = createRootRoute({
  component: RootLayout,
});
