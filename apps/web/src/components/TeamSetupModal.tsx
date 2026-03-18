import { useState } from "react";
import { X, Check, Loader2 } from "lucide-react";
import { trpc } from "@/trpc";
import { cn } from "@/lib/utils";

export function TeamSetupModal({ onClose }: { onClose: () => void }) {
  const { data: orgMembers, isLoading } = trpc.team.orgMembers.useQuery();
  const { data: currentTeam } = trpc.team.members.useQuery();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [initialized, setInitialized] = useState(false);
  const utils = trpc.useUtils();

  const saveTeam = trpc.team.setMembers.useMutation({
    onSuccess: () => {
      utils.team.members.invalidate();
      utils.linear.issues.invalidate();
      utils.sourceControl.pullRequests.invalidate();
      onClose();
    },
  });

  // Seed selected from current team once loaded
  if (!initialized && currentTeam) {
    setSelected(new Set(currentTeam));
    setInitialized(true);
  }

  function toggle(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  const sourceLabel = (sources: string[]) =>
    sources.map((s) => s === "gitlab" ? "GL" : s === "github" ? "GH" : "LN").join(" · ");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-background shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-cream">Set Up Your Team</h2>
            <p className="mt-0.5 text-[11px] text-text-muted">
              Select your teammates — applies across Linear and Source Control
            </p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-text-muted hover:text-cream">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Member list */}
        <div className="max-h-[400px] overflow-y-auto p-3">
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-neon-pink" />
            </div>
          )}
          {orgMembers && orgMembers.length === 0 && (
            <div className="py-12 text-center text-xs text-text-muted">
              No members found. Configure at least one integration in Settings first.
            </div>
          )}
          {orgMembers && orgMembers.length > 0 && (
            <div className="space-y-1">
              {orgMembers.map((member) => (
                <button
                  key={member.email ?? member.name}
                  onClick={() => toggle(member.name)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all",
                    selected.has(member.name)
                      ? "bg-neon-pink-dark/40 border border-neon-pink/20"
                      : "border border-transparent hover:bg-card",
                  )}
                >
                  <div className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-all",
                    selected.has(member.name)
                      ? "border-neon-pink bg-neon-pink"
                      : "border-border",
                  )}>
                    {selected.has(member.name) && <Check className="h-3 w-3 text-white" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-cream">{member.name}</span>
                      <span className="text-[9px] text-text-muted">{sourceLabel(member.sources)}</span>
                    </div>
                    {member.email && (
                      <div className="truncate text-[10px] text-text-muted">{member.email}</div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-5 py-3.5">
          <span className="text-[11px] text-text-muted">
            {selected.size} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary hover:border-border-hover"
            >
              Cancel
            </button>
            <button
              onClick={() => saveTeam.mutate({ names: [...selected] })}
              disabled={saveTeam.isPending}
              className="rounded-lg bg-neon-pink-dark px-3 py-1.5 text-xs font-medium text-neon-pink-bright transition-all hover:bg-neon-pink disabled:opacity-50"
            >
              {saveTeam.isPending ? "Saving..." : "Save Team"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
