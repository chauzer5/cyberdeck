import { z } from "zod";
import { router, publicProcedure } from "../../trpc.js";
import { getIssues, getIssueDetail, addComment, testConnection, listTeams, getReadyIssues, startTicket, bustLinearCache } from "./client.js";

export const linearRouter = router({
  sync: publicProcedure.mutation(async () => {
    bustLinearCache();
    const [issues, readyIssues] = await Promise.all([
      getIssues(),
      getReadyIssues(),
    ]);
    return { ok: true, count: issues.length + readyIssues.length };
  }),

  issues: publicProcedure.query(async () => {
    return getIssues();
  }),

  readyIssues: publicProcedure.query(async () => {
    return getReadyIssues();
  }),

  teams: publicProcedure.query(async () => {
    return listTeams();
  }),

  issueDetail: publicProcedure
    .input(z.object({ identifier: z.string() }))
    .query(async ({ input }) => {
      return getIssueDetail(input.identifier);
    }),

  addComment: publicProcedure
    .input(z.object({ issueId: z.string(), body: z.string() }))
    .mutation(async ({ input }) => {
      return addComment(input.issueId, input.body);
    }),

  startTicket: publicProcedure
    .input(z.object({ issueId: z.string() }))
    .mutation(async ({ input }) => {
      return startTicket(input.issueId);
    }),

  testConnection: publicProcedure.mutation(async () => {
    return testConnection();
  }),
});
