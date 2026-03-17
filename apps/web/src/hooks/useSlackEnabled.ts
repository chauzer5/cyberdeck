import { trpc } from "@/trpc";

/**
 * Returns whether Slack is enabled (defaults to true if the setting hasn't been set).
 * Also returns the mutation to toggle it.
 */
export function useSlackEnabled() {
  const utils = trpc.useUtils();

  const query = trpc.settings.get.useQuery({ key: "slack.enabled" });

  // null means the key has never been set — treat as enabled
  const enabled = query.data === null || query.data === undefined ? true : query.data === "true";

  const setEnabled = trpc.settings.set.useMutation({
    onMutate: async ({ value }) => {
      await utils.settings.get.cancel({ key: "slack.enabled" });
      utils.settings.get.setData({ key: "slack.enabled" }, value);
    },
    onSettled: () => {
      utils.settings.get.invalidate({ key: "slack.enabled" });
    },
  });

  function toggle(next: boolean) {
    setEnabled.mutate({ key: "slack.enabled", value: String(next) });
  }

  return { enabled, isLoading: query.isLoading, toggle, isPending: setEnabled.isPending };
}
