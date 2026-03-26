import { useState, useRef, useEffect } from "react";
import { CheckCircle2, XCircle, ListTodo, ExternalLink, Plus, ArrowRight } from "lucide-react";
import { trpc } from "@/trpc";
import { PanelShell } from "@/components/layout/PanelShell";
import { Link, useNavigate } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export function TodoPanel() {
  const [showNewForm, setShowNewForm] = useState(false);
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const todosQuery = trpc.todos.list.useQuery(undefined, {
    refetchInterval: 15_000,
  });

  const setStatusMutation = trpc.todos.setStatus.useMutation({
    onMutate: async ({ id }) => {
      await utils.todos.list.cancel();
      const prev = utils.todos.list.getData();
      utils.todos.list.setData(undefined, (old) =>
        old?.filter((t) => t.id !== id)
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) utils.todos.list.setData(undefined, ctx.prev);
    },
    onSettled: () => {
      utils.todos.list.invalidate();
      utils.todos.listAll.invalidate();
    },
  });

  const createMutation = trpc.todos.create.useMutation({
    onSettled: () => utils.todos.list.invalidate(),
  });

  const todos = todosQuery.data ?? [];
  const count = todos.length;

  return (
    <PanelShell
      title="Todos"
      icon={<ListTodo className="h-4 w-4" />}
      badge={`${count} active`}
      headerAction={
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowNewForm(true)}
            className="flex items-center justify-center rounded-md p-1 text-text-muted transition-colors hover:bg-[rgba(255,45,123,0.1)] hover:text-neon-pink"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <Link
            to="/todos"
            className="flex items-center justify-center rounded-md p-1 text-text-muted transition-colors hover:bg-[rgba(255,45,123,0.1)] hover:text-neon-pink"
            title="View all todos"
          >
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      }
      loading={todosQuery.isLoading}
      error={todosQuery.error?.message}
      className="h-full rounded-none border-0"
    >
      {count === 0 && !showNewForm ? (
        <p className="text-xs text-text-muted">
          No todos yet. Click + to get started.
        </p>
      ) : (
        <div className="flex h-full flex-col gap-2 overflow-y-auto">
          {showNewForm && (
            <NewTodoInput
              onSubmit={(title) => {
                createMutation.mutate({ title, source: "manual" });
                setShowNewForm(false);
              }}
              onCancel={() => setShowNewForm(false)}
            />
          )}
          {todos.map((todo, i) => (
            <div
              key={todo.id}
              onClick={() => navigate({ to: "/todos", search: { todoId: todo.id } })}
              className={cn(
                "animate-glass-in group cursor-pointer rounded-lg border border-[rgba(255,45,123,0.06)] bg-[rgba(255,45,123,0.02)] px-3 py-2.5 transition-all hover:border-[rgba(255,45,123,0.12)]",
                `stagger-${Math.min(i + 1, 5)}`
              )}
            >
              <div className="flex items-start gap-2.5">
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-xs leading-relaxed text-text-secondary">
                    {todo.title}
                  </p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <SourceBadge source={todo.source} url={todo.url} />
                  </div>
                </div>
                <div className="mt-0.5 flex shrink-0 items-center gap-0.5 opacity-0 transition-all group-hover:opacity-100">
                  <button
                    onClick={(e) => { e.stopPropagation(); setStatusMutation.mutate({ id: todo.id, status: "completed" }); }}
                    className="rounded p-1 text-text-muted transition-colors hover:text-neon-pink"
                    title="Complete"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setStatusMutation.mutate({ id: todo.id, status: "dismissed" }); }}
                    className="rounded p-1 text-text-muted transition-colors hover:text-text-secondary"
                    title="Dismiss"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {count === 0 && showNewForm && (
        <NewTodoInput
          onSubmit={(title) => {
            createMutation.mutate({ title, source: "manual" });
            setShowNewForm(false);
          }}
          onCancel={() => setShowNewForm(false)}
        />
      )}
    </PanelShell>
  );
}

function SourceBadge({ source, url }: { source: string; url: string | null }) {
  if (source === "manual") return null;

  const badge = (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[rgba(255,45,123,0.08)] px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
      {source}
      {url && <ExternalLink className="h-2.5 w-2.5" />}
    </span>
  );

  if (url) {
    return (
      <a
        href={url}
        {...(url.startsWith("slack://") ? {} : { target: "_blank", rel: "noopener noreferrer" })}
        className="transition-opacity hover:opacity-80"
        onClick={(e) => e.stopPropagation()}
      >
        {badge}
      </a>
    );
  }

  return badge;
}

function NewTodoInput({
  onSubmit,
  onCancel,
}: {
  onSubmit: (title: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && value.trim()) {
          onSubmit(value.trim());
        } else if (e.key === "Escape") {
          onCancel();
        }
      }}
      onBlur={onCancel}
      placeholder="What needs to be done?"
      className="w-full rounded-lg border border-border bg-[rgba(255,45,123,0.04)] px-3 py-2 text-xs text-cream placeholder:text-text-muted focus:border-neon-pink focus:outline-none"
    />
  );
}
