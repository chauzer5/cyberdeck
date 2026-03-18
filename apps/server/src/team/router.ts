import { z } from "zod";
import { router, publicProcedure } from "../trpc.js";
import { db } from "../db/index.js";
import { settings } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { listOrgMembers as listLinearMembers } from "../integrations/linear/client.js";
import { listGroupMembers as listGitLabMembers } from "../integrations/gitlab/client.js";
import { listOrgMembers as listGitHubMembers } from "../integrations/github/client.js";

export interface OrgPerson {
  name: string;
  email: string | null;
  sources: ("linear" | "gitlab" | "github")[];
}

async function isConfigured(key: string): Promise<boolean> {
  const row = await db.select().from(settings).where(eq(settings.key, key)).get();
  return !!row?.value;
}

export const teamRouter = router({
  /** List all org members across configured platforms, deduped by email */
  orgMembers: publicProcedure.query(async (): Promise<OrgPerson[]> => {
    const [linearOk, gitlabOk, githubOk] = await Promise.all([
      isConfigured("linear.apiKey"),
      isConfigured("gitlab.pat"),
      isConfigured("github.token"),
    ]);

    // email → OrgPerson (use email as dedup key, fall back to name for those without)
    const byEmail = new Map<string, OrgPerson>();
    const byNameOnly: OrgPerson[] = [];

    function addPerson(name: string, email: string | null, source: "linear" | "gitlab" | "github") {
      const key = email?.toLowerCase();
      if (key) {
        const existing = byEmail.get(key);
        if (existing) {
          if (!existing.sources.includes(source)) existing.sources.push(source);
          // prefer longer/more complete name
          if (name.length > existing.name.length) existing.name = name;
        } else {
          byEmail.set(key, { name, email, sources: [source] });
        }
      } else {
        // No email — check if name matches an existing entry
        const match = [...byEmail.values()].find(
          (p) => p.name.toLowerCase() === name.toLowerCase(),
        );
        if (match) {
          if (!match.sources.includes(source)) match.sources.push(source);
        } else {
          const nameMatch = byNameOnly.find(
            (p) => p.name.toLowerCase() === name.toLowerCase(),
          );
          if (nameMatch) {
            if (!nameMatch.sources.includes(source)) nameMatch.sources.push(source);
          } else {
            byNameOnly.push({ name, email: null, sources: [source] });
          }
        }
      }
    }

    const fetches = await Promise.allSettled([
      linearOk
        ? listLinearMembers().then((members) => {
            for (const m of members) addPerson(m.name, m.email, "linear");
          })
        : Promise.resolve(),
      gitlabOk
        ? listGitLabMembers().then((members) => {
            for (const m of members) addPerson(m.name, m.email ?? null, "gitlab");
          })
        : Promise.resolve(),
      githubOk
        ? listGitHubMembers().then((members) => {
            for (const m of members) addPerson(m.name ?? m.login, m.email, "github");
          })
        : Promise.resolve(),
    ]);

    for (const r of fetches) {
      if (r.status === "rejected") console.error("[team] provider error:", r.reason);
    }

    const all = [...byEmail.values(), ...byNameOnly];
    all.sort((a, b) => a.name.localeCompare(b.name));
    return all;
  }),

  /** Get stored team member names */
  members: publicProcedure.query(async (): Promise<string[]> => {
    const row = await db
      .select()
      .from(settings)
      .where(eq(settings.key, "team.members"))
      .get();
    if (!row?.value) return [];
    try {
      return JSON.parse(row.value);
    } catch {
      return [];
    }
  }),

  /** Save team member names */
  setMembers: publicProcedure
    .input(z.object({ names: z.array(z.string()) }))
    .mutation(async ({ input }) => {
      const now = new Date().toISOString();
      const value = JSON.stringify(input.names);
      const existing = await db
        .select()
        .from(settings)
        .where(eq(settings.key, "team.members"))
        .get();

      if (existing) {
        await db
          .update(settings)
          .set({ value, updatedAt: now })
          .where(eq(settings.key, "team.members"));
      } else {
        await db.insert(settings).values({
          key: "team.members",
          value,
          updatedAt: now,
        });
      }
      return input.names;
    }),
});
