import { z } from "zod";
import { eq } from "drizzle-orm";
import { router, publicProcedure } from "../trpc.js";
import { db } from "../db/index.js";
import { settings } from "../db/schema.js";

async function resolveUserName(): Promise<string> {
  // Try GitLab
  try {
    const pat = await db.select().from(settings).where(eq(settings.key, "gitlab.pat")).get();
    if (pat?.value) {
      const resp = await fetch("https://gitlab.com/api/v4/user", {
        headers: { "PRIVATE-TOKEN": pat.value },
      });
      if (resp.ok) {
        const user = await resp.json();
        if (user.name) return user.name;
      }
    }
  } catch { /* continue */ }

  // Try GitHub
  try {
    const token = await db.select().from(settings).where(eq(settings.key, "github.token")).get();
    if (token?.value) {
      const resp = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${token.value}`,
          Accept: "application/vnd.github+json",
        },
      });
      if (resp.ok) {
        const user = await resp.json();
        if (user.name) return user.name;
      }
    }
  } catch { /* continue */ }

  // Try Linear
  try {
    const apiKey = await db.select().from(settings).where(eq(settings.key, "linear.apiKey")).get();
    if (apiKey?.value) {
      const resp = await fetch("https://api.linear.app/graphql", {
        method: "POST",
        headers: {
          Authorization: apiKey.value,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: "{ viewer { name } }" }),
      });
      if (resp.ok) {
        const json = await resp.json();
        const name = json?.data?.viewer?.name;
        if (name) return name;
      }
    }
  } catch { /* continue */ }

  return "Unknown User";
}

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

  whoami: publicProcedure.query(async () => {
    return resolveUserName();
  }),
});
