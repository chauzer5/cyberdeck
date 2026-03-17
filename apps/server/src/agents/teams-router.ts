import { z } from "zod";
import { router, publicProcedure } from "../trpc.js";
import { listTeams, getAgentDefs, saveTeamsYaml } from "./teams.js";

export const teamsRouter = router({
  list: publicProcedure.query(() => {
    return listTeams();
  }),

  agentDefs: publicProcedure.query(() => {
    return getAgentDefs().map((d) => ({
      name: d.name,
      description: d.description,
      tools: d.tools,
      model: d.model,
    }));
  }),

  saveTeams: publicProcedure
    .input(
      z.record(
        z.string(),
        z.array(
          z.object({
            name: z.string(),
            model: z.string().optional(),
            thinking: z.enum(["off", "minimal", "low", "medium", "high", "xhigh"]).optional(),
          })
        )
      )
    )
    .mutation(({ input }) => {
      saveTeamsYaml(input);
      return { success: true };
    }),
});
