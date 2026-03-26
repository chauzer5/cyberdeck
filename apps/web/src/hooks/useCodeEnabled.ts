import { trpc } from "@/trpc";

export function useCodeEnabled() {
  const query = trpc.settings.get.useQuery({ key: "code.enabled" });
  const enabled = query.data === null || query.data === undefined ? true : query.data === "true";
  return { enabled, isLoading: query.isLoading };
}
