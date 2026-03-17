import { createRootRoute, Outlet } from "@tanstack/react-router";
import { Sidebar } from "@/components/layout/Sidebar";

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
  return (
    <div className="flex h-screen overflow-hidden">
      {/* CRT Scanlines */}
      <div className="scanlines" />
      {/* Perspective grid floor */}
      <div className="grid-floor" />

      {/* Floating particles */}
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

      <Sidebar />
      <main className="relative z-[1] flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}

export const rootRoute = createRootRoute({
  component: RootLayout,
});
