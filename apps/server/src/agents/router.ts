import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import * as os from "node:os";
import { router, publicProcedure } from "../trpc.js";
import { db } from "../db/index.js";
import { settings, agents, agentMessages } from "../db/schema.js";

import {
  spawnAgent,
  resumeAgent,
  stopAgent as stopBgAgent,
  removeAgent as removeBgAgent,
  isAgentRunning,
} from "./bg-manager.js";

import {
  spawnExternalAgent,
  stopExternalAgent,
  focusTerminal,
  getExternalAgentId,
  isExternalRunning,
  getActivity,
} from "./manager.js";

function now() {
  return new Date().toISOString();
}

async function getAgentCwd(inputCwd?: string): Promise<string> {
  if (inputCwd) return inputCwd;
  const row = await db.select().from(settings).where(eq(settings.key, "agents.cwd")).get();
  return row?.value || os.homedir();
}

export const agentsRouter = router({
  /** List all agents, newest first */
  list: publicProcedure.query(() => {
    return db.select().from(agents).orderBy(desc(agents.createdAt)).all();
  }),

  /** Get a single agent by ID */
  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(({ input }) => {
      return db.select().from(agents).where(eq(agents.id, input.id)).get() ?? null;
    }),

  /** Get messages for an agent */
  messages: publicProcedure
    .input(z.object({ agentId: z.string() }))
    .query(({ input }) => {
      return db.select().from(agentMessages)
        .where(eq(agentMessages.agentId, input.agentId))
        .orderBy(agentMessages.createdAt)
        .all();
    }),

  /** Spawn a background agent */
  spawn: publicProcedure
    .input(z.object({
      prompt: z.string().optional(),
      model: z.string().optional(),
      cwd: z.string().optional(),
      name: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const id = randomUUID();
      const cwd = await getAgentCwd(input.cwd);
      const name = input.name || input.prompt?.slice(0, 50) || "New Agent";
      const ts = now();

      db.insert(agents).values({
        id,
        name,
        prompt: input.prompt || null,
        status: "running",
        mode: "background",
        model: input.model || null,
        cwd,
        createdAt: ts,
        updatedAt: ts,
      }).run();

      // Save the user prompt as the first message
      if (input.prompt) {
        db.insert(agentMessages).values({
          id: randomUUID(),
          agentId: id,
          role: "user",
          content: input.prompt,
          createdAt: ts,
        }).run();
      }

      spawnAgent({ id, prompt: input.prompt, model: input.model, cwd });

      return { id, name };
    }),

  /** Spawn an agent in Terminal.app (external mode) */
  spawnExternal: publicProcedure
    .input(z.object({
      prompt: z.string().optional(),
      model: z.string().optional(),
      cwd: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const args: string[] = ["--dangerously-skip-permissions"];
      if (input.model) args.push("--model", input.model);
      if (input.prompt) args.push(input.prompt);

      const cwd = await getAgentCwd(input.cwd);
      return spawnExternalAgent("claude", args, cwd);
    }),

  /** Stop an agent */
  stop: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => {
      // Try background agent first
      if (isAgentRunning(input.id)) {
        stopBgAgent(input.id);
        return { success: true };
      }
      // Try external agent
      if (isExternalRunning()) {
        stopExternalAgent();
        return { success: true };
      }
      // Agent might be in DB but process already dead — mark stopped
      db.update(agents)
        .set({ status: "stopped", updatedAt: now() })
        .where(eq(agents.id, input.id))
        .run();
      return { success: true };
    }),

  /** Resume a completed agent with a user message */
  respond: publicProcedure
    .input(z.object({
      id: z.string(),
      message: z.string(),
    }))
    .mutation(({ input }) => {
      // Save user message
      db.insert(agentMessages).values({
        id: randomUUID(),
        agentId: input.id,
        role: "user",
        content: input.message,
        createdAt: now(),
      }).run();

      const ok = resumeAgent(input.id, input.message);
      if (!ok) throw new Error("Cannot resume agent — not found, no session, or still running");
      return { success: true };
    }),

  /** Rename an agent */
  rename: publicProcedure
    .input(z.object({ id: z.string(), name: z.string() }))
    .mutation(({ input }) => {
      db.update(agents)
        .set({ name: input.name, updatedAt: now() })
        .where(eq(agents.id, input.id))
        .run();
      return { success: true };
    }),

  /** Remove a stopped agent and its messages */
  remove: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => {
      const ok = removeBgAgent(input.id);
      if (!ok) throw new Error("Agent is still running — stop it first");
      return { success: true };
    }),

  /** External agent status (backward compat) */
  status: publicProcedure.query(() => {
    const extId = getExternalAgentId();
    return {
      id: extId,
      running: isExternalRunning(),
      activity: getActivity(),
      mode: "external" as const,
    };
  }),

  /** Focus Terminal.app (external mode) */
  focusTerminal: publicProcedure.mutation(() => {
    focusTerminal();
    return { success: true };
  }),
});
