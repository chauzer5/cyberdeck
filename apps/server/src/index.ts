import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router.js";
import { migrate } from "./db/index.js";
import { onOpen, onMessage, onClose } from "./ws/index.js";
import { startSlackPoller } from "./slack/poller.js";
import { startDmPoller } from "./slack/dm-poller.js";
import { backfillTeamIds } from "./slack/backfill-team-ids.js";

// Run migrations
migrate();

// Backfill team IDs and fix Slack deep links
backfillTeamIds();

// Start background services
startSlackPoller();
startDmPoller();

const app = new Hono();

const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

// CORS for dev
app.use(
  "*",
  cors({
    origin: ["http://localhost:5173"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  })
);

// tRPC handler
app.use("/trpc/*", async (c) => {
  const response = await fetchRequestHandler({
    endpoint: "/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext: () => ({}),
  });
  return response;
});

// WebSocket endpoint
app.get(
  "/ws",
  upgradeWebSocket(() => ({
    onOpen: (_event, ws) => onOpen(ws),
    onMessage: (message, ws) => onMessage(ws, message),
    onClose: (_event, ws) => onClose(ws),
  }))
);

// Health check
app.get("/health", (c) => c.json({ status: "ok" }));

const port = Number(process.env.PORT) || 9001;

const server = serve({ fetch: app.fetch, port }, () => {
  console.log(`[server] running on http://localhost:${port}`);
});

injectWebSocket(server);
