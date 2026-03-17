import { z } from "zod";
import { router, publicProcedure } from "../trpc.js";
import { listWorkflows, saveWorkflows } from "./workflows.js";
import { getAgentDefs } from "./teams.js";

const thinkingEnum = z.enum(["off", "minimal", "low", "medium", "high", "xhigh"]).optional();

const stepSchema = z.object({
  name: z.string().min(1),
  agent: z.string().min(1),
  prompt: z.string().min(1),
  model: z.string().optional(),
  thinking: thinkingEnum,
});

const workflowSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  max_loops: z.number().int().positive().optional(),
  steps: z.array(stepSchema),
});

export const workflowsRouter = router({
  list: publicProcedure.query(() => {
    return listWorkflows();
  }),

  agentDefs: publicProcedure.query(() => {
    return getAgentDefs().map((d) => ({
      name: d.name,
      description: d.description,
    }));
  }),

  save: publicProcedure
    .input(z.array(workflowSchema))
    .mutation(({ input }) => {
      saveWorkflows(
        input.map((w) => ({
          name: w.name,
          description: w.description,
          max_loops: w.max_loops,
          steps: w.steps.map((s) => ({
            name: s.name,
            agent: s.agent,
            prompt: s.prompt,
            model: s.model,
            thinking: s.thinking,
          })),
        }))
      );
      return { success: true };
    }),
});
