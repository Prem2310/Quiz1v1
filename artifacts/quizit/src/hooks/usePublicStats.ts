import { getGetPublicStatsQueryKey, useGetPublicStats } from "@workspace/api-client-react";

/** Registered players + players online right now. "Online now" moves in real time, so keep asking while the tab is
 * visible (React Query pauses the interval in background tabs). Landing and Arena share one cache entry. */
export function usePublicStats() {
  return useGetPublicStats({
    query: { queryKey: getGetPublicStatsQueryKey(), staleTime: 10_000, refetchInterval: 20_000, retry: false },
  });
}
