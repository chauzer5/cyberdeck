import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "./__root";
import { useState, useEffect } from "react";
import { Settings, MessageSquare, Check, Loader2, ToggleLeft, ToggleRight } from "lucide-react";
import { trpc } from "@/trpc";
import { cn } from "@/lib/utils";
import { useSlackEnabled } from "@/hooks/useSlackEnabled";

function SettingsPage() {
  const [slackModel, setSlackModel] = useState("");
  const [saved, setSaved] = useState(false);
  const slack = useSlackEnabled();

  const currentModel = trpc.settings.get.useQuery({ key: "slack.summarizationModel" });
  const modelsQuery = trpc.agents.listModels.useQuery();

  const setSetting = trpc.settings.set.useMutation({
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  useEffect(() => {
    if (currentModel.data !== undefined) {
      setSlackModel(currentModel.data ?? "");
    }
  }, [currentModel.data]);

  function handleModelChange(value: string) {
    setSlackModel(value);
    setSetting.mutate({ key: "slack.summarizationModel", value });
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <h1 className="font-display text-lg font-bold tracking-[2px] uppercase text-cream">Settings</h1>
          <p className="mt-0.5 text-xs text-text-muted">
            Configure integrations and preferences
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl space-y-6 p-6">
          {/* Slack section */}
          <section className="rounded-xl border border-border bg-[rgba(255,45,123,0.02)]">
            <div className="flex items-center gap-2.5 border-b border-border px-5 py-3.5">
              <MessageSquare className="h-4 w-4 text-neon-pink" />
              <h2 className="text-sm font-semibold text-cream">Slack</h2>
              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs text-text-muted">
                  {slack.enabled ? "Enabled" : "Disabled"}
                </span>
                <button
                  onClick={() => slack.toggle(!slack.enabled)}
                  disabled={slack.isLoading || slack.isPending}
                  className="flex items-center text-text-muted transition-colors hover:text-cream disabled:opacity-50"
                  title={slack.enabled ? "Disable Slack" : "Enable Slack"}
                >
                  {slack.enabled ? (
                    <ToggleRight className="h-5 w-5 text-neon-pink" />
                  ) : (
                    <ToggleLeft className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-5 p-5">
              {/* Model selector */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-semibold text-cream">
                      Summarization Model
                    </label>
                    <p className="mt-0.5 text-[11px] text-text-muted">
                      Model used to summarize Slack conversations and generate headlines
                    </p>
                  </div>
                  {saved && (
                    <span className="flex items-center gap-1 text-[11px] font-medium text-neon-pink">
                      <Check className="h-3 w-3" />
                      Saved
                    </span>
                  )}
                  {setSetting.isPending && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-text-muted" />
                  )}
                </div>

                <select
                  value={slackModel}
                  onChange={(e) => handleModelChange(e.target.value)}
                  disabled={modelsQuery.isLoading}
                  className={cn(
                    "w-full rounded-lg border border-border bg-[rgba(0,0,0,0.3)] px-3 py-2 font-mono text-xs text-cream transition-colors",
                    "focus:border-neon-pink focus:outline-none",
                    "disabled:opacity-50"
                  )}
                >
                  <option value="">Default model</option>
                  {modelsQuery.data?.map((provider) => (
                    <optgroup key={provider.provider} label={provider.provider}>
                      {provider.models.map((m) => (
                        <option key={`${provider.provider}/${m.id}`} value={`${provider.provider}/${m.id}`}>
                          {m.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsPage,
});
