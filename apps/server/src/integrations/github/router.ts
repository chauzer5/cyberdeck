import { z } from "zod";
import { router, publicProcedure } from "../../trpc.js";
import {
  getPullRequests,
  getPRDetail,
  mergePR,
  addComment,
  rerunCheck,
  testConnection,
} from "./client.js";

export const githubRouter = router({
  pullRequests: publicProcedure.query(async () => {
    return getPullRequests();
  }),

  prDetail: publicProcedure
    .input(z.object({ repo: z.string(), prNumber: z.number() }))
    .query(async ({ input }) => {
      return getPRDetail(input.repo, input.prNumber);
    }),

  merge: publicProcedure
    .input(z.object({ repo: z.string(), prNumber: z.number() }))
    .mutation(async ({ input }) => {
      return mergePR(input.repo, input.prNumber);
    }),

  addComment: publicProcedure
    .input(z.object({ repo: z.string(), prNumber: z.number(), body: z.string() }))
    .mutation(async ({ input }) => {
      return addComment(input.repo, input.prNumber, input.body);
    }),

  rerunCheck: publicProcedure
    .input(z.object({ repo: z.string(), checkRunId: z.number() }))
    .mutation(async ({ input }) => {
      return rerunCheck(input.repo, input.checkRunId);
    }),

  testConnection: publicProcedure.mutation(async () => {
    return testConnection();
  }),
});
