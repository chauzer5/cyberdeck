import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "./__root";
import { useState, useRef, useEffect, useCallback } from "react";
import {
  ListTodo,
  Plus,
  CheckCircle2,
  XCircle,
  Circle,
  ExternalLink,
  ChevronDown,
  Pencil,
  Check,
  X,
  Flag,
  RotateCcw,
} from "lucide-react";
import { trpc } from "@/trpc";
import { cn } from "@/lib/utils";

type Priority = "high" | "medium" | "low" | null;
type FilterPriority = "all" | "high" | "medium" | "low";
type Tab = "active" | "completed" | "dismissed";

const PRIORITY_LABELS: Record<string, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

const PRIORITY_COLORS: Record<string, string> = {
  high: "text-red-400",
  medium: "text-yellow-400",
  low: "text-text-muted",
};

const SOURCE_COLORS: Record<string, string> = {
  manual: "bg-[rgba(255,45,123,0.08)] text-neon-pink",
  slack: "bg-[rgba(99,102,241,0.1)] text-indigo-400",
  github: "bg-[rgba(251,191,36,0.1)] text-yellow-400",
};

function TodosPage() {
  const utils = trpc.useUtils();
  const { todoId } = todosRoute.useSearch();
  const [tab, setTab] = useState<Tab>("active");
  const [filterPriority, setFilterPriority] = useState<FilterPriority>("all");
  const [filterSource, setFilterSource] = useState<string>("all");
  const [showNewForm, setShowNewForm] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | undefined>(todoId);

  const todosQuery = trpc.todos.listAll.useQuery(
    { tab },
    { refetchInterval: 15_000 }
  );

  const invalidate = useCallback(() => {
    utils.todos.listAll.invalidate();
    utils.todos.list.invalidate();
  }, [utils]);

  // Scroll to and highlight the targeted todo once data loads
  useEffect(() => {
    if (!todoId || todosQuery.isLoading) return;
    // Small delay to let animations render the DOM element
    const timer = setTimeout(() => {
      const el = document.querySelector(`[data-todo-id="${todoId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        // Clear highlight after animation
        const clear = setTimeout(() => setHighlightedId(undefined), 2000);
        return () => clearTimeout(clear);
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [todoId, todosQuery.isLoading]);

  const setStatusMutation = trpc.todos.setStatus.useMutation({
    onMutate: async ({ id }) => {
      await utils.todos.listAll.cancel();
      const prev = utils.todos.listAll.getData({ tab });
      utils.todos.listAll.setData({ tab }, (old) => {
        if (!old) return old;
        // Remove item from whichever bucket it's in
        const removeFrom = (list: typeof old.active) => list.filter((t) => t.id !== id);
        return {
          ...old,
          active: removeFrom(old.active),
          completed: removeFrom(old.completed),
          dismissed: removeFrom(old.dismissed),
          counts: {
            active: old.active.filter((t) => t.id !== id).length,
            completed: old.completed.filter((t) => t.id !== id).length,
            dismissed: old.dismissed.filter((t) => t.id !== id).length,
          },
        };
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) utils.todos.listAll.setData({ tab }, ctx.prev);
    },
    onSettled: invalidate,
  });

  const createMutation = trpc.todos.create.useMutation({
    onSettled: invalidate,
  });

  const data = todosQuery.data;
  const rawList = tab === "active"
    ? (data?.active ?? [])
    : tab === "completed"
      ? (data?.completed ?? [])
      : (data?.dismissed ?? []);

  // Collect unique sources for filter
  const allSources = Array.from(new Set([...(data?.active ?? []), ...(data?.completed ?? []), ...(data?.dismissed ?? [])].map((t) => t.source)));

  const filtered = rawList.filter((t) => {
    if (filterPriority !== "all" && t.priority !== filterPriority) return false;
    if (filterSource !== "all" && t.source !== filterSource) return false;
    return true;
  });

  // Group by source
  const groups = filtered.reduce<Record<string, typeof filtered>>((acc, t) => {
    const key = t.source;
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {});

  const sourceOrder = Object.keys(groups).sort((a, b) => {
    // manual first, then alphabetical
    if (a === "manual") return -1;
    if (b === "manual") return 1;
    return a.localeCompare(b);
  });

  const emptyLabel = tab === "active" ? "No active todos" : tab === "completed" ? "No completed todos" : "No dismissed todos";

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <h1 className="font-display text-lg font-bold tracking-[2px] uppercase text-cream">Todos</h1>
          <p className="mt-0.5 text-xs text-text-muted">
            {data?.counts.active ?? 0} active · {data?.counts.completed ?? 0} completed · {data?.counts.dismissed ?? 0} dismissed
          </p>
        </div>
        <button
          onClick={() => { setShowNewForm(true); setTab("active"); }}
          className="flex items-center gap-1.5 rounded-lg border border-[rgba(255,45,123,0.2)] bg-[rgba(255,45,123,0.06)] px-3.5 py-[7px] text-xs font-medium text-neon-pink transition-all hover:bg-[rgba(255,45,123,0.1)]"
        >
          <Plus className="h-3.5 w-3.5" />
          New Todo
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 border-b border-border px-6 py-2.5">
        {/* Tabs */}
        <div className="flex rounded-lg border border-border p-0.5">
          {(["active", "completed", "dismissed"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium capitalize transition-all",
                tab === t
                  ? "bg-sidebar-accent text-cream shadow-[inset_0_0_0_1px_rgba(255,45,123,0.12)]"
                  : "text-text-muted hover:text-text-secondary"
              )}
            >
              {t}
              <span className="ml-1.5 tabular-nums opacity-60">
                {t === "active"
                  ? (data?.counts.active ?? 0)
                  : t === "completed"
                    ? (data?.counts.completed ?? 0)
                    : (data?.counts.dismissed ?? 0)}
              </span>
            </button>
          ))}
        </div>

        <div className="h-4 w-px bg-border" />

        {/* Priority filter */}
        <div className="flex items-center gap-1.5">
          <Flag className="h-3 w-3 text-text-muted" />
          <span className="text-[10px] uppercase tracking-widest text-text-muted">Priority</span>
          <div className="flex rounded-md border border-border p-0.5">
            {(["all", "high", "medium", "low"] as FilterPriority[]).map((p) => (
              <button
                key={p}
                onClick={() => setFilterPriority(p)}
                className={cn(
                  "rounded px-2 py-0.5 text-[11px] font-medium capitalize transition-all",
                  filterPriority === p ? "bg-sidebar-accent text-cream" : "text-text-muted hover:text-text-secondary"
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Source filter — only show if multiple sources exist */}
        {allSources.length > 1 && (
          <>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-widest text-text-muted">Source</span>
              <div className="flex rounded-md border border-border p-0.5">
                <button
                  onClick={() => setFilterSource("all")}
                  className={cn(
                    "rounded px-2 py-0.5 text-[11px] font-medium transition-all",
                    filterSource === "all" ? "bg-sidebar-accent text-cream" : "text-text-muted hover:text-text-secondary"
                  )}
                >
                  All
                </button>
                {allSources.map((s) => (
                  <button
                    key={s}
                    onClick={() => setFilterSource(s)}
                    className={cn(
                      "rounded px-2 py-0.5 text-[11px] font-medium capitalize transition-all",
                      filterSource === s ? "bg-sidebar-accent text-cream" : "text-text-muted hover:text-text-secondary"
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {/* New todo form — inline at the top when active */}
        {showNewForm && tab === "active" && (
          <div className="mb-4">
            <NewTodoForm
              onSubmit={(title, priority) => {
                createMutation.mutate({ title, source: "manual", priority: priority ?? undefined });
                setShowNewForm(false);
              }}
              onCancel={() => setShowNewForm(false)}
            />
          </div>
        )}

        {todosQuery.isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-neon-pink" />
          </div>
        ) : filtered.length === 0 && !showNewForm ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <ListTodo className="h-10 w-10 text-text-muted opacity-30" />
            <p className="mt-3 text-sm text-text-muted">{emptyLabel}</p>
            {tab === "active" && filterPriority === "all" && filterSource === "all" && (
              <button
                onClick={() => setShowNewForm(true)}
                className="mt-3 text-xs text-neon-pink hover:text-neon-pink-bright"
              >
                Add your first todo
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {sourceOrder.map((source) => (
              <SourceGroup
                key={source}
                source={source}
                items={groups[source]}
                tab={tab}
                onSetStatus={(id, status) => setStatusMutation.mutate({ id, status })}
                utils={utils}
                invalidate={invalidate}
                highlightedId={highlightedId}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SourceGroup({
  source,
  items,
  tab,
  onSetStatus,
  utils,
  invalidate,
  highlightedId,
}: {
  source: string;
  items: {
    id: string;
    title: string;
    description: string | null;
    priority: "high" | "medium" | "low" | null;
    source: string;
    url: string | null;
    completed: boolean;
    status: string;
    createdAt: string;
    updatedAt: string;
  }[];
  tab: Tab;
  onSetStatus: (id: string, status: "active" | "completed" | "dismissed") => void;
  utils: ReturnType<typeof trpc.useUtils>;
  invalidate: () => void;
  highlightedId?: string;
}) {
  const [collapsed, setCollapsed] = useState(false);

  const labelClass = SOURCE_COLORS[source] ?? "bg-[rgba(255,255,255,0.06)] text-text-muted";

  return (
    <div>
      {/* Group header */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="mb-2 flex w-full items-center gap-2 text-left"
      >
        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize", labelClass)}>
          {source}
        </span>
        <span className="text-[10px] text-text-muted">{items.length}</span>
        <ChevronDown
          className={cn(
            "ml-auto h-3.5 w-3.5 text-text-muted transition-transform",
            collapsed && "-rotate-90"
          )}
        />
      </button>

      {!collapsed && (
        <div className="space-y-1">
          {items.map((todo, i) => (
            <TodoRow
              key={todo.id}
              todo={todo}
              index={i}
              tab={tab}
              onSetStatus={onSetStatus}
              utils={utils}
              invalidate={invalidate}
              highlighted={todo.id === highlightedId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TodoRow({
  todo,
  index,
  tab,
  onSetStatus,
  utils,
  invalidate,
  highlighted,
}: {
  todo: {
    id: string;
    title: string;
    description: string | null;
    priority: "high" | "medium" | "low" | null;
    source: string;
    url: string | null;
    completed: boolean;
    status: string;
  };
  index: number;
  tab: Tab;
  onSetStatus: (id: string, status: "active" | "completed" | "dismissed") => void;
  utils: ReturnType<typeof trpc.useUtils>;
  invalidate: () => void;
  highlighted?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(todo.title);
  const [editPriority, setEditPriority] = useState<Priority>(todo.priority ?? null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isInactive = tab !== "active";

  const updateMutation = trpc.todos.update.useMutation({
    onSettled: invalidate,
  });

  function commitEdit() {
    if (editTitle.trim() && (editTitle !== todo.title || editPriority !== todo.priority)) {
      updateMutation.mutate({
        id: todo.id,
        title: editTitle.trim(),
        priority: editPriority,
      });
    }
    setEditing(false);
  }

  function startEdit() {
    setEditTitle(todo.title);
    setEditPriority(todo.priority ?? null);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  return (
    <div
      data-todo-id={todo.id}
      className={cn(
        "animate-glass-in group flex items-start gap-3 rounded-lg border border-transparent px-3 py-2.5 transition-all",
        `stagger-${Math.min(index + 1, 5)}`,
        "hover:border-[rgba(255,45,123,0.08)] hover:bg-[rgba(255,45,123,0.03)]",
        isInactive && "opacity-50",
        highlighted && "border-[rgba(255,45,123,0.25)] bg-[rgba(255,45,123,0.06)] shadow-[0_0_12px_rgba(255,45,123,0.1)]"
      )}
    >
      {/* Status icon */}
      {tab === "active" ? (
        <button
          onClick={() => onSetStatus(todo.id, "completed")}
          className="mt-0.5 shrink-0 text-text-muted transition-colors hover:text-neon-pink"
          title="Complete"
        >
          <Circle className="h-4 w-4" />
        </button>
      ) : tab === "completed" ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-neon-pink opacity-60" />
      ) : (
        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-text-muted opacity-60" />
      )}

      {/* Content */}
      <div className="min-w-0 flex-1">
        {editing ? (
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitEdit();
                if (e.key === "Escape") { setEditing(false); }
              }}
              className="flex-1 rounded border border-neon-pink/30 bg-[rgba(0,0,0,0.2)] px-2 py-0.5 text-xs text-cream focus:outline-none"
            />
            {/* Priority picker */}
            <div className="flex items-center gap-0.5 rounded border border-border p-0.5">
              {([null, "high", "medium", "low"] as Priority[]).map((p) => (
                <button
                  key={String(p)}
                  onClick={() => setEditPriority(p)}
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] font-medium transition-all",
                    editPriority === p
                      ? p
                        ? cn("bg-sidebar-accent", PRIORITY_COLORS[p])
                        : "bg-sidebar-accent text-text-muted"
                      : "text-text-muted hover:text-text-secondary"
                  )}
                >
                  {p ?? "–"}
                </button>
              ))}
            </div>
            <button onClick={commitEdit} className="text-neon-pink hover:text-neon-pink-bright">
              <Check className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setEditing(false)} className="text-text-muted hover:text-text-secondary">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-baseline gap-2">
            <span className={cn("text-xs text-cream", isInactive && "line-through")}>
              {todo.title}
            </span>
            {todo.priority && (
              <span className={cn("shrink-0 text-[10px] font-medium", PRIORITY_COLORS[todo.priority])}>
                {PRIORITY_LABELS[todo.priority]}
              </span>
            )}
          </div>
        )}

        {todo.description && !editing && (
          <p className="mt-0.5 text-[11px] leading-relaxed text-text-muted">{todo.description}</p>
        )}
      </div>

      {/* Actions */}
      {!editing && (
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          {todo.url && (
            <a
              href={todo.url}
              {...(todo.url.startsWith("slack://") ? {} : { target: "_blank", rel: "noopener noreferrer" })}
              className="rounded p-1 text-text-muted transition-colors hover:text-neon-pink"
              title="Open link"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          {tab === "active" && todo.source === "manual" && (
            <button
              onClick={startEdit}
              className="rounded p-1 text-text-muted transition-colors hover:text-cream"
              title="Edit"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          {tab === "active" && (
            <>
              <button
                onClick={() => onSetStatus(todo.id, "completed")}
                className="rounded p-1 text-text-muted transition-colors hover:text-neon-pink"
                title="Complete"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => onSetStatus(todo.id, "dismissed")}
                className="rounded p-1 text-text-muted transition-colors hover:text-text-secondary"
                title="Dismiss"
              >
                <XCircle className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          {/* For completed/dismissed: offer to reactivate */}
          {isInactive && (
            <button
              onClick={() => onSetStatus(todo.id, "active")}
              className="rounded p-1 text-text-muted transition-colors hover:text-neon-pink"
              title="Reactivate"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function NewTodoForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (title: string, priority: Priority) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Priority>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function submit() {
    if (title.trim()) onSubmit(title.trim(), priority);
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-[rgba(255,45,123,0.15)] bg-[rgba(255,45,123,0.04)] px-3 py-2.5">
      <Circle className="h-4 w-4 shrink-0 text-text-muted" />
      <input
        ref={inputRef}
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") onCancel();
        }}
        placeholder="What needs to be done?"
        className="flex-1 bg-transparent text-xs text-cream placeholder:text-text-muted focus:outline-none"
      />
      {/* Priority picker */}
      <div className="flex items-center gap-0.5 rounded border border-border p-0.5">
        {(["high", "medium", "low"] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPriority(priority === p ? null : p)}
            className={cn(
              "rounded px-1.5 py-0.5 text-[10px] font-medium capitalize transition-all",
              priority === p
                ? cn("bg-sidebar-accent", PRIORITY_COLORS[p])
                : "text-text-muted hover:text-text-secondary"
            )}
          >
            {p}
          </button>
        ))}
      </div>
      <button
        onClick={submit}
        disabled={!title.trim()}
        className="rounded-md bg-neon-pink-dark px-2.5 py-1 text-[11px] font-medium text-neon-pink-bright transition-all hover:bg-neon-pink disabled:opacity-40"
      >
        Add
      </button>
      <button onClick={onCancel} className="text-text-muted hover:text-text-secondary">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export const todosRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/todos",
  component: TodosPage,
  validateSearch: (search: Record<string, unknown>) => ({
    todoId: (search.todoId as string) ?? undefined,
  }),
});
