import { z } from "zod";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { router, publicProcedure } from "../trpc.js";
import * as os from "node:os";
import * as path from "node:path";

import {
  createAgent,
  createPtyAgent,
  listAgents,
  getAgent,
  getAgentOutput,
  stopAgent,
  removeAgent,
  renameAgent,
} from "./manager.js";
import { listTeams } from "./teams.js";
import { teamsRouter } from "./teams-router.js";
import { workflowsRouter } from "./workflows-router.js";
import { listSessions } from "./sessions.js";
import { extensionArgs } from "./extensions.js";

const execFileAsync = promisify(execFile);

type ModelEntry = { id: string; name: string };
type ProviderGroup = { provider: string; models: ModelEntry[] };

let modelsCache: { data: ProviderGroup[]; ts: number } | null = null;
const MODELS_CACHE_TTL = 60_000; // 60 seconds

function prettifyModelId(id: string): string {
  return id
    .replace(/-\d{8}$/, "") // strip date suffix like -20250514
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/(\d) (\d)/g, "$1.$2");
}

function filterLatestModels(models: ModelEntry[]): ModelEntry[] {
  // Pass 1: Remove dated pins (-YYYYMMDD) and -latest aliases
  const filtered = models.filter(
    (m) => !/-\d{8}$/.test(m.id) && !m.id.endsWith("-latest")
  );

  // Pass 2: Keep only the highest version per model family
  const families = new Map<string, { entry: ModelEntry; version: number }>();

  for (const entry of filtered) {
    let family: string;
    let version: number;

    const twoPartMatch = entry.id.match(/^(claude-[a-z]+)-(\d+)-(\d+)$/);
    const onePartMatch = entry.id.match(/^(claude-[a-z]+)-(\d+)$/);

    if (twoPartMatch) {
      family = twoPartMatch[1];
      version = Number(twoPartMatch[2]) * 1000 + Number(twoPartMatch[3]);
    } else if (onePartMatch) {
      family = onePartMatch[1];
      version = Number(onePartMatch[2]) * 1000;
    } else {
      // No version pattern — keep as-is with a unique family key
      family = entry.id;
      version = 0;
    }

    const existing = families.get(family);
    if (!existing || version > existing.version) {
      families.set(family, { entry, version });
    }
  }

  return Array.from(families.values()).map((v) => v.entry);
}

async function fetchModels(): Promise<ProviderGroup[]> {
  const now = Date.now();
  if (modelsCache && now - modelsCache.ts < MODELS_CACHE_TTL) {
    return modelsCache.data;
  }

  try {
    const { stdout } = await execFileAsync("pi", ["--list-models"], {
      encoding: "utf-8",
      timeout: 10_000,
    });

    const lines = stdout.split("\n").filter((l) => l.trim());
    // Skip header line
    const dataLines = lines.slice(1);

    const grouped = new Map<string, ModelEntry[]>();
    for (const line of dataLines) {
      const cols = line.trim().split(/\s+/);
      if (cols.length < 2) continue;
      const provider = cols[0];
      const model = cols[1];
      if (!grouped.has(provider)) grouped.set(provider, []);
      grouped.get(provider)!.push({ id: model, name: prettifyModelId(model) });
    }

    const result: ProviderGroup[] = [];
    for (const [provider, models] of grouped) {
      result.push({ provider, models: filterLatestModels(models) });
    }

    modelsCache = { data: result, ts: now };
    return result;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[fetchModels] pi --list-models failed:", message);
    if (modelsCache) modelsCache.ts = now;
    return modelsCache?.data ?? [];
  }
}

export const agentsRouter = router({
  teams: teamsRouter,
  workflows: workflowsRouter,

  list: publicProcedure.query(() => {
    return listAgents();
  }),

  listTeams: publicProcedure.query(() => {
    return listTeams();
  }),

  listModels: publicProcedure.query(async () => {
    return fetchModels();
  }),

  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(({ input }) => {
      const agent = getAgent(input.id);
      if (!agent) throw new Error("Agent not found");
      return agent;
    }),

  getOutput: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(({ input }) => {
      return getAgentOutput(input.id);
    }),

  create: publicProcedure
    .input(
      z.object({
        prompt: z.string().min(1),
        name: z.string().optional(),
        team: z.string().optional(),
      })
    )
    .mutation(({ input }) => {
      return createAgent(input.prompt, input.name, input.team);
    }),

  stop: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => {
      const ok = stopAgent(input.id);
      if (!ok) throw new Error("Cannot stop agent");
      return { success: true };
    }),

  remove: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => {
      const ok = removeAgent(input.id);
      if (!ok) throw new Error("Cannot remove agent (still running or not found)");
      return { success: true };
    }),

  rename: publicProcedure
    .input(z.object({ id: z.string(), name: z.string().min(1).max(100) }))
    .mutation(({ input }) => {
      const ok = renameAgent(input.id, input.name);
      if (!ok) throw new Error("Agent not found");
      return { success: true };
    }),

  createPty: publicProcedure
    .input(
      z.object({
        command: z.string().min(1),
        args: z.array(z.string()).optional(),
        name: z.string().optional(),
        cols: z.number().int().positive().optional(),
        rows: z.number().int().positive().optional(),
        team: z.string().optional(),
      })
    )
    .mutation(({ input }) => {
      return createPtyAgent(input.command, input.args ?? [], {
        name: input.name,
        cols: input.cols,
        rows: input.rows,
        team: input.team,
      });
    }),

  /** Spawn a Pi agent as an interactive PTY. Builds the correct pi command
   *  server-side so the frontend just sends a prompt + optional team/workflow. */
  spawn: publicProcedure
    .input(
      z.object({
        prompt: z.string().min(1),
        team: z.string().optional(),
        workflow: z.string().optional(),
        name: z.string().optional(),
        model: z.string().optional(),
        cols: z.number().int().positive().optional(),
        rows: z.number().int().positive().optional(),
      })
    )
    .mutation(({ input }) => {
      const extra: string[] = [];
      if (input.workflow) {
        extra.push("agent-workflow.ts");
      } else if (input.team) {
        extra.push("agent-team.ts");
      }

      const args: string[] = [...extensionArgs(extra)];

      if (input.model) {
        args.push("--model", input.model);
      }

      args.push(input.prompt);

      return createPtyAgent("pi", args, {
        name: input.name,
        cols: input.cols,
        rows: input.rows,
        team: input.team ?? input.workflow,
      });
    }),

  listSessions: publicProcedure
    .input(
      z
        .object({
          limit: z.number().int().positive().max(500).optional(),
          cwd: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      return listSessions(input);
    }),

  resumeSession: publicProcedure
    .input(
      z.object({
        sessionPath: z.string().min(1),
        name: z.string().optional(),
        cols: z.number().int().positive().optional(),
        rows: z.number().int().positive().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const fs = await import("node:fs");
      const sessionsRoot = path.join(os.homedir(), ".pi", "agent", "sessions");
      const resolved = path.resolve(input.sessionPath);
      if (!resolved.startsWith(sessionsRoot + "/")) {
        throw new Error("Invalid session path: must be under ~/.pi/agent/sessions/");
      }
      if (!fs.existsSync(resolved)) {
        throw new Error(`Session file not found: ${input.sessionPath}`);
      }

      // Resume the session: pi --session <path> with no prompt
      // Pi will replay history and wait for user input in interactive mode
      const args = [...extensionArgs(), "--session", resolved];

      const agent = createPtyAgent("pi", args, {
        name: input.name,
        cols: input.cols,
        rows: input.rows,
      });

      return agent;
    }),
});
