import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const slackChannels = sqliteTable("slack_channels", {
  id: text("id").primaryKey(),
  slackChannelId: text("slack_channel_id").notNull(),
  name: text("name").notNull(),
  focus: text("focus").notNull(),
  ignore: text("ignore"),
  context: text("context"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  todosEnabled: integer("todos_enabled", { mode: "boolean" }).notNull().default(true),
  todoFocus: text("todo_focus"),
  lastPolledAt: text("last_polled_at"),
  teamId: text("team_id"),
  sortOrder: integer("sort_order"),
  createdAt: text("created_at").notNull(),
});

export const slackSummaries = sqliteTable("slack_summaries", {
  id: text("id").primaryKey(),
  channelId: text("channel_id").notNull(),
  channelName: text("channel_name").notNull(),
  headline: text("headline"),
  summary: text("summary").notNull(),
  bullets: text("bullets"),
  messageCount: integer("message_count").notNull(),
  periodStart: text("period_start").notNull(),
  periodEnd: text("period_end").notNull(),
  createdAt: text("created_at").notNull(),
});

export const slackConversations = sqliteTable("slack_conversations", {
  id: text("id").primaryKey(),
  channelId: text("channel_id").notNull(),
  channelName: text("channel_name").notNull(),
  conversationTs: text("conversation_ts").notNull(),
  day: text("day").notNull(), // YYYY-MM-DD in UTC
  summary: text("summary").notNull(),
  messageCount: integer("message_count").notNull(),
  firstMessageAt: text("first_message_at").notNull(),
  lastMessageAt: text("last_message_at").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const slackDayHeadlines = sqliteTable("slack_day_headlines", {
  id: text("id").primaryKey(),
  channelId: text("channel_id").notNull(),
  day: text("day").notNull(), // YYYY-MM-DD
  headline: text("headline").notNull(),
  conversationCount: integer("conversation_count").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const slackChannelDirectory = sqliteTable("slack_channel_directory", {
  slackChannelId: text("slack_channel_id").primaryKey(),
  name: text("name").notNull(),
  teamId: text("team_id"),
  cachedAt: text("cached_at").notNull(),
});

export const slackUserDirectory = sqliteTable("slack_user_directory", {
  slackUserId: text("slack_user_id").primaryKey(),
  name: text("name").notNull(),
  teamId: text("team_id"),
  cachedAt: text("cached_at").notNull(),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const todos = sqliteTable("todos", {
  id: text("id").primaryKey(),
  source: text("source").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  status: text("status", { enum: ["active", "completed", "dismissed"] }).notNull().default("active"),
  priority: text("priority", { enum: ["low", "medium", "high"] }),
  dueDate: text("due_date"),
  url: text("url"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
