import { z } from "zod";
import { desc, eq, sql } from "drizzle-orm";
import { router, publicProcedure } from "../trpc.js";
import { db } from "../db/index.js";
import { notifications } from "../db/schema.js";

export const notificationsRouter = router({
  list: publicProcedure
    .input(z.object({ limit: z.number().optional().default(50) }).optional())
    .query(async ({ input }) => {
      return db
        .select()
        .from(notifications)
        .orderBy(desc(notifications.createdAt))
        .limit(input?.limit ?? 50)
        .all();
    }),

  unreadCount: publicProcedure.query(async () => {
    const rows = await db
      .select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(eq(notifications.read, false));
    return rows[0]?.count ?? 0;
  }),

  markRead: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      await db
        .update(notifications)
        .set({ read: true })
        .where(eq(notifications.id, input.id));
      return { id: input.id };
    }),

  markAllRead: publicProcedure.mutation(async () => {
    await db
      .update(notifications)
      .set({ read: true })
      .where(eq(notifications.read, false));
    return { ok: true };
  }),
});
