import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  CheckSquare,
  MessageSquare,
  Bot,
  GitMerge,
  LayoutList,
  Settings,
  GitPullRequest,
  ListTodo,
  Code2,
} from "lucide-react";

// ── Types ──

export type SearchCategory =
  | "pages"
  | "merge-requests"
  | "issues"
  | "slack"
  | "agents"
  | "todos";

export interface SearchResult {
  id: string;
  category: SearchCategory;
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  action:
    | { type: "navigate"; to: string; agentId?: string }
    | { type: "open"; url: string };
}

// ── Static pages ──

const PAGES: SearchResult[] = [
  { id: "page-dashboard", category: "pages", title: "Dashboard", icon: LayoutDashboard, action: { type: "navigate", to: "/" } },
  { id: "page-todos", category: "pages", title: "Todos", icon: CheckSquare, action: { type: "navigate", to: "/todos" } },
  { id: "page-source-control", category: "pages", title: "Source Control", icon: GitMerge, action: { type: "navigate", to: "/source-control" } },
  { id: "page-linear", category: "pages", title: "Linear", icon: LayoutList, action: { type: "navigate", to: "/linear" } },
  { id: "page-slack", category: "pages", title: "Slack", icon: MessageSquare, action: { type: "navigate", to: "/slack" } },
  { id: "page-agents", category: "pages", title: "Agents", icon: Bot, action: { type: "navigate", to: "/agents" } },
  { id: "page-code", category: "pages", title: "Code", icon: Code2, action: { type: "navigate", to: "/code" } },
  { id: "page-settings", category: "pages", title: "Settings", icon: Settings, action: { type: "navigate", to: "/settings" } },
];

// ── Source data interfaces (match tRPC return types) ──

export interface SearchSources {
  pullRequests?: Array<{
    id: number;
    number: number;
    provider: "github" | "gitlab";
    repo: string;
    title: string;
    author: string;
    source_branch: string;
    web_url: string;
    updated_at: string;
  }>;
  issues?: Array<{
    id: string;
    identifier: string;
    title: string;
    status: string;
    assignee: string | null;
    url: string;
    updated_at: string;
  }>;
  slackThreads?: Array<{
    channel: { id: string; name: string };
    thread: {
      id: string;
      channelName: string;
      parentText: string;
      parentUser: string;
      lastMessageAt: string;
    } | null;
  }>;
  agents?: Array<{
    id: string;
    name: string;
    status: string;
    prompt: string | null;
    createdAt: string;
  }>;
  todos?: Array<{
    id: string;
    title: string;
    priority: string | null;
    status: string;
  }>;
}

// ── Search logic ──

const MAX_PER_CATEGORY = 6;

function matchesTokens(tokens: string[], ...fields: (string | null | undefined)[]): boolean {
  const text = fields.filter(Boolean).join(" ").toLowerCase();
  return tokens.every((t) => text.includes(t));
}

export function search(query: string, sources: SearchSources): SearchResult[] {
  const trimmed = query.trim().toLowerCase();
  const tokens = trimmed.split(/\s+/).filter(Boolean);

  const results: SearchResult[] = [];

  // Pages — always searched
  if (tokens.length === 0) {
    results.push(...PAGES);
  } else {
    for (const page of PAGES) {
      if (matchesTokens(tokens, page.title)) {
        results.push(page);
      }
    }
  }

  // Merge Requests
  if (sources.pullRequests) {
    let count = 0;
    for (const pr of sources.pullRequests) {
      if (count >= MAX_PER_CATEGORY) break;
      if (tokens.length === 0 || matchesTokens(tokens, pr.title, pr.author, pr.source_branch, `!${pr.number}`)) {
        const prParam = pr.provider === "gitlab"
          ? `gitlab:${pr.repo}:${pr.number}`
          : `github:${pr.repo}:${pr.number}`;
        results.push({
          id: `pr-${pr.id}`,
          category: "merge-requests",
          title: pr.title,
          subtitle: `!${pr.number} · ${pr.author}`,
          icon: GitPullRequest,
          action: { type: "navigate", to: `/source-control?pr=${encodeURIComponent(prParam)}` },
        });
        count++;
      }
    }
  }

  // Linear Issues
  if (sources.issues) {
    let count = 0;
    for (const issue of sources.issues) {
      if (count >= MAX_PER_CATEGORY) break;
      if (tokens.length === 0 || matchesTokens(tokens, issue.title, issue.identifier, issue.assignee, issue.status)) {
        results.push({
          id: `issue-${issue.id}`,
          category: "issues",
          title: issue.title,
          subtitle: `${issue.identifier} · ${issue.status}`,
          icon: LayoutList,
          action: { type: "navigate", to: `/linear?issue=${encodeURIComponent(issue.identifier)}` },
        });
        count++;
      }
    }
  }

  // Slack Threads
  if (sources.slackThreads) {
    let count = 0;
    for (const { channel, thread } of sources.slackThreads) {
      if (!thread) continue;
      if (count >= MAX_PER_CATEGORY) break;
      if (tokens.length === 0 || matchesTokens(tokens, thread.parentText, thread.channelName, thread.parentUser)) {
        results.push({
          id: `slack-${thread.id}`,
          category: "slack",
          title: thread.parentText.slice(0, 100) || `#${thread.channelName}`,
          subtitle: `#${thread.channelName} · ${thread.parentUser}`,
          icon: MessageSquare,
          action: { type: "navigate", to: "/slack" },
        });
        count++;
      }
    }
  }

  // Agents
  if (sources.agents) {
    let count = 0;
    for (const agent of sources.agents) {
      if (count >= MAX_PER_CATEGORY) break;
      if (tokens.length === 0 || matchesTokens(tokens, agent.name, agent.prompt, agent.status)) {
        results.push({
          id: `agent-${agent.id}`,
          category: "agents",
          title: agent.name,
          subtitle: agent.status,
          icon: Bot,
          action: { type: "navigate", to: "/agents", agentId: agent.id },
        });
        count++;
      }
    }
  }

  // Todos
  if (sources.todos) {
    let count = 0;
    for (const todo of sources.todos) {
      if (count >= MAX_PER_CATEGORY) break;
      if (tokens.length === 0 || matchesTokens(tokens, todo.title, todo.priority)) {
        results.push({
          id: `todo-${todo.id}`,
          category: "todos",
          title: todo.title,
          subtitle: todo.priority ? `${todo.priority} priority` : undefined,
          icon: ListTodo,
          action: { type: "navigate", to: "/todos" },
        });
        count++;
      }
    }
  }

  return results;
}

// Category display names
export const CATEGORY_LABELS: Record<SearchCategory, string> = {
  pages: "Pages",
  "merge-requests": "Merge Requests",
  issues: "Linear Issues",
  slack: "Slack",
  agents: "Agents",
  todos: "Todos",
};
