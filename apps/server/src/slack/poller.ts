import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { slackChannels, slackConversations, slackDayHeadlines, todos, settings } from "../db/schema.js";
import { fetchChannelMessages } from "./client.js";
import { getAuthStatus } from "./client.js";
import {
  groupIntoConversations,
  summarizeMessages,
  summarizeConversation,
  generateDayHeadline,
} from "./summarizer.js";
import { broadcast } from "../ws/events.js";

let intervalId: ReturnType<typeof setInterval> | null = null;

export function startSlackPoller() {
  const auth = getAuthStatus();
  if (auth.mode === "none") {
    console.log("[slack] no credentials available, poller disabled");
    return;
  }
  console.log(`[slack] poller started (auth mode: ${auth.mode})`);
  pollAllChannels();
  intervalId = setInterval(pollAllChannels, 5 * 60 * 1000);
}

export function stopSlackPoller() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log("[slack] poller stopped");
  }
}

export async function pollAllChannels() {
  try {
    const channels = await db
      .select()
      .from(slackChannels)
      .where(eq(slackChannels.enabled, true))
      .all();

    for (const channel of channels) {
      try {
        await pollChannel(channel);
      } catch (err) {
        console.error(`[slack] error polling ${channel.name}:`, err);
      }
    }
  } catch (err) {
    console.error("[slack] error in pollAllChannels:", err);
  }
}

export async function pollSingleChannel(channelId: string) {
  const channel = await db
    .select()
    .from(slackChannels)
    .where(eq(slackChannels.id, channelId))
    .get();
  if (!channel) throw new Error(`Channel ${channelId} not found`);
  await pollChannel(channel);
}

async function pollChannel(channel: typeof slackChannels.$inferSelect) {
  const isInitialPoll = !channel.lastPolledAt;

  // Read configured summarization model from settings
  const modelSetting = await db
    .select()
    .from(settings)
    .where(eq(settings.key, "slack.summarizationModel"))
    .get();
  const model = modelSetting?.value || null;

  // Default to 7 days ago for first poll
  const oldest = channel.lastPolledAt
    ? (new Date(channel.lastPolledAt).getTime() / 1000).toString()
    : ((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000).toString();

  const messages = await fetchChannelMessages(channel.slackChannelId, oldest, channel.teamId);
  if (messages.length === 0) return;

  // Group messages into conversations
  const conversations = groupIntoConversations(messages);

  // Load existing conversation rows for this channel
  const existingRows = await db
    .select()
    .from(slackConversations)
    .where(eq(slackConversations.channelId, channel.id))
    .all();

  const existingByTs = new Map(existingRows.map((r) => [r.conversationTs, r]));

  // Determine which conversations need (re-)summarization
  const changed: { parentTs: string; messages: typeof messages }[] = [];
  const unchanged: string[] = []; // parentTs values that don't need updates

  for (const conv of conversations) {
    const existing = existingByTs.get(conv.parentTs);
    if (!existing || conv.messages.length > existing.messageCount) {
      changed.push(conv);
    } else {
      unchanged.push(conv.parentTs);
    }
  }

  if (changed.length === 0) {
    // Nothing new — just update lastPolledAt
    const now = new Date().toISOString();
    await db
      .update(slackChannels)
      .set({ lastPolledAt: now })
      .where(eq(slackChannels.id, channel.id));
    return;
  }

  const now = new Date().toISOString();

  // Map from parentTs -> { summary, todos, isNew }
  const results = new Map<
    string,
    { summary: string; todos: { title: string; description: string; priority: "low" | "medium" | "high"; messageTs?: string }[]; isNew: boolean }
  >();

  if (changed.length > 3) {
    // Batch path: call summarizeMessages for all changed conversations' messages
    const allChangedMessages = changed.flatMap((c) => c.messages);
    const batchResult = await summarizeMessages(
      channel.name,
      channel.focus,
      channel.ignore,
      allChangedMessages,
      channel.todoFocus,
      channel.context,
      model,
    );

    // Map bullets back to conversations by messageTs
    const bulletsByTs = new Map<string, string>();
    for (const bullet of batchResult.bullets) {
      if (bullet.messageTs) {
        bulletsByTs.set(bullet.messageTs, bullet.text);
      }
    }

    // Distribute todos by messageTs
    const todosByTs = new Map<string, typeof batchResult.todos>();
    for (const todo of batchResult.todos) {
      if (todo.messageTs) {
        const list = todosByTs.get(todo.messageTs) ?? [];
        list.push(todo);
        todosByTs.set(todo.messageTs, list);
      }
    }

    for (const conv of changed) {
      const isNew = !existingByTs.has(conv.parentTs);
      const summary = bulletsByTs.get(conv.parentTs) ?? "";
      const convTodos = todosByTs.get(conv.parentTs) ?? [];
      results.set(conv.parentTs, { summary, todos: convTodos, isNew });
    }
  } else {
    // Incremental path: summarize each conversation individually
    for (const conv of changed) {
      const isNew = !existingByTs.has(conv.parentTs);
      const result = await summarizeConversation(
        channel.name,
        channel.focus,
        channel.ignore,
        conv.messages,
        channel.todoFocus,
        channel.context,
        model,
      );
      results.set(conv.parentTs, { summary: result.summary, todos: result.todos, isNew });
    }
  }

  // Upsert slack_conversations rows
  const affectedDays = new Set<string>();

  for (const conv of changed) {
    const result = results.get(conv.parentTs)!;
    // Skip empty summaries (off-topic/ignored conversations)
    if (!result.summary) continue;

    const parentTsFloat = parseFloat(conv.parentTs);
    const day = new Date(parentTsFloat * 1000).toISOString().slice(0, 10);
    affectedDays.add(day);

    const firstTs = Math.min(...conv.messages.map((m) => parseFloat(m.ts)));
    const lastTs = Math.max(...conv.messages.map((m) => parseFloat(m.ts)));
    const firstMessageAt = new Date(firstTs * 1000).toISOString();
    const lastMessageAt = new Date(lastTs * 1000).toISOString();

    const existing = existingByTs.get(conv.parentTs);
    if (existing) {
      // Update
      await db
        .update(slackConversations)
        .set({
          summary: result.summary,
          messageCount: conv.messages.length,
          lastMessageAt,
          updatedAt: now,
        })
        .where(eq(slackConversations.id, existing.id));
      // Also mark existing day as affected
      affectedDays.add(existing.day);
    } else {
      // Insert
      await db.insert(slackConversations).values({
        id: crypto.randomUUID(),
        channelId: channel.id,
        channelName: channel.name,
        conversationTs: conv.parentTs,
        day,
        summary: result.summary,
        messageCount: conv.messages.length,
        firstMessageAt,
        lastMessageAt,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Extract todos only from newly inserted conversations
    if (result.isNew && channel.todosEnabled !== false && !isInitialPoll) {
      for (const todo of result.todos) {
        const url = channel.teamId
          ? `slack://channel?team=${channel.teamId}&id=${channel.slackChannelId}${todo.messageTs ? `&message=${todo.messageTs}` : ""}`
          : `slack://channel?id=${channel.slackChannelId}${todo.messageTs ? `&message=${todo.messageTs}` : ""}`;

        await db.insert(todos).values({
          id: crypto.randomUUID(),
          source: "slack",
          title: todo.title,
          description: todo.description,
          priority: todo.priority,
          url,
          completed: false,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  }

  // Regenerate day headlines for affected days
  for (const day of affectedDays) {
    const dayConvs = await db
      .select()
      .from(slackConversations)
      .where(
        and(
          eq(slackConversations.channelId, channel.id),
          eq(slackConversations.day, day),
        )
      )
      .all();

    const summaries = dayConvs.map((c) => c.summary).filter(Boolean);
    const headline = await generateDayHeadline(channel.name, summaries, model);

    const existingHeadline = await db
      .select()
      .from(slackDayHeadlines)
      .where(
        and(
          eq(slackDayHeadlines.channelId, channel.id),
          eq(slackDayHeadlines.day, day),
        )
      )
      .get();

    if (existingHeadline) {
      await db
        .update(slackDayHeadlines)
        .set({
          headline,
          conversationCount: dayConvs.length,
          updatedAt: now,
        })
        .where(eq(slackDayHeadlines.id, existingHeadline.id));
    } else {
      await db.insert(slackDayHeadlines).values({
        id: crypto.randomUUID(),
        channelId: channel.id,
        day,
        headline,
        conversationCount: dayConvs.length,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  // Update lastPolledAt
  await db
    .update(slackChannels)
    .set({ lastPolledAt: now })
    .where(eq(slackChannels.id, channel.id));

  broadcast({ type: "slack:summary", channelId: channel.id, summaryId: "" });

  const todoCount = [...results.values()]
    .filter((r) => r.isNew)
    .reduce((sum, r) => sum + r.todos.length, 0);
  console.log(
    `[slack] ${channel.name}: ${messages.length} messages, ${changed.length} conversations updated, ${todoCount} todos`
  );
}
