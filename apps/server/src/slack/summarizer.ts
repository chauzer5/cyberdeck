import { spawn } from "node:child_process";
import * as path from "node:path";
import * as os from "node:os";
import type { SlackMessage } from "./client.js";

export interface SummaryBullet {
  text: string;
  messageTs?: string;
}

export interface SummaryResult {
  headline: string;
  summary: string;
  bullets: SummaryBullet[];
  todos: {
    title: string;
    description: string;
    priority: "low" | "medium" | "high";
    messageTs?: string;
  }[];
}

/**
 * Spawns `pi -p` (print mode, no tools, no session) and collects the full
 * text response. Returns the concatenated text_delta values.
 */
function runPi(prompt: string, model?: string | null): Promise<string> {
  return new Promise((resolve, reject) => {
    const cursorProviderExt = path.join(os.homedir(), ".pi", "agent", "extensions", "cursor-provider.ts");
    const args = ["--mode", "json", "-p", "--no-extensions", "-e", cursorProviderExt];
    if (model) {
      args.push("--model", model);
    }
    args.push(prompt);

    const proc = spawn("pi", args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });

    let buf = "";
    let text = "";

    proc.stdout?.setEncoding("utf-8");
    proc.stdout?.on("data", (chunk: string) => {
      buf += chunk;
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          if (
            event.type === "message_update" &&
            event.assistantMessageEvent?.type === "text_delta"
          ) {
            text += event.assistantMessageEvent.delta ?? "";
          }
        } catch {
          // Not JSON — ignore
        }
      }
    });

    let stderr = "";
    proc.stderr?.setEncoding("utf-8");
    proc.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });

    proc.on("close", (code) => {
      // Flush remaining buffer
      if (buf.trim()) {
        try {
          const event = JSON.parse(buf);
          if (
            event.type === "message_update" &&
            event.assistantMessageEvent?.type === "text_delta"
          ) {
            text += event.assistantMessageEvent.delta ?? "";
          }
        } catch {
          // ignore
        }
      }

      if (code !== 0 && !text) {
        reject(
          new Error(`pi exited with code ${code}: ${stderr.slice(0, 200)}`),
        );
      } else {
        resolve(text);
      }
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to spawn pi: ${err.message}`));
    });
  });
}

/** Group flat messages into conversations (threads). */
export function groupIntoConversations(messages: SlackMessage[]) {
  const threads = new Map<string, SlackMessage[]>();
  const order: string[] = [];

  for (const m of messages) {
    const key = m.threadTs ?? m.ts; // replies group under parent ts
    if (!threads.has(key)) {
      threads.set(key, []);
      order.push(key);
    }
    threads.get(key)!.push(m);
  }

  return order.map((ts) => ({ parentTs: ts, messages: threads.get(ts)! }));
}

export async function summarizeMessages(
  channelName: string,
  focus: string,
  ignore: string | null | undefined,
  messages: SlackMessage[],
  todoFocus?: string | null,
  context?: string | null,
  model?: string | null,
): Promise<SummaryResult> {
  const conversations = groupIntoConversations(messages);

  const conversationText = conversations
    .map((conv, i) => {
      const lines = conv.messages.map((m) =>
        m.threadTs ? `  ↳ [${m.user}]: ${m.text}` : `[${m.user}]: ${m.text}`,
      );
      return `--- Conversation ${i + 1} (ts=${conv.parentTs}) ---\n${lines.join("\n")}`;
    })
    .join("\n\n");

  const ignoreSection = ignore ? `\nIgnore (skip these topics): ${ignore}` : "";

  const todoInstruction = todoFocus
    ? `If there are actionable items matching this criteria: "${todoFocus}", include them as todos. If nothing matches, return an empty todos array.`
    : `If there are actionable items (bugs, tasks, decisions, requests), include them as todos. If nothing is actionable, return an empty todos array.`;

  const prompt = `Summarize this Slack channel activity. The messages are grouped into conversations (a top-level message and its thread replies). Focus on the user's topics of interest and skip anything in the ignore list.

Rules:
- Provide a short one-sentence headline
- Produce exactly ONE bullet per conversation. Each bullet should concisely summarize that conversation including its outcome or resolution if any replies exist.
- Set messageTs to the conversation's ts value (shown after each "Conversation N" header)
- Skip conversations that are off-topic or in the ignore list — do not produce a bullet for them
- ${todoInstruction}

Respond with ONLY a JSON object in this exact format, no other text:
{"headline": "...", "bullets": [{"text": "Summary of conversation", "messageTs": "1234567890.123456"}], "todos": [{"title": "...", "description": "...", "priority": "low|medium|high", "messageTs": "ts of most relevant conversation"}]}

Channel: ${channelName}${context ? `\nChannel context: ${context}` : ""}
Focus (highlight these topics): ${focus}${ignoreSection}

${conversationText}`;

  const raw = await runPi(prompt, model);

  // Extract JSON from the response (may be wrapped in markdown code fences)
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error("[slack] pi returned non-JSON response:", raw.slice(0, 200));
    return {
      headline: "",
      summary: raw.trim() || "Unable to generate summary.",
      bullets: [],
      todos: [],
    };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    const bullets: SummaryBullet[] = Array.isArray(parsed.bullets)
      ? parsed.bullets.map((b: { text?: string; messageTs?: string }) => ({
          text: b.text ?? "",
          messageTs: b.messageTs,
        }))
      : [];
    // Build plain-text summary for backward compat (headline display, etc.)
    const summary =
      bullets.length > 0
        ? bullets.map((b) => `- ${b.text}`).join("\n")
        : (parsed.summary ?? "Unable to generate summary.");
    return {
      headline: parsed.headline ?? "",
      summary,
      bullets,
      todos: Array.isArray(parsed.todos) ? parsed.todos : [],
    };
  } catch {
    console.error(
      "[slack] failed to parse pi JSON:",
      jsonMatch[0].slice(0, 200),
    );
    return {
      headline: "",
      summary: raw.trim() || "Unable to generate summary.",
      bullets: [],
      todos: [],
    };
  }
}

export interface ConversationSummaryResult {
  summary: string;
  todos: {
    title: string;
    description: string;
    priority: "low" | "medium" | "high";
    messageTs?: string;
  }[];
}

/**
 * Summarize a single conversation (thread) incrementally.
 */
export async function summarizeConversation(
  channelName: string,
  focus: string,
  ignore: string | null | undefined,
  messages: SlackMessage[],
  todoFocus?: string | null,
  context?: string | null,
  model?: string | null,
): Promise<ConversationSummaryResult> {
  const lines = messages.map((m) =>
    m.threadTs ? `  ↳ [${m.user}]: ${m.text}` : `[${m.user}]: ${m.text}`,
  );
  const conversationText = lines.join("\n");

  const ignoreSection = ignore ? `\nIgnore (skip these topics): ${ignore}` : "";

  const todoInstruction = todoFocus
    ? `If there are actionable items matching this criteria: "${todoFocus}", include them as todos.`
    : `If there are actionable items (bugs, tasks, decisions, requests), include them as todos.`;

  const prompt = `Summarize this single Slack conversation in one concise sentence. Focus on the user's topics of interest.

Rules:
- Return one sentence summarizing the conversation including its outcome or resolution
- If the conversation is off-topic or matches the ignore list, return summary as empty string ""
- ${todoInstruction} If nothing is actionable, return an empty todos array.

Respond with ONLY a JSON object:
{"summary": "...", "todos": [{"title": "...", "description": "...", "priority": "low|medium|high"}]}

Channel: ${channelName}${context ? `\nChannel context: ${context}` : ""}
Focus: ${focus}${ignoreSection}

${conversationText}`;

  const raw = await runPi(prompt, model);
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { summary: raw.trim() || "Unable to summarize.", todos: [] };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      summary: parsed.summary ?? "",
      todos: Array.isArray(parsed.todos) ? parsed.todos : [],
    };
  } catch {
    return { summary: raw.trim() || "Unable to summarize.", todos: [] };
  }
}

/**
 * Generate a one-line headline for a day's conversations in a channel.
 */
export async function generateDayHeadline(
  channelName: string,
  conversationSummaries: string[],
  model?: string | null,
): Promise<string> {
  if (conversationSummaries.length === 0) return "";
  if (conversationSummaries.length === 1) return conversationSummaries[0];

  const bulletList = conversationSummaries
    .map((s, i) => `${i + 1}. ${s}`)
    .join("\n");

  const prompt = `Write a single-sentence headline summarizing this day's activity in ${channelName}. Be concise and informative.

Conversations:
${bulletList}

Respond with ONLY the headline text, no quotes or JSON.`;

  const raw = await runPi(prompt, model);
  return raw.trim().replace(/^["']|["']$/g, "") || conversationSummaries[0];
}
