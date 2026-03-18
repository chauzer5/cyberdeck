import { router, publicProcedure } from "./trpc.js";
import { todosRouter } from "./todos/router.js";
import { agentsRouter } from "./agents/router.js";
import { slackRouter } from "./slack/router.js";
import { settingsRouter } from "./settings/router.js";
import { sourceControlRouter } from "./integrations/source-control/router.js";
import { linearRouter } from "./integrations/linear/router.js";

export const appRouter = router({
  health: router({
    ping: publicProcedure.query(() => {
      return { status: "ok", timestamp: new Date().toISOString() };
    }),
  }),
  todos: todosRouter,
  agents: agentsRouter,
  slack: slackRouter,
  settings: settingsRouter,
  sourceControl: sourceControlRouter,
  linear: linearRouter,
});

export type AppRouter = typeof appRouter;
