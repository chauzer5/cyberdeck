import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "./__root";
import { PanelGrid } from "@/components/layout/PanelGrid";
import { QuickStatsPanel } from "@/components/panels/placeholder";
import { AgentMonitorPanel } from "@/components/panels/agent-monitor";
import { SlackSummaryPanel } from "@/components/panels/slack-summary";
import { TodoPanel } from "@/components/panels/todos";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useSlackEnabled } from "@/hooks/useSlackEnabled";
import { RefreshCw } from "lucide-react";

function Dashboard() {
  useWebSocket();
  const { enabled: slackEnabled } = useSlackEnabled();

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-4">
        <div>
          <h1 className="font-display text-lg font-bold tracking-[2px] uppercase text-cream">
            Dashboard
          </h1>
          <p className="mt-0.5 text-xs text-text-muted">
            {today} — All systems operational
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 rounded-lg border border-border bg-transparent px-3.5 py-[7px] text-xs font-medium text-text-secondary transition-all hover:border-border-hover hover:bg-[rgba(255,45,123,0.06)]">
            <RefreshCw className="h-3.5 w-3.5" />
            Sync All
          </button>
        </div>
      </div>

      {/* Two-zone layout: main grid + pinned todo column */}
      <div className="flex flex-1 overflow-hidden">
        {/* Main content */}
        <div className="flex-1 overflow-y-auto">
          <PanelGrid>
            <QuickStatsPanel />
            {slackEnabled && <SlackSummaryPanel />}
            <AgentMonitorPanel />
          </PanelGrid>
        </div>

        {/* Pinned Todos column */}
        <div className="flex w-80 shrink-0 flex-col border-l border-border xl:w-[340px]">
          <TodoPanel />
        </div>
      </div>
    </div>
  );
}

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: Dashboard,
});
