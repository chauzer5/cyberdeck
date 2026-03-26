import notifier from "node-notifier";
import { db } from "../db/index.js";
import { notifications } from "../db/schema.js";
import { broadcast } from "../ws/events.js";

interface CreateNotificationInput {
  type: "slack_unread" | "mr_pipeline" | "mr_approval" | "todo_created";
  title: string;
  detail?: string;
  url?: string;
  meta?: Record<string, unknown>;
}

export async function createNotification(input: CreateNotificationInput): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.insert(notifications).values({
    id,
    type: input.type,
    title: input.title,
    detail: input.detail ?? null,
    url: input.url ?? null,
    meta: input.meta ? JSON.stringify(input.meta) : null,
    read: false,
    createdAt: now,
  });
  broadcast({ type: "notification:new", notificationId: id });
  sendMacNotification(input.title, input.detail, input.url);
  return id;
}

function sendMacNotification(title: string, body?: string, url?: string) {
  notifier.notify(
    {
      title: "PRISM",
      subtitle: title,
      message: body || "",
      sound: "default",
      open: url || undefined,
    },
    (err) => {
      if (err) console.warn("Native notification failed:", err.message);
    },
  );
}
