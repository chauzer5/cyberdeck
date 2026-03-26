import { createRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Code2, Loader2, Play, Square, AlertCircle } from "lucide-react";
import { rootRoute } from "./__root";
import { trpc } from "@/trpc";
import { useLayoutStore } from "@/stores/layout";

export const codeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/code",
  component: CodePage,
});

function CodePage() {
  const setVscodeIframeMounted = useLayoutStore((s) => s.setVscodeIframeMounted);
  const vscodeIframeMounted = useLayoutStore((s) => s.vscodeIframeMounted);
  const statusQuery = trpc.vscode.status.useQuery(undefined, {
    refetchInterval: 3_000,
  });
  const startMutation = trpc.vscode.start.useMutation({
    onSuccess: () => statusQuery.refetch(),
  });
  const stopMutation = trpc.vscode.stop.useMutation({
    onSuccess: () => {
      setVscodeIframeMounted(false);
      statusQuery.refetch();
    },
  });

  const status = statusQuery.data?.status ?? "stopped";
  const port = statusQuery.data?.port ?? 8767;
  const lastError = statusQuery.data?.lastError;

  // Auto-start on mount if not running
  const [autoStarted, setAutoStarted] = useState(false);
  useEffect(() => {
    if (!autoStarted && status === "stopped" && !startMutation.isPending) {
      setAutoStarted(true);
      startMutation.mutate();
    }
  }, [status, autoStarted, startMutation]);

  // Mount the persistent iframe once running
  useEffect(() => {
    if (status === "running") {
      setVscodeIframeMounted(true);
    }
  }, [status, setVscodeIframeMounted]);

  // If iframe is mounted and running, the root layout iframe covers this page — just render a stop button overlay
  if (status === "running" && vscodeIframeMounted) {
    return (
      <div className="relative h-full">
        {/* Floating stop button in top-right corner, above the iframe */}
        <div className="absolute top-3 left-3 z-20">
          <button
            onClick={() => stopMutation.mutate()}
            disabled={stopMutation.isPending}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-panel/90 backdrop-blur-sm px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-[rgba(239,68,68,0.15)] disabled:opacity-50 shadow-lg"
          >
            <Square className="h-3 w-3" />
            Stop VS Code
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center">
      {status === "starting" && (
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-neon-cyan" />
          <p className="mt-3 text-sm text-text-muted">Starting VS Code server...</p>
          <p className="mt-1 text-xs text-text-muted">Port {port}</p>
        </div>
      )}
      {status === "error" && (
        <div className="text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-red-400" />
          <p className="mt-3 text-sm text-red-400">Failed to start VS Code</p>
          {lastError && <p className="mt-1 text-xs text-text-muted">{lastError}</p>}
          <button
            onClick={() => startMutation.mutate()}
            className="mt-4 rounded-lg border border-border px-4 py-2 text-xs font-medium text-cream hover:bg-[rgba(255,255,255,0.05)]"
          >
            Retry
          </button>
        </div>
      )}
      {status === "stopped" && (
        <div className="text-center">
          <Code2 className="mx-auto h-8 w-8 text-text-muted" />
          <p className="mt-3 text-sm text-text-muted">VS Code server is not running</p>
          <button
            onClick={() => startMutation.mutate()}
            disabled={startMutation.isPending}
            className="mt-4 flex items-center gap-1.5 mx-auto rounded-lg border border-border bg-[rgba(0,255,136,0.08)] px-4 py-2 text-xs font-medium text-neon-green hover:bg-[rgba(0,255,136,0.15)] disabled:opacity-50"
          >
            <Play className="h-3.5 w-3.5" />
            Start VS Code
          </button>
        </div>
      )}
    </div>
  );
}
