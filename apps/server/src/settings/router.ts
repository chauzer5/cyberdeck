import { z } from "zod";
import { eq } from "drizzle-orm";
import { router, publicProcedure } from "../trpc.js";
import { db } from "../db/index.js";
import { settings } from "../db/schema.js";

export const settingsRouter = router({
  get: publicProcedure
    .input(z.object({ key: z.string() }))
    .query(async ({ input }) => {
      const row = await db
        .select()
        .from(settings)
        .where(eq(settings.key, input.key))
        .get();
      return row?.value ?? null;
    }),

  getMany: publicProcedure
    .input(z.object({ keys: z.array(z.string()) }))
    .query(async ({ input }) => {
      const rows = await db.select().from(settings).all();
      const map: Record<string, string> = {};
      for (const row of rows) {
        if (input.keys.includes(row.key)) {
          map[row.key] = row.value;
        }
      }
      return map;
    }),

  set: publicProcedure
    .input(z.object({ key: z.string(), value: z.string() }))
    .mutation(async ({ input }) => {
      const now = new Date().toISOString();
      const existing = await db
        .select()
        .from(settings)
        .where(eq(settings.key, input.key))
        .get();

      if (existing) {
        await db
          .update(settings)
          .set({ value: input.value, updatedAt: now })
          .where(eq(settings.key, input.key));
      } else {
        await db.insert(settings).values({
          key: input.key,
          value: input.value,
          updatedAt: now,
        });
      }

      return { key: input.key, value: input.value };
    }),
});
