import { create } from "zustand";

interface OutputEntry {
  stream: "stdout" | "stderr" | "user";
  data: string;
  timestamp: string;
}

const OUTPUT_MAX = 1000;

interface AgentsState {
  selectedAgentId: string | null;
  outputs: Record<string, OutputEntry[]>;
  /** Tracks which agents have had their history loaded from the server */
  caughtUp: Record<string, boolean>;
  setSelectedAgentId: (id: string | null) => void;
  appendOutput: (agentId: string, stream: "stdout" | "stderr" | "user", data: string) => void;
  setOutputHistory: (agentId: string, lines: OutputEntry[]) => void;
}

export const useAgentsStore = create<AgentsState>((set) => ({
  selectedAgentId: null,
  outputs: {},
  caughtUp: {},

  setSelectedAgentId: (id) => set({ selectedAgentId: id }),

  appendOutput: (agentId, stream, data) =>
    set((s) => {
      const existing = s.outputs[agentId] ?? [];

      // If we haven't caught up yet (getOutput still in flight),
      // skip WS events — they'll be in the catchup response.
      // User messages bypass this guard (they're local, not from WS).
      if (stream !== "user" && !s.caughtUp[agentId] && existing.length === 0) return s;

      const now = new Date().toISOString();
      const next = [...existing, { stream, data, timestamp: now }];
      if (next.length > OUTPUT_MAX) {
        next.splice(0, next.length - OUTPUT_MAX);
      }

      // A user message for a new agent means we just created it —
      // mark as caught up so subsequent WS events flow through.
      const caughtUp = stream === "user" && !s.caughtUp[agentId]
        ? { ...s.caughtUp, [agentId]: true }
        : s.caughtUp;

      return { outputs: { ...s.outputs, [agentId]: next }, caughtUp };
    }),

  setOutputHistory: (agentId, lines) =>
    set((s) => ({
      outputs: { ...s.outputs, [agentId]: lines.slice(-OUTPUT_MAX) },
      caughtUp: { ...s.caughtUp, [agentId]: true },
    })),
}));
