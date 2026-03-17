import { MessageSquare } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { trpc } from "@/trpc";
import { PanelShell } from "@/components/layout/PanelShell";
import { cn } from "@/lib/utils";

export function SlackSummaryPanel() {
  const navigate = useNavigate();

  const latest = trpc.slack.conversations.latest.useQuery(undefined, {
    refetchInterval: 60_000,
  });

  const channelCount = latest.data?.length ?? 0;

  return (
    <PanelShell
      title="Slack Summary"
      icon={<MessageSquare className="h-4 w-4" />}
      badge={channelCount > 0 ? `${channelCount} channels` : undefined}
      loading={latest.isLoading}
      error={latest.error?.message}
      className="col-span-full stagger-1"
    >
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {latest.data?.map(({ channel, dayHeadline }, i) => (
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
              {dayHeadline && (
                <span className="text-[10px] text-text-muted">
                  {dayHeadline.conversationCount} convos
                </span>
              )}
            </div>
            <div className="mt-1 text-xs leading-relaxed text-text-secondary">
              {dayHeadline
                ? dayHeadline.headline
                : "No summaries yet. Waiting for next poll..."}
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
