import { z } from "zod";
import { eq, asc } from "drizzle-orm";
import { router, publicProcedure } from "../trpc.js";
import { db } from "../db/index.js";
import { todos } from "../db/schema.js";

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

const statusEnum = z.enum(["active", "completed", "dismissed"]);

export const todosRouter = router({
  /** Dashboard list: active todos only */
  list: publicProcedure.query(async () => {
    return db
      .select()
      .from(todos)
      .where(eq(todos.status, "active"))
      .orderBy(asc(todos.createdAt))
      .all();
  }),

  /** Full list with all three buckets */
  listAll: publicProcedure
    .input(
      z.object({
        tab: statusEnum.optional().default("active"),
      }).optional()
    )
    .query(async ({ input }) => {
      const rows = await db
        .select()
        .from(todos)
        .orderBy(asc(todos.createdAt))
        .all();

      const active = rows.filter((t) => t.status === "active");
      const completed = rows.filter((t) => t.status === "completed");
      const dismissed = rows.filter((t) => t.status === "dismissed");

      // Sort active by priority (high → medium → low → none), then createdAt
      active.sort((a, b) => {
        const pa = a.priority ? (PRIORITY_ORDER[a.priority] ?? 3) : 3;
        const pb = b.priority ? (PRIORITY_ORDER[b.priority] ?? 3) : 3;
        if (pa !== pb) return pa - pb;
        return a.createdAt.localeCompare(b.createdAt);
      });

      // Sort completed & dismissed newest first
      completed.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      dismissed.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

      return {
        active,
        completed,
        dismissed,
        counts: {
          active: active.length,
          completed: completed.length,
          dismissed: dismissed.length,
        },
      };
    }),

  create: publicProcedure
    .input(
      z.object({
        title: z.string().min(1),
        source: z.string().default("manual"),
        description: z.string().optional(),
        priority: z.enum(["low", "medium", "high"]).optional(),
        dueDate: z.string().optional(),
        url: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const now = new Date().toISOString();
      const id = crypto.randomUUID();
      await db.insert(todos).values({
        id,
        ...input,
        completed: false,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      return { id };
    }),

  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1).optional(),
        description: z.string().optional(),
        priority: z.enum(["low", "medium", "high"]).nullable().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...fields } = input;
      const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      if (fields.title !== undefined) updates.title = fields.title;
      if (fields.description !== undefined) updates.description = fields.description;
      if ("priority" in fields) updates.priority = fields.priority;
      await db.update(todos).set(updates).where(eq(todos.id, id));
      return { id };
    }),

  /** Set a todo's status (active, completed, or dismissed) */
  setStatus: publicProcedure
    .input(z.object({ id: z.string(), status: statusEnum }))
    .mutation(async ({ input }) => {
      const now = new Date().toISOString();
      await db
        .update(todos)
        .set({
          status: input.status,
          completed: input.status === "completed",
          updatedAt: now,
        })
        .where(eq(todos.id, input.id));
      return { id: input.id, status: input.status };
    }),

  /**
   * Legacy toggle — kept for backward compat, maps to setStatus.
   * Toggles between active ↔ completed.
   */
  toggle: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const [todo] = await db
        .select()
        .from(todos)
        .where(eq(todos.id, input.id));
      if (!todo) throw new Error("Todo not found");
      const newStatus = todo.status === "active" ? "completed" : "active";
      const now = new Date().toISOString();
      await db
        .update(todos)
        .set({
          status: newStatus,
          completed: newStatus === "completed",
          updatedAt: now,
        })
        .where(eq(todos.id, input.id));
      return { id: input.id, completed: newStatus === "completed" };
    }),
});
