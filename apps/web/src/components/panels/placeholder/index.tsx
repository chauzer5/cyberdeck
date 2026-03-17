import { useCallback } from "react";
import { trpc } from "@/trpc";
import { useWebSocket } from "@/hooks/useWebSocket";
import { cn } from "@/lib/utils";

const STAT_CONFIGS = [
  {
    key: "todos",
    label: "Todos",
    color: "pink" as const,
  },
  {
    key: "unread",
    label: "Unread DMs",
    color: "cyan" as const,
  },
  {
    key: "agents",
    label: "Agents",
    color: "yellow" as const,
  },
  {
    key: "server",
    label: "Server",
    color: "green" as const,
  },
] as const;

const COLOR_MAP = {
  pink: {
    value: "text-neon-pink",
    glow: "0 0 30px rgba(255, 45, 123, 0.4)",
    barBg: "bg-neon-pink shadow-[0_0_8px_rgba(255,45,123,0.6)]",
    edge: "from-neon-pink",
  },
  cyan: {
    value: "text-neon-cyan",
    glow: "0 0 30px rgba(0, 240, 255, 0.4)",
    barBg: "bg-neon-cyan shadow-[0_0_8px_rgba(0,240,255,0.6)]",
    edge: "from-neon-cyan",
  },
  yellow: {
    value: "text-neon-yellow",
    glow: "0 0 30px rgba(250, 204, 21, 0.4)",
    barBg: "bg-neon-yellow shadow-[0_0_8px_rgba(250,204,21,0.6)]",
    edge: "from-neon-yellow",
  },
  green: {
    value: "text-neon-green",
    glow: "0 0 30px rgba(0, 255, 136, 0.4)",
    barBg: "bg-neon-green shadow-[0_0_8px_rgba(0,255,136,0.6)]",
    edge: "from-neon-green",
  },
} as const;

export function QuickStatsPanel() {
  const ping = trpc.health.ping.useQuery(undefined, {
    refetchInterval: 30_000,
  });
  const todosQuery = trpc.todos.list.useQuery(undefined, {
    refetchInterval: 15_000,
  });
  const unreadQuery = trpc.slack.unreadDms.useQuery(undefined, {
    refetchInterval: 120_000,
  });
  const agentsQuery = trpc.agents.list.useQuery(undefined, {
    refetchInterval: 5_000,
  });

  const utils = trpc.useUtils();
  useWebSocket(
    useCallback(
      (event: { type: string }) => {
        if (event.type === "slack:unread") {
          utils.slack.unreadDms.invalidate();
        }
      },
      [utils],
    ),
  );

  const todoCount = todosQuery.data?.length ?? 0;
  const unreadCount = unreadQuery.data?.checkedAt
    ? unreadQuery.data.unreadCount
    : null;
  const runningAgents = agentsQuery.data?.filter((a) => a.status === "running").length ?? 0;
  const totalAgents = agentsQuery.data?.length ?? 0;
  const serverUp = !!ping.data;

  const stats: { value: string; delta?: string; deltaUp?: boolean; barPercent: number }[] = [
    {
      value: String(todoCount),
      delta: todoCount > 0 ? `${todoCount} active` : undefined,
      deltaUp: todoCount > 0,
      barPercent: Math.min(todoCount * 10, 100),
    },
    {
      value: unreadCount != null ? String(unreadCount) : "--",
      delta: unreadCount != null && unreadCount > 0 ? `${unreadCount} new` : undefined,
      deltaUp: unreadCount != null && unreadCount > 0,
      barPercent: unreadCount != null ? Math.min(unreadCount * 15, 100) : 0,
    },
    {
      value: String(runningAgents),
      delta: totalAgents > 0 ? `${totalAgents} total` : undefined,
      deltaUp: runningAgents > 0,
      barPercent: totalAgents > 0 ? Math.round((runningAgents / totalAgents) * 100) : 0,
    },
    {
      value: serverUp ? "ON" : "OFF",
      delta: serverUp ? "connected" : "offline",
      deltaUp: serverUp,
      barPercent: serverUp ? 100 : 0,
    },
  ];

  return (
    <>
      {STAT_CONFIGS.map((cfg, i) => {
        const s = stats[i];
        const colors = COLOR_MAP[cfg.color];

        return (
          <div
            key={cfg.key}
            className={cn(
              "animate-glass-in relative self-start overflow-hidden rounded-xl border border-[rgba(255,45,123,0.08)] bg-[rgba(30,22,55,0.7)] p-4 backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(0,0,0,0.4)]",
              `stagger-${i + 1}`
            )}
          >
            {/* Colored top edge */}
            <div
              className={cn(
                "absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r to-transparent",
                colors.edge
              )}
            />

            {/* Label */}
            <div className="mb-2 font-display text-[9px] font-semibold tracking-[3px] uppercase text-text-muted">
              {cfg.label}
            </div>

            {/* Value + delta row */}
            <div className="flex items-baseline gap-2">
              <div
                className={cn("font-heading text-[42px] leading-none", colors.value)}
                style={{ textShadow: colors.glow }}
              >
                {s.value}
              </div>
              {s.delta && (
                <span
                  className={cn(
                    "text-[10px] font-semibold",
                    s.deltaUp ? "text-neon-green" : "text-text-muted"
                  )}
                >
                  {s.delta}
                </span>
              )}
            </div>

            {/* Progress bar */}
            <div className="mt-3 h-[3px] overflow-hidden rounded-full bg-[rgba(255,255,255,0.07)]">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-1000",
                  colors.barBg
                )}
                style={{ width: `${s.barPercent}%` }}
              />
            </div>
          </div>
        );
      })}
    </>
  );
}
