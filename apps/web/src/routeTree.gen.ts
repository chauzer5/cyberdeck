import { rootRoute } from "./routes/__root";
import { indexRoute } from "./routes/index";
import { agentsRoute } from "./routes/agents";
import { slackRoute } from "./routes/slack";
import { sourceControlRoute } from "./routes/source-control";
import { linearRoute } from "./routes/linear";
import { teamsRoute } from "./routes/teams";
import { workflowsRoute } from "./routes/workflows";
import { settingsRoute } from "./routes/settings";
import { todosRoute } from "./routes/todos";
import { codeRoute } from "./routes/code";

export const routeTree = rootRoute.addChildren([indexRoute, agentsRoute, slackRoute, sourceControlRoute, linearRoute, teamsRoute, workflowsRoute, settingsRoute, todosRoute, codeRoute]);
