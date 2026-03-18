import { z } from "zod";
import { router, publicProcedure } from "../../trpc.js";
import { db } from "../../db/index.js";
import { settings } from "../../db/schema.js";
import { eq } from "drizzle-orm";
import {
  getMergeRequests as getGitLabMRs,
  getMRDetail as getGitLabMRDetail,
  mergeMR as mergeGitLabMR,
  addMRNote as addGitLabNote,
  playJob as playGitLabJob,
  retryJob as retryGitLabJob,
  testConnection as testGitLabConnection,
} from "../gitlab/client.js";
import type { EnrichedMergeRequest, MRDetail } from "../gitlab/client.js";
import {
  getPullRequests as getGitHubPRs,
  getPRDetail as getGitHubPRDetail,
  mergePR as mergeGitHubPR,
  addComment as addGitHubComment,
  rerunCheck as rerunGitHubCheck,
  testConnection as testGitHubConnection,
} from "../github/client.js";
import type { EnrichedPullRequest, PRDetail } from "../github/client.js";

// ── Unified types ──

export interface UnifiedPR {
  provider: "github" | "gitlab";
  id: number;
  /** PR number (GitHub) or MR iid (GitLab) */
  number: number;
  /** "owner/repo" (GitHub) or project_id as string (GitLab) */
  repo: string;
  title: string;
  draft: boolean;
  author: string;
  author_username: string;
  author_avatar?: string;
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

function gitlabToUnified(mr: EnrichedMergeRequest): UnifiedPR {
  return {
    provider: "gitlab",
    id: mr.id,
    number: mr.iid,
    repo: String(mr.project_id),
    title: mr.title,
    draft: mr.draft,
    author: mr.author,
    author_username: mr.author_username,
    author_avatar: mr.author_avatar,
    source_branch: mr.source_branch,
    web_url: mr.web_url,
    updated_at: mr.updated_at,
    check_status: mr.pipeline_status,
    has_conflicts: mr.has_conflicts,
    is_mine: mr.is_mine,
    is_team_member: mr.is_team_member,
    needs_your_review: mr.needs_your_approval,
    you_are_mentioned: mr.you_are_mentioned,
  };
}

function githubToUnified(pr: EnrichedPullRequest): UnifiedPR {
  return {
    provider: "github",
    id: pr.id,
    number: pr.number,
    repo: pr.repo,
    title: pr.title,
    draft: pr.draft,
    author: pr.author,
    author_username: pr.author_username,
    author_avatar: pr.author_avatar,
    source_branch: pr.source_branch,
    web_url: pr.web_url,
    updated_at: pr.updated_at,
    check_status: pr.check_status,
    has_conflicts: pr.has_conflicts,
    is_mine: pr.is_mine,
    is_team_member: pr.is_team_member,
    needs_your_review: pr.needs_your_review,
    you_are_mentioned: pr.you_are_mentioned,
  };
}

async function isGitLabConfigured(): Promise<boolean> {
  const row = await db.select().from(settings).where(eq(settings.key, "gitlab.pat")).get();
  return !!row?.value;
}

async function isGitHubConfigured(): Promise<boolean> {
  const row = await db.select().from(settings).where(eq(settings.key, "github.token")).get();
  return !!row?.value;
}

// ── Router ──

export const sourceControlRouter = router({
  pullRequests: publicProcedure.query(async () => {
    const [gitlabOk, githubOk] = await Promise.all([
      isGitLabConfigured(),
      isGitHubConfigured(),
    ]);

    const results: UnifiedPR[] = [];

    const settled = await Promise.allSettled([
      gitlabOk
        ? getGitLabMRs().then((mrs) => mrs.map(gitlabToUnified))
        : Promise.resolve([]),
      githubOk
        ? getGitHubPRs().then((prs) => prs.map(githubToUnified))
        : Promise.resolve([]),
    ]);

    for (const r of settled) {
      if (r.status === "fulfilled") results.push(...r.value);
      else console.error("[source-control] provider error:", r.reason);
    }

    // Sort: needs_your_review first, then by updated_at desc
    results.sort((a, b) => {
      if (a.needs_your_review !== b.needs_your_review) {
        return b.needs_your_review ? 1 : -1;
      }
      return b.updated_at.localeCompare(a.updated_at);
    });

    return results;
  }),

  // GitLab detail
  gitlabMRDetail: publicProcedure
    .input(z.object({ projectId: z.number(), mrIid: z.number() }))
    .query(async ({ input }) => {
      return getGitLabMRDetail(input.projectId, input.mrIid);
    }),

  // GitHub detail
  githubPRDetail: publicProcedure
    .input(z.object({ repo: z.string(), prNumber: z.number() }))
    .query(async ({ input }) => {
      return getGitHubPRDetail(input.repo, input.prNumber);
    }),

  // GitLab actions
  gitlabMerge: publicProcedure
    .input(z.object({ projectId: z.number(), mrIid: z.number() }))
    .mutation(async ({ input }) => {
      return mergeGitLabMR(input.projectId, input.mrIid);
    }),

  gitlabAddNote: publicProcedure
    .input(z.object({ projectId: z.number(), mrIid: z.number(), body: z.string() }))
    .mutation(async ({ input }) => {
      return addGitLabNote(input.projectId, input.mrIid, input.body);
    }),

  gitlabPlayJob: publicProcedure
    .input(z.object({ projectId: z.number(), jobId: z.number() }))
    .mutation(async ({ input }) => {
      return playGitLabJob(input.projectId, input.jobId);
    }),

  gitlabRetryJob: publicProcedure
    .input(z.object({ projectId: z.number(), jobId: z.number() }))
    .mutation(async ({ input }) => {
      return retryGitLabJob(input.projectId, input.jobId);
    }),

  // GitHub actions
  githubMerge: publicProcedure
    .input(z.object({ repo: z.string(), prNumber: z.number() }))
    .mutation(async ({ input }) => {
      return mergeGitHubPR(input.repo, input.prNumber);
    }),

  githubAddComment: publicProcedure
    .input(z.object({ repo: z.string(), prNumber: z.number(), body: z.string() }))
    .mutation(async ({ input }) => {
      return addGitHubComment(input.repo, input.prNumber, input.body);
    }),

  githubRerunCheck: publicProcedure
    .input(z.object({ repo: z.string(), checkRunId: z.number() }))
    .mutation(async ({ input }) => {
      return rerunGitHubCheck(input.repo, input.checkRunId);
    }),

  // Test connections
  testGitLab: publicProcedure.mutation(async () => {
    return testGitLabConnection();
  }),

  testGitHub: publicProcedure.mutation(async () => {
    return testGitHubConnection();
  }),
});
