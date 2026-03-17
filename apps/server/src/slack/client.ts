import { WebClient } from "@slack/web-api";
import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { slackChannelDirectory, slackUserDirectory } from "../db/schema.js";
import {
  getDesktopCredentials,
  clearDesktopCredentials,
  type SlackWorkspaceCredentials,
} from "./desktop-auth.js";

// ── Types ──────────────────────────────────────────────────────────────────

export interface SlackMessage {
  user: string;
  text: string;
  ts: string;
  threadTs?: string;
}

export interface AuthStatus {
  mode: "desktop" | "bot-token" | "none";
  workspaces: Array<{ teamId: string; teamName: string; userId: string }>;
}

// ── Client Cache ───────────────────────────────────────────────────────────

const clientCache = new Map<string, WebClient>();

// ── Channel Directory Cache (DB-backed, 24h TTL) ─────────────────────────

interface ChannelEntry { id: string; name: string }
const CHANNEL_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

async function getChannelList(teamId?: string | null): Promise<ChannelEntry[]> {
  // Check DB cache first
  const rows = teamId
    ? await db.select().from(slackChannelDirectory).where(eq(slackChannelDirectory.teamId, teamId)).all()
    : await db.select().from(slackChannelDirectory).all();

  const cutoff = new Date(Date.now() - CHANNEL_CACHE_TTL).toISOString();
  if (rows.length > 0 && rows.every((r) => r.cachedAt > cutoff)) {
    return rows.map((r) => ({ id: r.slackChannelId, name: r.name }));
  }

  // Cache miss or stale — fetch from Slack API
  const slack = getSlackClient(teamId);
  const channels: ChannelEntry[] = [];
  let cursor: string | undefined;

  do {
    console.log(`[slack:api] conversations.list (cursor=${cursor ?? "initial"})`);
    const result = await slack.conversations.list({
      types: "public_channel,private_channel",
      limit: 200,
      cursor,
    });
    for (const ch of result.channels ?? []) {
      if (ch.id && ch.name) channels.push({ id: ch.id, name: ch.name });
    }
    cursor = result.response_metadata?.next_cursor || undefined;
  } while (cursor);

  // Persist to DB
  const now = new Date().toISOString();
  const teamVal = teamId ?? null;

  // Clear stale entries for this team scope
  if (teamId) {
    await db.delete(slackChannelDirectory).where(eq(slackChannelDirectory.teamId, teamId));
  } else {
    await db.delete(slackChannelDirectory);
  }

  for (const ch of channels) {
    await db.insert(slackChannelDirectory).values({
      slackChannelId: ch.id,
      name: ch.name,
      teamId: teamVal,
      cachedAt: now,
    });
  }

  return channels;
}

// ── User Name Cache (DB-backed, 30-day TTL) ──────────────────────────────

const USER_CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days

async function resolveUserNames(
  userIds: string[],
  teamId?: string | null
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const uncached: string[] = [];

  // Identify the authenticated user so we can label them as "you"
  const selfIds = new Set<string>();
  const desktop = getDesktopCredentials();
  for (const ws of desktop.workspaces) {
    if (!teamId || ws.teamId === teamId) selfIds.add(ws.userId);
  }

  const cutoff = new Date(Date.now() - USER_CACHE_TTL).toISOString();

  for (const id of userIds) {
    if (selfIds.has(id)) {
      result.set(id, "you");
      continue;
    }
    const cached = await db
      .select()
      .from(slackUserDirectory)
      .where(eq(slackUserDirectory.slackUserId, id))
      .get();
    if (cached && cached.cachedAt > cutoff) {
      result.set(id, cached.name);
    } else {
      uncached.push(id);
    }
  }

  if (uncached.length > 0) {
    const slack = getSlackClient(teamId);
    const now = new Date().toISOString();
    for (const id of uncached) {
      try {
        console.log(`[slack:api] users.info (user=${id})`);
        const info = await slack.users.info({ user: id });
        const name =
          info.user?.real_name ||
          info.user?.profile?.display_name ||
          info.user?.name ||
          id;
        await db
          .insert(slackUserDirectory)
          .values({ slackUserId: id, name, teamId: teamId ?? null, cachedAt: now })
          .onConflictDoUpdate({
            target: slackUserDirectory.slackUserId,
            set: { name, cachedAt: now },
          });
        result.set(id, name);
      } catch {
        result.set(id, id);
      }
    }
  }

  return result;
}

function createDesktopClient(
  ws: SlackWorkspaceCredentials,
  cookie: string
): WebClient {
  return new WebClient(ws.token, {
    headers: { Cookie: `d=${cookie}` },
  });
}

function createBotClient(token: string): WebClient {
  return new WebClient(token);
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Returns a Slack WebClient for the given team. Strategy:
 *   1. Desktop credentials (matched by teamId, or first workspace if unspecified)
 *   2. SLACK_BOT_TOKEN env var fallback
 *   3. Throws if neither is available
 */
export function getSlackClient(teamId?: string | null): WebClient {
  const cacheKey = teamId ?? "__default__";
  const cached = clientCache.get(cacheKey);
  if (cached) return cached;

  // Try desktop credentials first
  const desktop = getDesktopCredentials();
  if (desktop.workspaces.length > 0 && desktop.cookie) {
    const ws = teamId
      ? desktop.workspaces.find((w) => w.teamId === teamId)
      : desktop.workspaces[0];

    if (ws) {
      const client = createDesktopClient(ws, desktop.cookie);
      clientCache.set(cacheKey, client);
      return client;
    }
  }

  // Fall back to bot token
  const botToken = process.env.SLACK_BOT_TOKEN;
  if (botToken) {
    const client = createBotClient(botToken);
    clientCache.set(cacheKey, client);
    return client;
  }

  throw new Error(
    "No Slack credentials available. Install Slack desktop or set SLACK_BOT_TOKEN."
  );
}

/**
 * Returns the current authentication mode and available workspaces.
 */
export function getAuthStatus(): AuthStatus {
  const desktop = getDesktopCredentials();
  if (desktop.workspaces.length > 0 && desktop.cookie) {
    return {
      mode: "desktop",
      workspaces: desktop.workspaces.map((w) => ({
        teamId: w.teamId,
        teamName: w.teamName,
        userId: w.userId,
      })),
    };
  }

  if (process.env.SLACK_BOT_TOKEN) {
    return { mode: "bot-token", workspaces: [] };
  }

  return { mode: "none", workspaces: [] };
}

/**
 * Clears all cached clients and desktop credentials. Call on auth failure.
 */
export function resetSlackClients(): void {
  clientCache.clear();
  clearDesktopCredentials();
}

// ── Auth-Failure Retry Wrapper ─────────────────────────────────────────────

const RETRYABLE_ERRORS = new Set(["invalid_auth", "token_revoked", "token_expired", "not_authed"]);

function isRetryableAuthError(err: unknown): boolean {
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data?: { error?: string } }).data;
    return typeof data?.error === "string" && RETRYABLE_ERRORS.has(data.error);
  }
  return false;
}

// ── Slack API Functions ────────────────────────────────────────────────────

export async function fetchChannelMessages(
  slackChannelId: string,
  oldest?: string,
  teamId?: string | null
): Promise<SlackMessage[]> {
  const attempt = async () => {
    const slack = getSlackClient(teamId);
    console.log(`[slack:api] conversations.history (channel=${slackChannelId}, oldest=${oldest ?? "none"})`);
    const result = await slack.conversations.history({
      channel: slackChannelId,
      oldest,
      limit: 200,
    });

    const topLevel = (result.messages ?? [])
      .filter((m) => m.text && !m.subtype)
      .reverse(); // oldest first

    const messages: SlackMessage[] = [];

    for (const m of topLevel) {
      messages.push({
        user: m.user ?? "unknown",
        text: m.text!,
        ts: m.ts!,
      });

      // Fetch thread replies if this message started a thread
      const replyCount = (m as { reply_count?: number }).reply_count ?? 0;
      if (replyCount > 0 && m.ts) {
        try {
          console.log(`[slack:api] conversations.replies (channel=${slackChannelId}, ts=${m.ts})`);
          const thread = await slack.conversations.replies({
            channel: slackChannelId,
            ts: m.ts,
            limit: 100,
          });
          // First message in replies is the parent — skip it
          for (const reply of (thread.messages ?? []).slice(1)) {
            if (reply.text && !reply.subtype) {
              messages.push({
                user: reply.user ?? "unknown",
                text: reply.text,
                ts: reply.ts!,
                threadTs: m.ts,
              });
            }
          }
        } catch (err) {
          console.error(`[slack] failed to fetch thread ${m.ts}:`, err);
        }
      }
    }

    // Resolve user IDs to display names
    const userIds = [...new Set(messages.map((m) => m.user))];
    const mentionIds = new Set<string>();
    for (const m of messages) {
      for (const match of m.text.matchAll(/<@(U[A-Z0-9]+)>/g)) {
        mentionIds.add(match[1]);
      }
    }
    const allIds = [...new Set([...userIds, ...mentionIds])];
    const nameMap = await resolveUserNames(allIds, teamId);

    for (const m of messages) {
      m.user = nameMap.get(m.user) ?? m.user;
      m.text = m.text.replace(/<@(U[A-Z0-9]+)>/g, (_, id) => `@${nameMap.get(id) ?? id}`);
    }

    return messages;
  };

  try {
    return await attempt();
  } catch (err) {
    if (isRetryableAuthError(err)) {
      resetSlackClients();
      return await attempt();
    }
    throw err;
  }
}

export async function fetchUnreadDmCount(): Promise<{
  unreadCount: number;
  checkedAt: string;
}> {
  // users.counts is a desktop-only Slack API that returns per-DM unread counts
  // via `dm_count` on each IM entry. This is far more reliable than trying to
  // infer unread state from conversations.list, which does not return read-state
  // fields for regular (non-bot) tokens.
  const attempt = async (teamId?: string | null) => {
    const slack = getSlackClient(teamId);
    console.log(`[slack:api] users.counts (teamId=${teamId ?? "default"})`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (slack as any).apiCall("users.counts", {
      mpim_aware: true,
      only_self_subteams: true,
    });

    const ims = (result.ims ?? []) as Record<string, unknown>[];
    const mpims = (result.mpims ?? []) as Record<string, unknown>[];
    const allDms = [...ims, ...mpims];

    let unread = 0;
    for (const dm of allDms) {
      const dmCount = dm.dm_count as number | undefined;
      if ((dmCount ?? 0) > 0) unread++;
    }

    console.log(`[slack:dm] users.counts → ${allDms.length} DMs, ${unread} unread`);
    return unread;
  };

  const desktop = getDesktopCredentials();
  let total = 0;

  if (desktop.workspaces.length > 0) {
    for (const ws of desktop.workspaces) {
      try {
        total += await attempt(ws.teamId);
      } catch (err) {
        if (isRetryableAuthError(err)) {
          resetSlackClients();
          try {
            total += await attempt(ws.teamId);
          } catch {
            console.error(`[slack:dm] retry failed for ${ws.teamName}`);
          }
        } else {
          console.error(`[slack:dm] error for ${ws.teamName}:`, err);
        }
      }
    }
  } else {
    try {
      total = await attempt();
    } catch (err) {
      if (isRetryableAuthError(err)) {
        resetSlackClients();
        total = await attempt();
      } else {
        throw err;
      }
    }
  }

  return { unreadCount: total, checkedAt: new Date().toISOString() };
}

export async function resolveChannelId(
  name: string,
  teamId?: string | null
): Promise<{ id: string; name: string } | null> {
  const attempt = async () => {
    const cleanName = name.replace(/^#/, "");
    const channels = await getChannelList(teamId);
    return channels.find((ch) => ch.name === cleanName) ?? null;
  };

  try {
    return await attempt();
  } catch (err) {
    if (isRetryableAuthError(err)) {
      resetSlackClients();
      return await attempt();
    }
    throw err;
  }
}
