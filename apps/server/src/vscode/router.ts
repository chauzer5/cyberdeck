import { router, publicProcedure } from "../trpc.js";
import { getVSCodeStatus, startVSCode, stopVSCode } from "./manager.js";

export const vscodeRouter = router({
  status: publicProcedure.query(() => {
    return getVSCodeStatus();
  }),

  start: publicProcedure.mutation(async () => {
    return await startVSCode();
  }),

  stop: publicProcedure.mutation(() => {
    stopVSCode();
    return { status: "stopped" };
  }),
});
