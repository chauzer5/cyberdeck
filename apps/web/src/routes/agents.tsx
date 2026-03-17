import { createRoute, useNavigate } from "@tanstack/react-router";
import { rootRoute } from "./__root";
import { useState, useEffect, useRef, useCallback } from "react";
import { Monitor, Pencil, Send, Square, TerminalSquare } from "lucide-react";
import { trpc } from "@/trpc";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useAgentsStore } from "@/stores/agents";
import { cn } from "@/lib/utils";
import { XTerm, type XTermHandle } from "@/components/XTerm";

const PROMPT = "\x1b[1;32m> \x1b[0m";

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function shortModel(model: string): string {
  const name = model.split("/").pop() ?? model;
  return name.replace(/-\d{8}$/, "");
}

function AgentsPage() {
  const navigate = useNavigate();
  const search = agentsRoute.useSearch();
  const selectedId = search.id ?? null;

  const { outputs, caughtUp, appendOutput, setOutputHistory } =
    useAgentsStore();
  const xtermRef = useRef<XTermHandle>(null);
  const writtenCountRef = useRef<{ agentId: string | null; count: number }>({
    agentId: null,
    count: 0,
  });

  const agents = trpc.agents.list.useQuery(undefined, {
    refetchInterval: 5000,
  });

  const [tab, setTab] = useState<"agents" | "history">("agents");
  const [spawnInput, setSpawnInput] = useState("");
  const [selectedMode, setSelectedMode] = useState("");  // "" | "team:<name>" | "workflow:<name>"
  const [selectedModel, setSelectedModel] = useState("");

  // Track agents that have finished and are waiting for the user to view output
  const [pendingAgents, setPendingAgents] = useState<Set<string>>(new Set());

  // Editable agent name
  const [editingName, setEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();

  const teamsQuery = trpc.agents.listTeams.useQuery();
  const workflowsQuery = trpc.agents.workflows.list.useQuery();
  const modelsQuery = trpc.agents.listModels.useQuery();

  const sessionsQuery = trpc.agents.listSessions.useQuery(
    { limit: 100 },
    { enabled: tab === "history" },
  );

  const resumeMutation = trpc.agents.resumeSession.useMutation({
    onSuccess: (agent) => {
      utils.agents.list.invalidate();
      setTab("agents");
      navigate({ search: { id: agent.id } });
    },
  });

  const renameMutation = trpc.agents.rename.useMutation({
    onSuccess: () => {
      utils.agents.list.invalidate();
    },
  });

  const spawnAgent = trpc.agents.spawn.useMutation({
    onSuccess: (agent) => {
      utils.agents.list.invalidate();
      setSpawnInput("");
      setSelectedMode("");
      setSelectedModel("");
      setTab("agents");
      navigate({ to: "/agents", search: { id: agent.id } });
    },
  });

  const handleSpawn = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = spawnInput.trim();
    if (!trimmed || spawnAgent.isPending) return;

    const isTeam = selectedMode.startsWith("team:");
    const isWorkflow = selectedMode.startsWith("workflow:");
    const modeName = selectedMode.split(":").slice(1).join(":");

    spawnAgent.mutate({
      prompt: trimmed,
      team: isTeam ? modeName : undefined,
      workflow: isWorkflow ? modeName : undefined,
      model: selectedModel || undefined,
    });
  };

  const selectedAgent = agents.data?.find((a) => a.id === selectedId);
  const isPty = selectedAgent?.mode === "pty";

  // Show running agents + finished-but-unseen (pending) agents + currently selected
  const visibleAgents =
    agents.data?.filter(
      (a) => a.status === "running" || pendingAgents.has(a.id) || a.id === selectedId,
    ) ?? [];

  // Reset name editing when switching agents
  useEffect(() => {
    setEditingName(false);
  }, [selectedId]);

  // Keep isPty in a ref so the WS callback always has the latest value
  const isPtyRef = useRef(isPty);
  isPtyRef.current = isPty;
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;

  // One-shot catchup: only fetch if store has no data for this agent yet
  const needsCatchup = !!selectedId && !caughtUp[selectedId];
  const outputQuery = trpc.agents.getOutput.useQuery(
    { id: selectedId! },
    { enabled: needsCatchup, staleTime: Infinity },
  );

  useEffect(() => {
    if (outputQuery.data && selectedId && needsCatchup) {
      setOutputHistory(selectedId, outputQuery.data);
    }
  }, [outputQuery.data, selectedId, needsCatchup, setOutputHistory]);

  // Clean up pendingAgents for agents that no longer exist on the server
  useEffect(() => {
    if (!agents.data) return;
    const serverIds = new Set(agents.data.map((a) => a.id));
    setPendingAgents((prev) => {
      const next = new Set<string>();
      for (const id of prev) {
        if (serverIds.has(id)) next.add(id);
      }
      if (next.size === prev.size) return prev; // no change, avoid re-render
      return next;
    });
  }, [agents.data]);

  // WS event handler
  // For PTY agents: write directly to xterm (bypasses React render cycle)
  // For all agents: update the store (for catchup replay on agent switch)
  const onWsEvent = useCallback(
    (event: { type: string; agentId?: string; data?: string }) => {
      if (
        (event.type === "agent:stdout" || event.type === "agent:stderr") &&
        event.agentId &&
        event.data
      ) {
        const stream = event.type === "agent:stdout" ? "stdout" : "stderr";

        // PTY mode: write directly to xterm — no React batching overhead
        // This preserves escape sequence ordering for TUI apps (Pi, Claude, etc.)
        if (
          isPtyRef.current &&
          event.agentId === selectedIdRef.current
        ) {
          xtermRef.current?.write(event.data);
        }

        // Always update the store (used for catchup replay on agent switch)
        appendOutput(event.agentId, stream, event.data);
      }
      // Only show turn_end prompt for structured agents
      if (event.type === "agent:turn_end" && event.agentId === selectedIdRef.current) {
        if (!isPtyRef.current) {
          xtermRef.current?.write(`\r\n${PROMPT}`);
        }
      }
      // Agent finished — mark as pending if user isn't currently viewing it
      if (event.type === "agent:exit" && event.agentId) {
        if (selectedIdRef.current !== event.agentId) {
          setPendingAgents((prev) => new Set(prev).add(event.agentId!));
        }
      }
    },
    [appendOutput],
  );

  const { send } = useWebSocket(onWsEvent);

  const stopMutation = trpc.agents.stop.useMutation({
    onSuccess: () => utils.agents.list.invalidate(),
  });

  // Write output entries to xterm — only write new entries since last sync
  // For PTY agents: only runs on full replay (agent switch/catchup).
  //   Live output is written directly by the WS handler above.
  // For structured agents: runs on every new entry (incremental).
  const currentOutput = selectedId ? (outputs[selectedId] ?? []) : [];
  useEffect(() => {
    const xterm = xtermRef.current;
    if (!xterm || !selectedId) return;

    const tracked = writtenCountRef.current;
    // Full replay when: agent changed, OR we rendered empty and now have data
    // (the latter handles HTTP catchup arriving after initial empty render)
    const isFullReplay =
      tracked.agentId !== selectedId ||
      (tracked.count === 0 && currentOutput.length > 0);

    // Agent changed or catchup arrived — reset terminal and replay all from store
    if (isFullReplay) {
      xterm.clear();
      xterm.terminal?.reset();
      lineBufferRef.current = "";
      tracked.agentId = selectedId;
      tracked.count = 0;

      // Replay all stored entries
      for (let i = 0; i < currentOutput.length; i++) {
        const entry = currentOutput[i];
        if (entry.stream === "user" && !isPty) {
          // Structured catchup — render user messages as green prompt lines
          xterm.write(`\x1b[1;32m> \x1b[0m${entry.data}\r\n`);
        } else {
          xterm.write(entry.data);
        }
      }
      tracked.count = currentOutput.length;

      // Show the input prompt after structured catchup replay
      if (currentOutput.length > 0 && selectedAgent?.status === "running" && !isPty) {
        xterm.write(`\r\n${PROMPT}`);
      }
      return;
    }

    // Incremental updates
    if (isPty) {
      // PTY: live data was already written directly by WS handler.
      // Just keep the counter in sync for the next agent switch.
      tracked.count = currentOutput.length;
    } else {
      // Structured: write new entries from store
      for (let i = tracked.count; i < currentOutput.length; i++) {
        const entry = currentOutput[i];
        if (entry.stream === "user") {
          // Live user entries are already visible from local keystroke echo
        } else {
          xterm.write(entry.data);
        }
      }
      tracked.count = currentOutput.length;
    }
  }, [currentOutput, selectedId, selectedAgent?.status, isPty]);

  // Line buffer for local editing — server expects complete messages, not raw keystrokes
  const lineBufferRef = useRef("");

  // Debounced resize for PTY agents
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleResize = useCallback(
    (cols: number, rows: number) => {
      if (!selectedId || !isPty) return;
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
      resizeTimerRef.current = setTimeout(() => {
        send({ type: "agent:resize", agentId: selectedId, cols, rows });
      }, 100);
    },
    [selectedId, isPty, send],
  );

  const handleXTermData = useCallback(
    (data: string) => {
      if (!selectedId) return;

      // PTY mode: send raw keystrokes directly — PTY handles echo/editing
      if (isPty) {
        send({ type: "agent:stdin", agentId: selectedId, data });
        return;
      }

      // Structured mode: local line-editing
      const xterm = xtermRef.current;
      if (!xterm) return;

      for (const ch of data) {
        if (ch === "\r") {
          // Enter — send the buffered line
          const line = lineBufferRef.current;
          lineBufferRef.current = "";
          xterm.write("\r\n");
          if (line.trim()) {
            appendOutput(selectedId, "user", line.trim());
            send({ type: "agent:stdin", agentId: selectedId, data: line });
          } else {
            // Empty enter — re-show prompt
            xterm.write(PROMPT);
          }
        } else if (ch === "\x7f" || ch === "\b") {
          // Backspace / Delete
          if (lineBufferRef.current.length > 0) {
            lineBufferRef.current = lineBufferRef.current.slice(0, -1);
            // Move cursor back, overwrite with space, move back again
            xterm.write("\b \b");
          }
        } else if (ch === "\x03") {
          // Ctrl-C — clear current line
          lineBufferRef.current = "";
          xterm.write(`^C\r\n${PROMPT}`);
        } else if (ch >= " ") {
          // Printable character — echo and buffer
          lineBufferRef.current += ch;
          xterm.write(ch);
        }
      }
    },
    [selectedId, isPty, send, appendOutput],
  );

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <h1 className="font-display text-lg font-bold tracking-[2px] uppercase text-cream">
            Agents
          </h1>
          <p className="mt-0.5 text-xs text-text-muted">
            Manage and interact with Pi agents
          </p>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel — agent list + session history */}
        <div className="flex w-64 shrink-0 flex-col border-r border-border">
          {/* Tab toggle */}
          <div className="flex border-b border-border shrink-0">
            <button
              onClick={() => setTab("agents")}
              className={cn(
                "flex-1 px-3 py-2 text-xs font-semibold uppercase tracking-widest transition-colors",
                tab === "agents"
                  ? "text-neon-pink border-b-2 border-neon-pink"
                  : "text-text-muted hover:text-text-secondary",
              )}
            >
              Agents
            </button>
            <button
              onClick={() => setTab("history")}
              className={cn(
                "flex-1 px-3 py-2 text-xs font-semibold uppercase tracking-widest transition-colors",
                tab === "history"
                  ? "text-neon-pink border-b-2 border-neon-pink"
                  : "text-text-muted hover:text-text-secondary",
              )}
            >
              History
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {tab === "agents" ? (
              <div className="space-y-1 p-2">
                {visibleAgents.map((agent, i) => (
                  <button
                    key={agent.id}
                    onClick={() => {
                      if (pendingAgents.has(agent.id)) {
                        setPendingAgents((prev) => {
                          const next = new Set(prev);
                          next.delete(agent.id);
                          return next;
                        });
                      }
                      navigate({ to: "/agents", search: { id: agent.id } });
                    }}
                    className={cn(
                      `animate-glass-in stagger-${Math.min(i + 1, 5)} flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-all`,
                      selectedId === agent.id
                        ? "bg-sidebar-accent text-cream shadow-[inset_0_0_0_1px_rgba(255,45,123,0.12)]"
                        : "text-text-secondary hover:bg-[rgba(255,45,123,0.04)]",
                    )}
                  >
                    <div
                      className={cn(
                        "h-2 w-2 shrink-0 rounded-full",
                        pendingAgents.has(agent.id)
                          ? "bg-amber-400 animate-glow-pulse"
                          : "bg-neon-cyan",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 truncate text-xs font-semibold">
                        {agent.name}
                        {agent.mode === "pty" && (
                          <TerminalSquare className="h-3 w-3 text-text-muted" />
                        )}
                      </div>
                    </div>
                  </button>
                ))}
                {visibleAgents.length === 0 && (
                  <p className="px-3 py-4 text-xs text-text-muted">
                    No agents running.
                  </p>
                )}
              </div>
            ) : sessionsQuery.isLoading ? (
              <div className="px-3 py-4 text-xs text-text-muted">
                Loading sessions…
              </div>
            ) : !sessionsQuery.data?.length ? (
              <div className="px-3 py-4 text-xs text-text-muted">
                No sessions found.
              </div>
            ) : (
              sessionsQuery.data.map((session, i) => (
                <button
                  key={session.id}
                  onClick={() => {
                    resumeMutation.mutate({
                      sessionPath: session.path,
                      name:
                        session.name ||
                        session.firstMessage.slice(0, 30) ||
                        "resumed",
                    });
                  }}
                  disabled={resumeMutation.isPending}
                  className={cn(
                    `animate-glass-in stagger-${Math.min(i + 1, 5)} w-full text-left px-3 py-2.5 border-b border-border/50 hover:bg-[rgba(255,45,123,0.04)] transition-colors disabled:opacity-50`
                  )}
                >
                  <div className="text-xs font-semibold text-cream truncate">
                    {session.name || session.firstMessage || "Untitled session"}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 text-[11px] text-text-muted">
                    <span>{timeAgo(session.modified)}</span>
                    <span>·</span>
                    <span>{session.messageCount} msgs</span>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Spawn controls — pinned to bottom of sidebar */}
          <div className="shrink-0 border-t border-border p-2">
            <form onSubmit={handleSpawn} className="space-y-1.5">
              {/* Agent mode select */}
              {((teamsQuery.data?.length ?? 0) > 0 || (workflowsQuery.data?.length ?? 0) > 0) && (
                <select
                  value={selectedMode}
                  onChange={(e) => setSelectedMode(e.target.value)}
                  className="w-full rounded-lg border border-border bg-[rgba(0,0,0,0.3)] px-2 py-1.5 font-mono text-[11px] text-cream focus:border-neon-pink/30 focus:outline-none"
                >
                  <option value="">Solo agent</option>
                  {teamsQuery.data && teamsQuery.data.length > 0 && (
                    <optgroup label="Teams">
                      {teamsQuery.data.map((team) => (
                        <option key={`team:${team.name}`} value={`team:${team.name}`}>
                          {team.name} ({team.members.length})
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {workflowsQuery.data && workflowsQuery.data.length > 0 && (
                    <optgroup label="Workflows">
                      {workflowsQuery.data.map((wf) => (
                        <option key={`workflow:${wf.name}`} value={`workflow:${wf.name}`}>
                          {wf.name} ({wf.steps.length} steps)
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              )}

              {/* Model select */}
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full rounded-lg border border-border bg-[rgba(0,0,0,0.3)] px-2 py-1.5 font-mono text-[11px] text-cream focus:border-neon-pink/30 focus:outline-none"
              >
                <option value="">Default model</option>
                {modelsQuery.data?.map((provider) => (
                  <optgroup key={provider.provider} label={provider.provider}>
                    {provider.models.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>

              {/* Prompt row */}
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={spawnInput}
                  onChange={(e) => setSpawnInput(e.target.value)}
                  placeholder="Enter a prompt…"
                  className="flex-1 min-w-0 rounded-lg border border-border bg-[rgba(0,0,0,0.3)] px-2 py-1.5 font-mono text-[11px] text-cream placeholder:text-text-muted focus:border-neon-pink/30 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!spawnInput.trim() || spawnAgent.isPending}
                  className="flex items-center gap-1 rounded-lg border border-[rgba(255,45,123,0.2)] bg-neon-pink-dark px-2.5 py-1.5 text-[11px] font-medium text-neon-pink-bright shadow-[0_2px_8px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.06)] transition-all hover:bg-neon-pink disabled:opacity-50"
                >
                  <Send className="h-3 w-3" />
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Main area — terminal */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {selectedAgent ? (
            <>
              {/* Terminal header */}
              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <Monitor className="h-4 w-4 text-neon-pink" />
                  {editingName ? (
                    <form
                      className="flex items-center gap-1"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const trimmed = editNameValue.trim();
                        if (trimmed && trimmed !== selectedAgent.name) {
                          renameMutation.mutate({ id: selectedAgent.id, name: trimmed });
                        }
                        setEditingName(false);
                      }}
                    >
                      <input
                        ref={nameInputRef}
                        type="text"
                        value={editNameValue}
                        onChange={(e) => setEditNameValue(e.target.value)}
                        onBlur={() => {
                          const trimmed = editNameValue.trim();
                          if (trimmed && trimmed !== selectedAgent.name) {
                            renameMutation.mutate({ id: selectedAgent.id, name: trimmed });
                          }
                          setEditingName(false);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            setEditingName(false);
                          }
                        }}
                        className="rounded border border-neon-pink/30 bg-[rgba(0,0,0,0.3)] px-2 py-0.5 text-sm font-semibold text-cream focus:outline-none"
                      />
                    </form>
                  ) : (
                    <button
                      className="group flex items-center gap-1.5 text-sm font-semibold text-cream hover:text-neon-pink-bright transition-colors"
                      onClick={() => {
                        setEditNameValue(selectedAgent.name);
                        setEditingName(true);
                        setTimeout(() => nameInputRef.current?.focus(), 0);
                      }}
                    >
                      <span>{selectedAgent.name}</span>
                      <Pencil className="h-3 w-3 text-text-muted opacity-0 transition-opacity group-hover:opacity-100" />
                    </button>
                  )}
                  {isPty && (
                    <span className="rounded-full bg-[rgba(59,130,246,0.12)] px-2 py-0.5 text-[10px] font-semibold text-blue-400">
                      PTY
                    </span>
                  )}
                </div>
                {selectedAgent.status === "running" && (
                  <button
                    onClick={() =>
                      stopMutation.mutate({ id: selectedAgent.id })
                    }
                    disabled={stopMutation.isPending}
                    className="flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 transition-all hover:bg-red-500/20 disabled:opacity-50"
                  >
                    <Square className="h-3 w-3" />
                    Stop
                  </button>
                )}
              </div>

              {/* Terminal */}
              <div className="flex-1 overflow-hidden bg-[rgba(0,0,0,0.3)] p-1">
                <XTerm
                  ref={xtermRef}
                  onData={handleXTermData}
                  onResize={handleResize}
                  convertEol={!isPty}
                  disabled={selectedAgent.status !== "running"}
                />
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center">
                <Monitor className="mx-auto h-12 w-12 text-text-muted opacity-40" />
                <p className="mt-3 text-sm text-text-muted">
                  Select an agent to view its terminal
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export const agentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/agents",
  component: AgentsPage,
  validateSearch: (search: Record<string, unknown>) => ({
    id: (search.id as string) ?? undefined,
  }),
});
