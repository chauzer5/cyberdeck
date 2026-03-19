import { MessageSquare } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { trpc } from "@/trpc";
import { PanelShell } from "@/components/layout/PanelShell";
import { cn } from "@/lib/utils";

function timeAgo(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function SlackSummaryPanel() {
  const navigate = useNavigate();

  const latest = trpc.slack.threads.latest.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  const channelCount = latest.data?.length ?? 0;

  return (
    <PanelShell
      title="Slack"
      icon={<MessageSquare className="h-4 w-4" />}
      badge={channelCount > 0 ? `${channelCount} channels` : undefined}
      loading={latest.isLoading}
      error={latest.error?.message}
      className="col-span-full stagger-1"
    >
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {latest.data?.map(({ channel, thread }, i) => (
          <button
            key={channel.id}
            onClick={() => navigate({ to: "/slack", search: { channel: channel.id } })}
            className={cn(
              "animate-glass-in w-full rounded-[10px] border border-[rgba(255,45,123,0.05)] bg-[rgba(255,45,123,0.03)] px-3 py-2.5 text-left transition-all hover:border-[rgba(255,45,123,0.1)] hover:bg-[rgba(255,45,123,0.06)]",
              `stagger-${Math.min(i + 1, 5)}`
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-neon-pink">
                {channel.name}
              </div>
              {thread && (
                <span className="text-[10px] text-text-muted">
                  {timeAgo(thread.lastMessageAt)}
                </span>
              )}
            </div>
            <div className="mt-1 text-xs leading-relaxed text-text-secondary truncate">
              {thread
                ? `${thread.parentUser}: ${thread.parentText}`
                : "No activity yet. Waiting for next poll..."}
            </div>
          </button>
        ))}

        {channelCount === 0 && (
          <p className="text-xs text-text-muted">
            No channels monitored.{" "}
            <button
              onClick={() => navigate({ to: "/slack" })}
              className="text-neon-pink hover:text-neon-pink-bright"
            >
              Add one on the Slack page
            </button>{" "}
            to get started.
          </p>
        )}
      </div>
    </PanelShell>
  );
}
