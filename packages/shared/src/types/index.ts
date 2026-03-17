export interface Panel {
  id: string;
  type: string;
  title: string;
  position: { row: number; col: number };
  size: { rowSpan: number; colSpan: number };
}

export type TodoStatus = "active" | "completed" | "dismissed";

export interface Todo {
  id: string;
  source: string;
  title: string;
  description?: string;
  completed: boolean;
  status: TodoStatus;
  priority?: "low" | "medium" | "high";
  dueDate?: string;
  url?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Agent {
  id: string;
  name: string;
  command: string;
  status: "idle" | "running" | "error" | "stopped";
  mode: "pty" | "structured";
  pid?: number;
  startedAt?: string;
  createdAt: string;
  prompt: string;
  team?: string;
  exitCode?: number | null;
  sessionFile?: string;
}

export interface PiSession {
  /** Session UUID from the JSONL header */
  id: string;
  /** Absolute path to the .jsonl file */
  path: string;
  /** Working directory where the session was started */
  cwd: string;
  /** User-defined display name (from session_info entries) */
  name?: string;
  /** ISO timestamp of session creation */
  created: string;
  /** ISO timestamp of last modification */
  modified: string;
  /** Number of message entries */
  messageCount: number;
  /** Truncated text of the first user message */
  firstMessage: string;
  /** Provider/model string */
  model?: string;
  /** Thinking level */
  thinkingLevel?: string;
  /** Total cost from usage data */
  totalCost?: number;
}

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

export interface TeamMember {
  name: string;
  description: string;
  tools: string;
  model?: string;
  thinking?: ThinkingLevel;
  /** Model from agent .md frontmatter (the default before any override) */
  baseModel?: string;
  /** Per-team model override from teams.yaml */
  modelOverride?: string;
  /** Per-team thinking override from teams.yaml */
  thinkingOverride?: ThinkingLevel;
}

export interface Team {
  name: string;
  members: TeamMember[];
}

// --- Workflows ---

export interface WorkflowStep {
  name: string;
  agent: string;
  prompt: string;
  model?: string;
  thinking?: ThinkingLevel;
}

export interface Workflow {
  name: string;
  description?: string;
  max_loops?: number;
  steps: WorkflowStep[];
}

export interface Integration {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  config: Record<string, unknown>;
  lastSyncAt?: string;
}

export interface SlackChannel {
  id: string;
  slackChannelId: string;
  name: string;
  topics: string;
  enabled: boolean;
  lastPolledAt?: string;
  createdAt: string;
}

export interface SlackSummary {
  id: string;
  channelId: string;
  channelName: string;
  summary: string;
  messageCount: number;
  periodStart: string;
  periodEnd: string;
  createdAt: string;
}
