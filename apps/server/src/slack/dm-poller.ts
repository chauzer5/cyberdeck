import { fetchUnreadDmCount } from "./client.js";
import { getAuthStatus } from "./client.js";
import { broadcast } from "../ws/events.js";
import { createNotification } from "../notifications/create.js";

let cachedResult = { unreadCount: 0, checkedAt: "" };
let intervalId: ReturnType<typeof setInterval> | null = null;

export function getUnreadDmStats() {
  return cachedResult;
}

export function startDmPoller() {
  const auth = getAuthStatus();
  if (auth.mode === "none") {
    console.log("[slack:dm] no credentials available, poller disabled");
    return;
  }
  console.log(`[slack:dm] poller started (auth mode: ${auth.mode})`);
  pollUnreadDms();
  intervalId = setInterval(pollUnreadDms, 2 * 60 * 1000);
}

export function stopDmPoller() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log("[slack:dm] poller stopped");
  }
}

async function pollUnreadDms() {
  try {
    const result = await fetchUnreadDmCount();
    console.log(`[slack:dm] unread DM conversations: ${result.unreadCount}`);
    const changed = result.unreadCount !== cachedResult.unreadCount;
    const increased = result.unreadCount > cachedResult.unreadCount;
    cachedResult = result;
    if (changed) {
      broadcast({ type: "slack:unread", unreadCount: result.unreadCount });
      if (increased) {
        await createNotification({
          type: "slack_unread",
          title: `${result.unreadCount} unread DM${result.unreadCount > 1 ? "s" : ""}`,
          detail: "You have new unread Slack direct messages",
        });
      }
    }
  } catch (err) {
    console.error("[slack:dm] poll error:", err);
  }
}
