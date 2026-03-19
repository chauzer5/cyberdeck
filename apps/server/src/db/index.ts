import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "fs";
import { dirname } from "path";
import * as schema from "./schema.js";

const dbPath = process.env.DATABASE_URL || "./data/prism.db";
mkdirSync(dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });

export function migrate() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS todos (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      completed INTEGER NOT NULL DEFAULT 0,
      priority TEXT CHECK(priority IN ('low', 'medium', 'high')),
      due_date TEXT,
      url TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS slack_channels (
      id TEXT PRIMARY KEY,
      slack_channel_id TEXT NOT NULL,
      name TEXT NOT NULL,
      focus TEXT NOT NULL DEFAULT '',
      ignore TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_polled_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS slack_summaries (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      channel_name TEXT NOT NULL,
      summary TEXT NOT NULL,
      message_count INTEGER NOT NULL,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  // Add team_id column to slack_channels (nullable, safe for existing rows)
  try {
    sqlite.exec(`ALTER TABLE slack_channels ADD COLUMN team_id TEXT`);
  } catch {
    // Column already exists — expected on subsequent startups
  }

  // Replace topics with focus + ignore — full table rebuild to drop the topics column
  const hasTopics = sqlite.prepare(`SELECT COUNT(*) as cnt FROM pragma_table_info('slack_channels') WHERE name = 'topics'`).get() as { cnt: number };
  if (hasTopics.cnt) {
    sqlite.exec(`
      CREATE TABLE slack_channels_new (
        id TEXT PRIMARY KEY,
        slack_channel_id TEXT NOT NULL,
        name TEXT NOT NULL,
        focus TEXT NOT NULL DEFAULT '',
        ignore TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        last_polled_at TEXT,
        team_id TEXT,
        created_at TEXT NOT NULL
      );
      INSERT INTO slack_channels_new (id, slack_channel_id, name, focus, enabled, last_polled_at, team_id, created_at)
        SELECT id, slack_channel_id, name, COALESCE(focus, topics), enabled, last_polled_at, team_id, created_at FROM slack_channels;
      DROP TABLE slack_channels;
      ALTER TABLE slack_channels_new RENAME TO slack_channels;
    `);
  }

  // Add headline column to slack_summaries (nullable for old rows)
  try {
    sqlite.exec(`ALTER TABLE slack_summaries ADD COLUMN headline TEXT`);
  } catch {
    // Column already exists — expected on subsequent startups
  }

  // Add bullets JSON column to slack_summaries (nullable for old rows)
  try {
    sqlite.exec(`ALTER TABLE slack_summaries ADD COLUMN bullets TEXT`);
  } catch {
    // Column already exists — expected on subsequent startups
  }

  // Add todos_enabled column to slack_channels (default true for backward compat)
  try {
    sqlite.exec(`ALTER TABLE slack_channels ADD COLUMN todos_enabled INTEGER NOT NULL DEFAULT 1`);
  } catch {
    // Column already exists — expected on subsequent startups
  }

  // Add todo_focus column to slack_channels (nullable — null means use generic heuristic)
  try {
    sqlite.exec(`ALTER TABLE slack_channels ADD COLUMN todo_focus TEXT`);
  } catch {
    // Column already exists — expected on subsequent startups
  }

  // Add context column to slack_channels (nullable — free-form background for summarization)
  try {
    sqlite.exec(`ALTER TABLE slack_channels ADD COLUMN context TEXT`);
  } catch {
    // Column already exists — expected on subsequent startups
  }

  // Add sort_order column to slack_channels (nullable — null means use insertion order)
  try {
    sqlite.exec(`ALTER TABLE slack_channels ADD COLUMN sort_order INTEGER`);
  } catch {
    // Column already exists — expected on subsequent startups
  }

  // Conversation-atomic Slack tables
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS slack_conversations (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      channel_name TEXT NOT NULL,
      conversation_ts TEXT NOT NULL,
      day TEXT NOT NULL,
      summary TEXT NOT NULL,
      message_count INTEGER NOT NULL,
      first_message_at TEXT NOT NULL,
      last_message_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_slack_conversations_channel_ts
      ON slack_conversations(channel_id, conversation_ts);

    CREATE INDEX IF NOT EXISTS idx_slack_conversations_channel_day
      ON slack_conversations(channel_id, day);

    CREATE TABLE IF NOT EXISTS slack_day_headlines (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      day TEXT NOT NULL,
      headline TEXT NOT NULL,
      conversation_count INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_slack_day_headlines_channel_day
      ON slack_day_headlines(channel_id, day);

    CREATE TABLE IF NOT EXISTS slack_user_directory (
      slack_user_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      team_id TEXT,
      cached_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS slack_channel_directory (
      slack_channel_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      team_id TEXT,
      cached_at TEXT NOT NULL
    );
  `);

  // Key-value settings table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Add status column to todos (active/completed/dismissed) and backfill from completed boolean
  try {
    sqlite.exec(`ALTER TABLE todos ADD COLUMN status TEXT NOT NULL DEFAULT 'active'`);
    sqlite.exec(`UPDATE todos SET status = 'completed' WHERE completed = 1`);
  } catch {
    // Column already exists — expected on subsequent startups
  }

  // Notifications table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('slack_unread', 'mr_pipeline', 'mr_approval', 'todo_created')),
      title TEXT NOT NULL,
      detail TEXT,
      url TEXT,
      read INTEGER NOT NULL DEFAULT 0,
      meta TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_notifications_read_created
      ON notifications(read, created_at);
  `);

  // Drop slack_summaries and slack_day_headlines tables; rebuild slack_channels and slack_conversations
  const hasFocus = sqlite.prepare(`SELECT COUNT(*) as cnt FROM pragma_table_info('slack_channels') WHERE name = 'focus'`).get() as { cnt: number };
  if (hasFocus.cnt) {
    sqlite.exec(`
      DROP TABLE IF EXISTS slack_summaries;
      DROP TABLE IF EXISTS slack_day_headlines;

      CREATE TABLE slack_channels_new (
        id TEXT PRIMARY KEY,
        slack_channel_id TEXT NOT NULL,
        name TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        last_polled_at TEXT,
        team_id TEXT,
        sort_order INTEGER,
        created_at TEXT NOT NULL
      );
      INSERT INTO slack_channels_new (id, slack_channel_id, name, enabled, last_polled_at, team_id, sort_order, created_at)
        SELECT id, slack_channel_id, name, enabled, last_polled_at, team_id, sort_order, created_at FROM slack_channels;
      DROP TABLE slack_channels;
      ALTER TABLE slack_channels_new RENAME TO slack_channels;
    `);
  }

  const hasSummary = sqlite.prepare(`SELECT COUNT(*) as cnt FROM pragma_table_info('slack_conversations') WHERE name = 'summary'`).get() as { cnt: number };
  if (hasSummary.cnt) {
    sqlite.exec(`
      CREATE TABLE slack_conversations_new (
        id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL,
        channel_name TEXT NOT NULL,
        conversation_ts TEXT NOT NULL,
        day TEXT NOT NULL,
        messages TEXT NOT NULL DEFAULT '[]',
        mentions_me INTEGER NOT NULL DEFAULT 0,
        parent_text TEXT NOT NULL DEFAULT '',
        parent_user TEXT NOT NULL DEFAULT '',
        message_count INTEGER NOT NULL,
        first_message_at TEXT NOT NULL,
        last_message_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT INTO slack_conversations_new (id, channel_id, channel_name, conversation_ts, day, message_count, first_message_at, last_message_at, created_at, updated_at)
        SELECT id, channel_id, channel_name, conversation_ts, day, message_count, first_message_at, last_message_at, created_at, updated_at FROM slack_conversations;
      DROP TABLE slack_conversations;
      ALTER TABLE slack_conversations_new RENAME TO slack_conversations;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_slack_conversations_channel_ts
        ON slack_conversations(channel_id, conversation_ts);

      CREATE INDEX IF NOT EXISTS idx_slack_conversations_channel_day
        ON slack_conversations(channel_id, day);
    `);
  }

  console.log("[db] migrations applied");
}
