import { useNavigate } from "@tanstack/react-router";
import { Bot } from "lucide-react";
import { trpc } from "@/trpc";
import { useAgentsStore } from "@/stores/agents";
import { PanelShell } from "@/components/layout/PanelShell";
import { cn } from "@/lib/utils";

const STATUS_DOT = {
  running: "bg-neon-yellow shadow-[0_0_6px_rgba(250,204,21,0.5)] animate-pulse",
  waiting: "bg-neon-green shadow-[0_0_6px_rgba(0,255,136,0.5)]",
  completed: "bg-neon-cyan/50",
  failed: "bg-red-400",
  stopped: "bg-text-muted/40",
} as const;

export function AgentMonitorPanel() {
  const navigate = useNavigate();
  const setSelectedAgentId = useAgentsStore((s) => s.setSelectedAgentId);

  const agentsQuery = trpc.agents.list.useQuery(undefined, {
    refetchInterval: 5000,
    staleTime: 2000,
  });

  const agents = agentsQuery.data ?? [];
  const runningCount = agents.filter((a) => a.status === "running").length;
  const waitingCount = agents.filter((a) => a.status === "completed" || a.status === "waiting").length;
  const activeAgents = agents.filter((a) => a.status === "running" || a.status === "waiting" || a.status === "completed").slice(0, 4);

  function handleClick(agentId?: string) {
    if (agentId) setSelectedAgentId(agentId);
    navigate({ to: "/agents" });
  }

  return (
    <PanelShell
      title="Agents"
      icon={<Bot className="h-4 w-4" />}
      loading={agentsQuery.isLoading}
      error={agentsQuery.error?.message}
      className="col-span-full self-start"
    >
      <div className="space-y-2">
        {/* Summary line */}
        <div className="flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-3 text-text-muted">
            {runningCount > 0 && (
              <span className="text-neon-yellow">{runningCount} running</span>
            )}
            {waitingCount > 0 && (
              <span className="text-neon-green">{waitingCount} waiting</span>
            )}
            {runningCount === 0 && waitingCount === 0 && (
              <span>No active agents</span>
            )}
          </div>
          <button
            onClick={() => handleClick()}
            className="shrink-0 text-neon-pink hover:underline"
          >
            {agents.length > 0 ? "View all →" : "Launch agent →"}
          </button>
        </div>

        {/* Active agent list */}
        {activeAgents.length > 0 && (
          <div className="space-y-1">
            {activeAgents.map((agent) => (
              <button
                key={agent.id}
                onClick={() => handleClick(agent.id)}
                className="flex w-full items-center gap-2 rounded-lg bg-[rgba(0,0,0,0.2)] px-3 py-2 text-left transition-colors hover:bg-[rgba(0,0,0,0.3)]"
              >
                <div className={cn(
                  "h-2 w-2 shrink-0 rounded-full",
                  STATUS_DOT[agent.status as keyof typeof STATUS_DOT] ?? STATUS_DOT.stopped,
                )} />
                <span className="truncate text-[11px] font-mono text-cream">
                  {agent.name}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </PanelShell>
  );
}
