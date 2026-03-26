import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Search, X } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { trpc } from "@/trpc";
import { useSlackEnabled } from "@/hooks/useSlackEnabled";
import { useSourceControlEnabled } from "@/hooks/useSourceControlEnabled";
import { useLinearEnabled } from "@/hooks/useLinearEnabled";
import { useAgentsEnabled } from "@/hooks/useAgentsEnabled";
import { useTodosEnabled } from "@/hooks/useTodosEnabled";
import { useAgentsStore } from "@/stores/agents";
import { cn } from "@/lib/utils";
import {
  search,
  CATEGORY_LABELS,
  type SearchResult,
  type SearchSources,
  type SearchCategory,
} from "./search";

interface CommandBarProps {
  onClose: () => void;
}

export function CommandBar({ onClose }: CommandBarProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const setSelectedAgentId = useAgentsStore((s) => s.setSelectedAgentId);

  // Data sources — share cache with rest of app
  const { enabled: scEnabled } = useSourceControlEnabled();
  const { enabled: linearEnabled } = useLinearEnabled();
  const { enabled: slackEnabled } = useSlackEnabled();
  const { enabled: agentsEnabled } = useAgentsEnabled();
  const { enabled: todosEnabled } = useTodosEnabled();

  const prsQuery = trpc.sourceControl.pullRequests.useQuery(undefined, {
    enabled: scEnabled,
    staleTime: 60_000,
  });
  const issuesQuery = trpc.linear.issues.useQuery(undefined, {
    enabled: linearEnabled,
    staleTime: 60_000,
  });
  const slackQuery = trpc.slack.threads.latest.useQuery(undefined, {
    enabled: slackEnabled,
    staleTime: 60_000,
  });
  const agentsQuery = trpc.agents.list.useQuery(undefined, {
    enabled: agentsEnabled,
    staleTime: 5_000,
  });
  const todosQuery = trpc.todos.list.useQuery(undefined, {
    enabled: todosEnabled,
    staleTime: 15_000,
  });

  const sources: SearchSources = useMemo(
    () => ({
      pullRequests: scEnabled ? (prsQuery.data as SearchSources["pullRequests"]) : undefined,
      issues: linearEnabled ? (issuesQuery.data as SearchSources["issues"]) : undefined,
      slackThreads: slackEnabled ? (slackQuery.data as SearchSources["slackThreads"]) : undefined,
      agents: agentsEnabled ? (agentsQuery.data as SearchSources["agents"]) : undefined,
      todos: todosEnabled ? (todosQuery.data as SearchSources["todos"]) : undefined,
    }),
    [
      scEnabled, prsQuery.data,
      linearEnabled, issuesQuery.data,
      slackEnabled, slackQuery.data,
      agentsEnabled, agentsQuery.data,
      todosEnabled, todosQuery.data,
    ],
  );

  const results = useMemo(() => search(query, sources), [query, sources]);

  // Reset active index when results change
  useEffect(() => {
    setActiveIndex(0);
  }, [results.length, query]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const executeResult = useCallback(
    (result: SearchResult) => {
      if (result.action.type === "navigate") {
        if (result.action.agentId) {
          setSelectedAgentId(result.action.agentId);
        }
        navigate({ to: result.action.to });
      } else {
        window.open(result.action.url, "_blank");
      }
      onClose();
    },
    [navigate, onClose, setSelectedAgentId],
  );

  function handleKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % Math.max(results.length, 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + results.length) % Math.max(results.length, 1));
        break;
      case "Enter":
        e.preventDefault();
        if (results[activeIndex]) {
          executeResult(results[activeIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        onClose();
        break;
    }
  }

  // Group results by category for rendering
  const grouped = useMemo(() => {
    const map = new Map<SearchCategory, SearchResult[]>();
    for (const r of results) {
      if (!map.has(r.category)) map.set(r.category, []);
      map.get(r.category)!.push(r);
    }
    return map;
  }, [results]);

  // Build flat index mapping for keyboard nav
  let flatIndex = 0;

  return (
    <div className="fixed inset-0 z-50" onKeyDown={handleKeyDown}>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/5 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative z-10 mx-auto mt-[20vh] w-full max-w-xl px-4">
        <div className="rounded-xl border border-border bg-popover shadow-2xl shadow-neon-pink/5 overflow-hidden">
          {/* Search input */}
          <div className="flex items-center gap-3 border-b border-border px-4 py-3">
            <Search className="h-4 w-4 shrink-0 text-text-muted" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search pages, MRs, issues, agents..."
              autoCorrect="off"
              autoCapitalize="off"
              autoComplete="off"
              spellCheck={false}
              className="flex-1 bg-transparent text-sm text-cream placeholder:text-text-muted/50 outline-none"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="text-text-muted hover:text-cream transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-border bg-[rgba(0,0,0,0.3)] px-1.5 py-0.5 text-[10px] font-mono text-text-muted">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div ref={listRef} className="max-h-[400px] overflow-y-auto py-2">
            {results.length === 0 && query.length > 0 && (
              <div className="px-4 py-8 text-center text-sm text-text-muted">
                No results for "{query}"
              </div>
            )}

            {Array.from(grouped.entries()).map(([category, items]) => (
              <div key={category}>
                {/* Category header */}
                <div className="px-4 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-widest text-text-muted">
                  {CATEGORY_LABELS[category]}
                </div>

                {/* Items */}
                {items.map((result) => {
                  const idx = flatIndex++;
                  const isActive = idx === activeIndex;

                  return (
                    <button
                      key={result.id}
                      data-index={idx}
                      onClick={() => executeResult(result)}
                      onMouseEnter={() => setActiveIndex(idx)}
                      className={cn(
                        "flex w-full items-center gap-3 px-4 py-2 text-left transition-colors",
                        isActive
                          ? "bg-neon-pink/10 text-cream"
                          : "text-cream/80 hover:bg-[rgba(255,255,255,0.03)]",
                      )}
                    >
                      <result.icon
                        className={cn(
                          "h-4 w-4 shrink-0",
                          isActive ? "text-neon-pink" : "text-text-muted",
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="truncate text-sm">{result.title}</div>
                        {result.subtitle && (
                          <div className="truncate text-[11px] text-text-muted">
                            {result.subtitle}
                          </div>
                        )}
                      </div>
                      {isActive && (
                        <kbd className="hidden sm:inline-flex shrink-0 rounded border border-border bg-[rgba(0,0,0,0.3)] px-1.5 py-0.5 text-[10px] font-mono text-text-muted">
                          ↵
                        </kbd>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
