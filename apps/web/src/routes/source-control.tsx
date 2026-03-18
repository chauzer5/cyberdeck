import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "./__root";
import { useState, useMemo } from "react";
import {
  GitPullRequest,
  ArrowLeft,
  ExternalLink,
  Loader2,
  Play,
  RotateCw,
  Check,
  X,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { trpc } from "@/trpc";
import { cn } from "@/lib/utils";

// ── Helpers ──

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

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-[10px] text-text-muted">no checks</span>;
  const color =
    status === "success"
      ? "text-neon-green"
      : status === "running" || status === "pending"
        ? "text-neon-yellow"
        : status === "failed" || status === "failure"
          ? "text-red-400"
          : "text-text-muted";
  return <span className={cn("text-[10px] font-medium", color)}>{status}</span>;
}

function ProviderBadge({ provider }: { provider: "github" | "gitlab" }) {
  return (
    <span className={cn(
      "rounded-full px-1.5 py-0.5 text-[9px] font-semibold",
      provider === "github"
        ? "bg-[rgba(139,92,246,0.12)] text-neon-purple"
        : "bg-[rgba(34,211,238,0.12)] text-neon-cyan",
    )}>
      {provider === "github" ? "GH" : "GL"}
    </span>
  );
}

// ── Unified PR Card ──

interface UnifiedPR {
  provider: "github" | "gitlab";
  id: number;
  number: number;
  repo: string;
  title: string;
  draft: boolean;
  author: string;
  author_username: string;
  source_branch: string;
  web_url: string;
  updated_at: string;
  check_status: string | null;
  has_conflicts: boolean;
  is_mine: boolean;
  is_team_member: boolean;
  needs_your_review: boolean;
  you_are_mentioned: boolean;
}

function PRCard({
  pr,
  onSelect,
}: {
  pr: UnifiedPR;
  onSelect: () => void;
}) {
  const repoShort = pr.provider === "github"
    ? (pr.repo.split("/").pop() ?? pr.repo)
    : pr.repo;
  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full text-left rounded-lg border px-3.5 py-3 transition-all",
        pr.needs_your_review
          ? "border-neon-pink/30 bg-[rgba(255,45,123,0.06)] hover:border-neon-pink/50"
          : "border-border bg-[rgba(255,45,123,0.02)] hover:border-border-hover hover:bg-[rgba(255,45,123,0.04)]",
      )}
    >
      <div className="flex items-center gap-2">
        <ProviderBadge provider={pr.provider} />
        <span className="text-[10px] font-mono text-neon-pink">
          {pr.provider === "github" ? "#" : "!"}{pr.number}
        </span>
        <span className="text-[10px] font-mono text-text-muted">{repoShort}</span>
        <div className="flex items-center gap-1">
          {pr.draft && (
            <span className="rounded-full bg-[rgba(107,114,128,0.15)] px-1.5 py-0.5 text-[9px] font-semibold text-text-muted">
              draft
            </span>
          )}
          {pr.has_conflicts && (
            <span className="rounded-full bg-[rgba(239,68,68,0.15)] px-1.5 py-0.5 text-[9px] font-semibold text-red-400">
              conflicts
            </span>
          )}
          {pr.you_are_mentioned && (
            <span className="rounded-full bg-[rgba(255,45,123,0.15)] px-1.5 py-0.5 text-[9px] font-semibold text-neon-pink">
              @you
            </span>
          )}
          {pr.needs_your_review && (
            <span className="rounded-full bg-[rgba(255,45,123,0.15)] px-1.5 py-0.5 text-[9px] font-semibold text-neon-pink">
              review requested
            </span>
          )}
        </div>
      </div>
      <div className={cn("mt-1 text-xs font-medium text-cream", pr.draft && "opacity-60")}>
        {pr.title}
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-text-muted">
        <span>{pr.author}</span>
        <span>·</span>
        <span className="font-mono truncate max-w-[120px]">{pr.source_branch}</span>
        <span>·</span>
        <StatusBadge status={pr.check_status} />
        <span>·</span>
        <span>{timeAgo(pr.updated_at)}</span>
      </div>
    </button>
  );
}

// ── GitLab MR Detail View ──

function GitLabDetailView({
  projectId,
  mrIid,
  onBack,
}: {
  projectId: number;
  mrIid: number;
  onBack: () => void;
}) {
  const { data: detail, isLoading, isError, refetch } = trpc.sourceControl.gitlabMRDetail.useQuery(
    { projectId, mrIid },
  );
  const [commentText, setCommentText] = useState("");
  const addNote = trpc.sourceControl.gitlabAddNote.useMutation({ onSuccess: () => { setCommentText(""); refetch(); } });
  const merge = trpc.sourceControl.gitlabMerge.useMutation({ onSuccess: () => refetch() });
  const play = trpc.sourceControl.gitlabPlayJob.useMutation({ onSuccess: () => refetch() });
  const retry = trpc.sourceControl.gitlabRetryJob.useMutation({ onSuccess: () => refetch() });
  const [expandedDiscussions, setExpandedDiscussions] = useState<Set<string>>(new Set());

  const toggleDiscussion = (id: string) => {
    setExpandedDiscussions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <button onClick={onBack} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-text-muted hover:text-cream">
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
        <ProviderBadge provider="gitlab" />
        <span className="font-mono text-xs text-neon-pink">!{mrIid}</span>
        {detail && (
          <a href={detail.web_url} target="_blank" rel="noopener noreferrer" className="ml-auto rounded p-1 text-text-muted hover:text-neon-pink" title="Open in GitLab">
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>

      {isLoading && <div className="flex flex-1 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-neon-pink" /></div>}
      {isError && <div className="p-4 text-xs text-red-400">Failed to load MR detail</div>}
      {detail && (
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          <div>
            <h2 className="text-sm font-semibold text-cream">{detail.title}</h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px]">
              <span className={cn("rounded-full px-2 py-0.5 font-semibold", detail.state === "opened" ? "bg-[rgba(34,197,94,0.15)] text-neon-green" : "bg-[rgba(107,114,128,0.15)] text-text-muted")}>{detail.state}</span>
              {detail.draft && <span className="rounded-full bg-[rgba(107,114,128,0.15)] px-2 py-0.5 font-semibold text-text-muted">draft</span>}
              <span className="text-text-muted">{detail.author}</span>
              <span className="font-mono text-text-muted">{detail.source_branch} → {detail.target_branch}</span>
              {detail.changes_count !== "0" && <span className="text-text-muted">{detail.changes_count} changes</span>}
            </div>
          </div>

          {detail.jobs.length > 0 && (
            <section>
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-text-muted">Pipeline</h3>
              <div className="flex flex-wrap gap-1.5">
                {detail.jobs.map((job) => (
                  <div key={job.id} className={cn("group flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px]",
                    job.status === "success" ? "border-neon-green/20 text-neon-green"
                    : job.status === "failed" ? (job.allow_failure ? "border-neon-yellow/20 text-neon-yellow" : "border-red-400/20 text-red-400")
                    : job.status === "running" ? "border-neon-cyan/20 text-neon-cyan"
                    : job.status === "manual" ? "border-neon-purple/20 text-neon-purple"
                    : "border-border text-text-muted",
                  )}>
                    <span className="font-mono">{job.name}</span>
                    {job.status === "manual" && (
                      <button onClick={() => play.mutate({ projectId, jobId: job.id })} disabled={play.isPending} className="rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 hover:text-neon-pink" title="Play">
                        <Play className="h-2.5 w-2.5" />
                      </button>
                    )}
                    {job.status === "failed" && (
                      <button onClick={() => retry.mutate({ projectId, jobId: job.id })} disabled={retry.isPending} className="rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 hover:text-neon-pink" title="Retry">
                        <RotateCw className="h-2.5 w-2.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {detail.approval_rules.length > 0 && (
            <section>
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-text-muted">Approvals</h3>
              <div className="flex flex-wrap gap-1.5">
                {detail.approval_rules.filter((r) => r.rule_type !== "any_approver" && r.rule_type !== "report_approver").map((rule) => (
                  <span key={rule.name} className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", rule.approved ? "bg-[rgba(34,197,94,0.12)] text-neon-green" : "bg-[rgba(255,45,123,0.12)] text-neon-pink")}>
                    {rule.approved ? <Check className="mr-1 inline h-2.5 w-2.5" /> : null}
                    {rule.name}
                    {rule.approved_by.length > 0 && <span className="ml-1 opacity-70">({rule.approved_by.join(", ")})</span>}
                  </span>
                ))}
              </div>
            </section>
          )}

          {detail.description && (
            <section>
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-text-muted">Description</h3>
              <div className="rounded-lg border border-border bg-[rgba(0,0,0,0.2)] p-3 text-xs leading-relaxed text-text-secondary whitespace-pre-wrap">{detail.description}</div>
            </section>
          )}

          {detail.discussions.length > 0 && (
            <section>
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-text-muted">Discussions ({detail.discussions.length})</h3>
              <div className="space-y-2">
                {detail.discussions.map((disc) => (
                  <div key={disc.id} className={cn("rounded-lg border px-3 py-2", disc.resolved ? "border-border/50 opacity-60" : "border-border")}>
                    <button onClick={() => toggleDiscussion(disc.id)} className="flex w-full items-center gap-1.5 text-left">
                      {expandedDiscussions.has(disc.id) ? <ChevronDown className="h-3 w-3 text-text-muted" /> : <ChevronRight className="h-3 w-3 text-text-muted" />}
                      <span className="text-xs font-medium text-cream">{disc.notes[0]?.author}</span>
                      {disc.resolved && <Check className="h-3 w-3 text-neon-green" />}
                      <span className="ml-auto text-[10px] text-text-muted">{disc.notes.length} {disc.notes.length === 1 ? "note" : "notes"}</span>
                    </button>
                    {expandedDiscussions.has(disc.id) && (
                      <div className="mt-2 space-y-2 border-t border-border/50 pt-2">
                        {disc.notes.map((note) => (
                          <div key={note.id}>
                            <div className="flex items-center gap-1.5 text-[10px]">
                              <span className="font-medium text-cream">{note.author}</span>
                              <span className="text-text-muted">{timeAgo(note.created_at)}</span>
                            </div>
                            <p className="mt-0.5 text-xs leading-relaxed text-text-secondary whitespace-pre-wrap">{note.body}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-text-muted">Add Comment</h3>
            <textarea value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="Write a comment..." rows={3}
              className="w-full rounded-lg border border-border bg-[rgba(0,0,0,0.2)] px-3 py-2 text-xs text-cream placeholder:text-text-muted focus:border-neon-pink/30 focus:outline-none resize-y" />
            <div className="mt-2 flex items-center gap-2">
              <button onClick={() => addNote.mutate({ projectId, mrIid, body: commentText })} disabled={addNote.isPending || !commentText.trim()}
                className="rounded-lg bg-neon-pink-dark px-3 py-1.5 text-xs font-medium text-neon-pink-bright transition-all hover:bg-neon-pink disabled:opacity-50">
                {addNote.isPending ? "Posting..." : "Comment"}
              </button>
              {detail.can_merge && (
                <button onClick={() => merge.mutate({ projectId, mrIid })} disabled={merge.isPending}
                  className="rounded-lg bg-[rgba(34,197,94,0.15)] px-3 py-1.5 text-xs font-medium text-neon-green transition-all hover:bg-[rgba(34,197,94,0.25)] disabled:opacity-50">
                  {merge.isPending ? "Merging..." : "Merge"}
                </button>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

// ── GitHub PR Detail View ──

function GitHubDetailView({
  repo,
  prNumber,
  onBack,
}: {
  repo: string;
  prNumber: number;
  onBack: () => void;
}) {
  const { data: detail, isLoading, isError, refetch } = trpc.sourceControl.githubPRDetail.useQuery(
    { repo, prNumber },
  );
  const [commentText, setCommentText] = useState("");
  const addComment = trpc.sourceControl.githubAddComment.useMutation({ onSuccess: () => { setCommentText(""); refetch(); } });
  const merge = trpc.sourceControl.githubMerge.useMutation({ onSuccess: () => refetch() });
  const rerun = trpc.sourceControl.githubRerunCheck.useMutation({ onSuccess: () => refetch() });
  const [expandedComments, setExpandedComments] = useState(true);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <button onClick={onBack} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-text-muted hover:text-cream">
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
        <ProviderBadge provider="github" />
        <span className="font-mono text-xs text-neon-pink">#{prNumber}</span>
        {detail && (
          <a href={detail.web_url} target="_blank" rel="noopener noreferrer" className="ml-auto rounded p-1 text-text-muted hover:text-neon-pink" title="Open in GitHub">
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>

      {isLoading && <div className="flex flex-1 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-neon-pink" /></div>}
      {isError && <div className="p-4 text-xs text-red-400">Failed to load PR detail</div>}
      {detail && (
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          <div>
            <h2 className="text-sm font-semibold text-cream">{detail.title}</h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px]">
              <span className={cn("rounded-full px-2 py-0.5 font-semibold", detail.state === "open" ? "bg-[rgba(34,197,94,0.15)] text-neon-green" : "bg-[rgba(107,114,128,0.15)] text-text-muted")}>{detail.state}</span>
              {detail.draft && <span className="rounded-full bg-[rgba(107,114,128,0.15)] px-2 py-0.5 font-semibold text-text-muted">draft</span>}
              <span className="text-text-muted">{detail.author}</span>
              <span className="font-mono text-text-muted">{detail.source_branch} → {detail.target_branch}</span>
              {detail.changed_files > 0 && <span className="text-text-muted">{detail.changed_files} files changed</span>}
            </div>
          </div>

          {detail.checks.length > 0 && (
            <section>
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-text-muted">Checks</h3>
              <div className="flex flex-wrap gap-1.5">
                {detail.checks.map((check) => (
                  <div key={check.id} className={cn("group flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px]",
                    check.conclusion === "success" ? "border-neon-green/20 text-neon-green"
                    : check.conclusion === "failure" ? "border-red-400/20 text-red-400"
                    : check.status === "in_progress" ? "border-neon-cyan/20 text-neon-cyan"
                    : check.conclusion === "skipped" ? "border-border text-text-muted"
                    : "border-neon-yellow/20 text-neon-yellow",
                  )}>
                    <span className="font-mono">{check.name}</span>
                    {check.conclusion === "failure" && (
                      <button onClick={() => rerun.mutate({ repo, checkRunId: check.id })} disabled={rerun.isPending}
                        className="rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 hover:text-neon-pink" title="Re-run">
                        <RotateCw className="h-2.5 w-2.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {detail.reviews.length > 0 && (
            <section>
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-text-muted">Reviews</h3>
              <div className="flex flex-wrap gap-1.5">
                {detail.reviews.map((review) => (
                  <span key={review.user} className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold",
                    review.state === "APPROVED" ? "bg-[rgba(34,197,94,0.12)] text-neon-green"
                    : review.state === "CHANGES_REQUESTED" ? "bg-[rgba(239,68,68,0.12)] text-red-400"
                    : "bg-[rgba(107,114,128,0.12)] text-text-muted",
                  )}>
                    {review.state === "APPROVED" && <Check className="mr-1 inline h-2.5 w-2.5" />}
                    {review.state === "CHANGES_REQUESTED" && <X className="mr-1 inline h-2.5 w-2.5" />}
                    {review.user}
                    <span className="ml-1 opacity-70">({review.state.toLowerCase().replace("_", " ")})</span>
                  </span>
                ))}
              </div>
            </section>
          )}

          {detail.description && (
            <section>
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-text-muted">Description</h3>
              <div className="rounded-lg border border-border bg-[rgba(0,0,0,0.2)] p-3 text-xs leading-relaxed text-text-secondary whitespace-pre-wrap">{detail.description}</div>
            </section>
          )}

          {detail.comments.length > 0 && (
            <section>
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-text-muted">
                <button onClick={() => setExpandedComments((v) => !v)} className="flex items-center gap-1">
                  {expandedComments ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  Comments ({detail.comments.length})
                </button>
              </h3>
              {expandedComments && (
                <div className="space-y-2">
                  {detail.comments.map((comment) => (
                    <div key={comment.id} className="rounded-lg border border-border px-3 py-2">
                      <div className="flex items-center gap-1.5 text-[10px]">
                        <span className="font-medium text-cream">{comment.author}</span>
                        <span className="text-text-muted">{timeAgo(comment.created_at)}</span>
                      </div>
                      <p className="mt-0.5 text-xs leading-relaxed text-text-secondary whitespace-pre-wrap">{comment.body}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          <section>
            <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-text-muted">Add Comment</h3>
            <textarea value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="Write a comment..." rows={3}
              className="w-full rounded-lg border border-border bg-[rgba(0,0,0,0.2)] px-3 py-2 text-xs text-cream placeholder:text-text-muted focus:border-neon-pink/30 focus:outline-none resize-y" />
            <div className="mt-2 flex items-center gap-2">
              <button onClick={() => addComment.mutate({ repo, prNumber, body: commentText })} disabled={addComment.isPending || !commentText.trim()}
                className="rounded-lg bg-neon-pink-dark px-3 py-1.5 text-xs font-medium text-neon-pink-bright transition-all hover:bg-neon-pink disabled:opacity-50">
                {addComment.isPending ? "Posting..." : "Comment"}
              </button>
              {detail.can_merge && (
                <button onClick={() => merge.mutate({ repo, prNumber })} disabled={merge.isPending}
                  className="rounded-lg bg-[rgba(34,197,94,0.15)] px-3 py-1.5 text-xs font-medium text-neon-green transition-all hover:bg-[rgba(34,197,94,0.25)] disabled:opacity-50">
                  {merge.isPending ? "Merging..." : "Merge"}
                </button>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

// ── Main Page ──

type Tab = "mine" | "team" | "review" | "mentions";
type SelectedPR = { provider: "github"; repo: string; number: number } | { provider: "gitlab"; projectId: number; iid: number };

function SourceControlPage() {
  const [tab, setTab] = useState<Tab>("mine");
  const [selectedPR, setSelectedPR] = useState<SelectedPR | null>(null);
  const { data: allPRs, isLoading, isError, refetch } = trpc.sourceControl.pullRequests.useQuery(
    undefined,
    { refetchInterval: 60_000 },
  );

  const { myPRs, teamPRs, reviewPRs, mentionPRs } = useMemo(() => {
    if (!allPRs) return { myPRs: [], teamPRs: [], reviewPRs: [], mentionPRs: [] };
    return {
      myPRs: allPRs.filter((pr) => pr.is_mine),
      teamPRs: allPRs.filter((pr) => pr.is_team_member),
      reviewPRs: allPRs.filter((pr) => pr.needs_your_review),
      mentionPRs: allPRs.filter((pr) => pr.you_are_mentioned),
    };
  }, [allPRs]);

  const currentPRs =
    tab === "mine"
      ? myPRs
      : tab === "team"
        ? teamPRs
        : tab === "review"
          ? reviewPRs
          : mentionPRs;

  if (selectedPR) {
    if (selectedPR.provider === "gitlab") {
      return (
        <div className="flex h-full flex-col">
          <GitLabDetailView
            projectId={selectedPR.projectId}
            mrIid={selectedPR.iid}
            onBack={() => setSelectedPR(null)}
          />
        </div>
      );
    }
    return (
      <div className="flex h-full flex-col">
        <GitHubDetailView
          repo={selectedPR.repo}
          prNumber={selectedPR.number}
          onBack={() => setSelectedPR(null)}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <h1 className="font-display text-lg font-bold tracking-[2px] uppercase text-cream">
            Source Control
          </h1>
          <p className="mt-0.5 text-xs text-text-muted">Pull/Merge requests</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {([
          { key: "mine" as Tab, label: "Mine", count: myPRs.length },
          { key: "team" as Tab, label: "Team", count: teamPRs.length },
          { key: "review" as Tab, label: "Needs Review", count: reviewPRs.length },
          { key: "mentions" as Tab, label: "Mentions", count: mentionPRs.length },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-xs font-medium transition-all",
              tab === t.key
                ? "border-neon-pink text-neon-pink"
                : "border-transparent text-text-muted hover:text-cream",
            )}
          >
            {t.label}
            <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
              tab === t.key ? "bg-[rgba(255,45,123,0.12)] text-neon-pink" : "bg-[rgba(107,114,128,0.1)] text-text-muted",
            )}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading && (
          <div className="flex items-center justify-center pt-16">
            <Loader2 className="h-6 w-6 animate-spin text-neon-pink" />
          </div>
        )}
        {isError && (
          <div className="flex flex-col items-center justify-center pt-16 text-center">
            <X className="h-8 w-8 text-red-400 opacity-50" />
            <p className="mt-2 text-xs text-text-muted">
              Could not load PRs. Check your tokens in Settings.
            </p>
            <button onClick={() => refetch()} className="mt-2 text-xs text-neon-pink hover:underline">
              Retry
            </button>
          </div>
        )}
        {!isLoading && !isError && currentPRs.length === 0 && (
          <div className="flex items-center justify-center pt-16">
            <div className="text-center">
              <GitPullRequest className="mx-auto h-10 w-10 text-text-muted opacity-30" />
              <p className="mt-3 text-sm text-text-muted">No pull requests</p>
            </div>
          </div>
        )}
        <div className="space-y-2">
          {currentPRs.map((pr, i) => (
            <div key={`${pr.provider}-${pr.id}`} className={cn("animate-glass-in", `stagger-${Math.min(i + 1, 5)}`)}>
              <PRCard
                pr={pr}
                onSelect={() => {
                  if (pr.provider === "gitlab") {
                    setSelectedPR({ provider: "gitlab", projectId: Number(pr.repo), iid: pr.number });
                  } else {
                    setSelectedPR({ provider: "github", repo: pr.repo, number: pr.number });
                  }
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export const sourceControlRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/source-control",
  component: SourceControlPage,
});
