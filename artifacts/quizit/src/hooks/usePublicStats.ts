import { getGetPublicStatsQueryKey, useGetPublicStats } from "@workspace/api-client-react";

// A zero reads as a broken feature, not an empty platform, so counts only hide when there's truly nothing to show.
export const MIN_PLAYERS_SHOWN = 1;
export const MIN_ONLINE_SHOWN = 1;

/** Registered players + players online right now. "Online now" moves in real time, so keep asking while the tab is
 * visible (React Query pauses the interval in background tabs). Landing and Arena share one cache entry. */
export function usePublicStats() {
  return useGetPublicStats({
    query: { queryKey: getGetPublicStatsQueryKey(), staleTime: 10_000, refetchInterval: 20_000, retry: false },
  });
}
