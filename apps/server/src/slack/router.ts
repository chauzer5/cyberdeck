import { z } from "zod";
import { eq, desc, and, asc, isNull, sql } from "drizzle-orm";
import { router, publicProcedure } from "../trpc.js";
import { db } from "../db/index.js";
import { slackChannels, slackSummaries, slackConversations, slackDayHeadlines } from "../db/schema.js";
import { resolveChannelId, getAuthStatus, resetSlackClients } from "./client.js";
import { pollAllChannels, pollSingleChannel } from "./poller.js";
import { getUnreadDmStats } from "./dm-poller.js";

export const slackRouter = router({
  auth: router({
    status: publicProcedure.query(() => {
      return getAuthStatus();
    }),

    refresh: publicProcedure.mutation(() => {
      resetSlackClients();
      return getAuthStatus();
    }),
  }),

  channels: router({
    list: publicProcedure.query(async () => {
      return db
        .select()
        .from(slackChannels)
        .orderBy(
          sql`CASE WHEN ${slackChannels.sortOrder} IS NULL THEN 1 ELSE 0 END`,
          asc(slackChannels.sortOrder),
          asc(slackChannels.createdAt),
        )
        .all();
    }),

    reorder: publicProcedure
      .input(z.array(z.object({ id: z.string(), sortOrder: z.number() })))
      .mutation(async ({ input }) => {
        for (const { id, sortOrder } of input) {
          await db
            .update(slackChannels)
            .set({ sortOrder })
            .where(eq(slackChannels.id, id));
        }
        return { ok: true };
      }),

    add: publicProcedure
      .input(
        z.object({
          name: z.string().min(1),
          slackChannelId: z.string().optional(),
          focus: z.string().min(1),
          ignore: z.string().optional(),
          teamId: z.string().optional(),
          todosEnabled: z.boolean().optional(),
          todoFocus: z.string().optional(),
          context: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        let channelId = input.slackChannelId;
        let channelName = input.name;

        // Resolve channel ID from name if not provided
        if (!channelId) {
          const resolved = await resolveChannelId(input.name, input.teamId);
          if (!resolved) throw new Error(`Channel "${input.name}" not found in Slack`);
          channelId = resolved.id;
          channelName = `#${resolved.name}`;
        }

        const id = crypto.randomUUID();
        await db.insert(slackChannels).values({
          id,
          slackChannelId: channelId,
          name: channelName,
          focus: input.focus,
          ignore: input.ignore ?? null,
          context: input.context ?? null,
          teamId: input.teamId ?? null,
          enabled: true,
          todosEnabled: input.todosEnabled ?? false,
          todoFocus: input.todoFocus ?? null,
          createdAt: new Date().toISOString(),
        });
        return { id };
      }),

    update: publicProcedure
      .input(
        z.object({
          id: z.string(),
          focus: z.string().optional(),
          ignore: z.string().optional(),
          enabled: z.boolean().optional(),
          todosEnabled: z.boolean().optional(),
          todoFocus: z.string().optional(),
          context: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const updates: Record<string, unknown> = {};
        if (input.focus !== undefined) updates.focus = input.focus;
        if (input.ignore !== undefined) updates.ignore = input.ignore;
        if (input.enabled !== undefined) updates.enabled = input.enabled;
        if (input.todosEnabled !== undefined) updates.todosEnabled = input.todosEnabled;
        if (input.todoFocus !== undefined) updates.todoFocus = input.todoFocus;
        if (input.context !== undefined) updates.context = input.context;

        await db
          .update(slackChannels)
          .set(updates)
          .where(eq(slackChannels.id, input.id));
        return { id: input.id };
      }),

    remove: publicProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        await db.delete(slackChannels).where(eq(slackChannels.id, input.id));
        return { id: input.id };
      }),
  }),

  summaries: router({
    list: publicProcedure
      .input(z.object({ channelId: z.string().optional() }).optional())
      .query(async ({ input }) => {
        if (input?.channelId) {
          return db
            .select()
            .from(slackSummaries)
            .where(eq(slackSummaries.channelId, input.channelId))
            .orderBy(desc(slackSummaries.createdAt))
            .limit(50)
            .all();
        }
        return db
          .select()
          .from(slackSummaries)
          .orderBy(desc(slackSummaries.createdAt))
          .limit(50)
          .all();
      }),

    latest: publicProcedure.query(async () => {
      // One latest summary per channel using a subquery approach
      const channels = await db.select().from(slackChannels).all();
      const results = [];

      for (const channel of channels) {
        const [summary] = await db
          .select()
          .from(slackSummaries)
          .where(eq(slackSummaries.channelId, channel.id))
          .orderBy(desc(slackSummaries.createdAt))
          .limit(1)
          .all();

        results.push({
          channel,
          summary: summary ?? null,
        });
      }

      return results;
    }),
  }),

  conversations: router({
    byDay: publicProcedure
      .input(
        z.object({
          channelId: z.string(),
          limit: z.number().optional(),
        })
      )
      .query(async ({ input }) => {
        const limit = input.limit ?? 14;

        // Get day headlines for this channel
        const headlines = await db
          .select()
          .from(slackDayHeadlines)
          .where(eq(slackDayHeadlines.channelId, input.channelId))
          .orderBy(desc(slackDayHeadlines.day))
          .limit(limit)
          .all();

        // Get conversations for these days
        const days = await Promise.all(
          headlines.map(async (h) => {
            const convs = await db
              .select()
              .from(slackConversations)
              .where(
                and(
                  eq(slackConversations.channelId, input.channelId),
                  eq(slackConversations.day, h.day),
                )
              )
              .orderBy(desc(slackConversations.lastMessageAt))
              .all();

            return {
              day: h.day,
              headline: h.headline,
              conversationCount: h.conversationCount,
              conversations: convs,
            };
          })
        );

        return { days };
      }),

    latest: publicProcedure.query(async () => {
      const channels = await db
        .select()
        .from(slackChannels)
        .where(eq(slackChannels.enabled, true))
        .orderBy(
          sql`CASE WHEN ${slackChannels.sortOrder} IS NULL THEN 1 ELSE 0 END`,
          asc(slackChannels.sortOrder),
          asc(slackChannels.createdAt),
        )
        .all();
      const results = [];

      for (const channel of channels) {
        const [dayHeadline] = await db
          .select()
          .from(slackDayHeadlines)
          .where(eq(slackDayHeadlines.channelId, channel.id))
          .orderBy(desc(slackDayHeadlines.day))
          .limit(1)
          .all();

        results.push({
          channel,
          dayHeadline: dayHeadline ?? null,
        });
      }

      return results;
    }),
  }),

  unreadDms: publicProcedure.query(() => {
    return getUnreadDmStats();
  }),

  pollNow: publicProcedure.mutation(() => {
    pollAllChannels().catch((err) =>
      console.error("[slack] background poll error:", err)
    );
    return { ok: true };
  }),

  pollChannel: publicProcedure
    .input(z.object({ channelId: z.string() }))
    .mutation(({ input }) => {
      pollSingleChannel(input.channelId).catch((err) =>
        console.error("[slack] background channel poll error:", err)
      );
      return { ok: true };
    }),
});
