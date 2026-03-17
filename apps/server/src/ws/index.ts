import type { WSContext } from "hono/ws";
import { addClient, removeClient, handleCommand } from "./events.js";

export function onOpen(ws: WSContext) {
  console.log("[ws] client connected");
  addClient(ws);
  ws.send(JSON.stringify({ type: "ping" }));
}

export function onMessage(ws: WSContext, message: MessageEvent) {
  try {
    const command = JSON.parse(String(message.data));
    handleCommand(ws, command);
  } catch {
    console.error("[ws] invalid message");
  }
}

export function onClose(ws: WSContext) {
  console.log("[ws] client disconnected");
  removeClient(ws);
}
