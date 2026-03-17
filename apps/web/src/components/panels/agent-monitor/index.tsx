import { useNavigate } from "@tanstack/react-router";
import { Monitor, TerminalSquare } from "lucide-react";
import { trpc } from "@/trpc";
import { PanelShell } from "@/components/layout/PanelShell";
import { cn } from "@/lib/utils";

export function AgentMonitorPanel() {
  const navigate = useNavigate();

  const agents = trpc.agents.list.useQuery(undefined, {
    refetchInterval: 5000,
  });

  const runningCount =
    agents.data?.filter((a) => a.status === "running").length ?? 0;
  const totalCount = agents.data?.length ?? 0;

  return (
    <PanelShell
      title="Agent Fleet"
      icon={<Monitor className="h-4 w-4" />}
      badge={`${runningCount} online`}
      loading={agents.isLoading}
      error={agents.error?.message}
      className="col-span-full self-start"
    >
      {totalCount > 0 ? (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {agents.data!.map((agent) => {
            const isRunning = agent.status === "running";
            const isError = agent.status === "error";

            return (
              <button
                key={agent.id}
                onClick={() =>
                  navigate({ to: "/agents", search: { id: agent.id } })
                }
                className={cn(
                  "relative overflow-hidden rounded-lg border bg-[rgba(40,30,70,0.5)] p-3.5 text-left transition-all duration-200",
                  "border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,45,123,0.15)] hover:bg-[rgba(45,35,78,0.6)]",
                )}
              >
                {/* Colored top edge */}
                {isRunning && (
                  <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-neon-cyan to-transparent" />
                )}

                {/* Header: name + status dot */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="truncate text-[11px] font-semibold text-cream">
                      {agent.name}
                    </span>
                    {agent.mode === "pty" && (
                      <TerminalSquare className="h-3 w-3 shrink-0 text-text-muted" />
                    )}
                    {agent.team && (
                      <span className="shrink-0 text-[9px] text-text-muted">
                        [{agent.team}]
                      </span>
                    )}
                  </div>
                  <div
                    className={cn(
                      "h-2 w-2 shrink-0 rounded-full",
                      isRunning &&
                        "bg-neon-cyan shadow-[0_0_10px_rgba(0,240,255,0.4)] animate-heartbeat",
                      agent.status === "stopped" && "bg-text-muted opacity-40",
                      isError && "bg-red-400 shadow-[0_0_10px_rgba(239,68,68,0.4)]"
                    )}
                  />
                </div>

                {/* Meta row: pid + status */}
                <div className="flex items-center justify-between text-[9px]">
                  <span
                    className={cn(
                      "font-mono tracking-wide",
                      isRunning ? "text-neon-cyan" : "text-text-muted"
                    )}
                  >
                    {isRunning
                      ? agent.pid
                        ? `PID ${agent.pid}`
                        : "RUNNING"
                      : "IDLE"}
                  </span>
                  <span className="text-text-muted">
                    {agent.pid ? `pid ${agent.pid}` : "—"}
                  </span>
                </div>

                {/* Activity bar */}
                <div className="mt-2 h-[2px] overflow-hidden rounded-full bg-[rgba(255,255,255,0.07)]">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      isRunning
                        ? "bg-neon-cyan shadow-[0_0_4px_rgba(0,240,255,0.5)]"
                        : isError
                          ? "bg-red-400"
                          : "bg-transparent"
                    )}
                    style={{
                      width: isRunning ? "70%" : isError ? "100%" : "0%",
                    }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="flex items-center justify-between rounded-lg bg-[rgba(0,0,0,0.2)] p-3 font-mono text-[11.5px] leading-relaxed">
          <div>
            <span className="text-neon-pink">$ </span>
            <span className="text-text-secondary">No agents running.</span>
          </div>
          <button
            onClick={() => navigate({ to: "/agents" })}
            className="shrink-0 text-neon-pink hover:underline text-[11px]"
          >
            Go to Agents →
          </button>
        </div>
      )}
    </PanelShell>
  );
}
