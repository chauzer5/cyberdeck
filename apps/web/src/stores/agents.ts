import { create } from "zustand";

interface AgentsState {
  selectedAgentId: string | null;
  /** In-progress streaming text per agent (not yet persisted to DB) */
  streamingText: Record<string, string>;

  setSelectedAgentId: (id: string | null) => void;
  appendStreamingText: (agentId: string, text: string) => void;
  clearStreamingText: (agentId: string) => void;
}

export const useAgentsStore = create<AgentsState>((set) => ({
  selectedAgentId: null,
  streamingText: {},

  setSelectedAgentId: (id) => set({ selectedAgentId: id }),

  appendStreamingText: (agentId, text) =>
    set((s) => ({
      streamingText: {
        ...s.streamingText,
        [agentId]: (s.streamingText[agentId] || "") + text,
      },
    })),

  clearStreamingText: (agentId) =>
    set((s) => {
      const next = { ...s.streamingText };
      delete next[agentId];
      return { streamingText: next };
    }),
}));
