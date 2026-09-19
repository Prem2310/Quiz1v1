import { Medal } from "lucide-react";
import { useState } from "react";
import { GetLeaderboardScope, useGetLeaderboard, type LeaderboardEntry } from "@workspace/api-client-react";
import { PageHeader } from "@/components/common/PageHeader";
import { ErrorState, LoadingState } from "@/components/common/StateBlocks";
import { Reveal, StaggerGroup, StaggerItem } from "@/components/common/Motion";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { initialsOf } from "@/components/layout/AppShell";
import { useAuth } from "@/stores/auth";
import { cn } from "@/lib/utils";

const PODIUM_HEIGHTS: Record<number, string> = { 1: "h-28", 2: "h-20", 3: "h-14" };
const PODIUM_ORDER = [2, 1, 3];

export default function Leaderboard() {
  const { user } = useAuth();
  const [scope, setScope] = useState<GetLeaderboardScope>(GetLeaderboardScope.global);
  const query = useGetLeaderboard({ scope, limit: 50 });

  const entries = query.data ?? [];
  const podium = entries.filter((e) => e.rank <= 3);
  const rest = entries.filter((e) => e.rank > 3);
  const myEntry = entries.find((e) => e.is_me);
  const myInTop = myEntry ? myEntry.rank <= 3 || rest.some((e) => e.is_me) : false;

  return (
    <div className="space-y-6">
      <PageHeader title="Leaderboard" description="Ranked by rating across the quiz1v1 arena." />

      <Tabs value={scope} onValueChange={(v) => setScope(v as GetLeaderboardScope)}>
        <TabsList className="grid w-full grid-cols-3 bg-surface sm:w-80">
          <TabsTrigger value={GetLeaderboardScope.global}>Global</TabsTrigger>
          <TabsTrigger value={GetLeaderboardScope.college}>College</TabsTrigger>
          <TabsTrigger value={GetLeaderboardScope.friends}>Friends</TabsTrigger>
        </TabsList>
      </Tabs>

      {query.isError ? (
        <ErrorState message="Leaderboard could not be loaded." onRetry={() => void query.refetch()} />
      ) : query.isPending ? (
        <LoadingState label="Loading standings…" />
      ) : entries.length === 0 ? (
        <Reveal className="surface-panel p-8 text-center text-sm text-muted-foreground">
          {scope === GetLeaderboardScope.college
            ? user?.college_name
              ? "No one from your college has played yet."
              : "Add your college in Settings to see a college leaderboard."
            : scope === GetLeaderboardScope.friends
              ? "Add friends to see how you stack up against them."
              : "No players yet."}
        </Reveal>
      ) : (
        <>
          {podium.length > 0 ? (
            <StaggerGroup className="surface-panel flex items-end justify-center gap-3 p-6 pb-0 sm:gap-6">
              {PODIUM_ORDER.map((rank) => {
                const entry = podium.find((e) => e.rank === rank);
                if (!entry) return <div key={rank} className="w-24 sm:w-28" />;
                return (
                  <StaggerItem key={rank}>
                    <PodiumSlot entry={entry} />
                  </StaggerItem>
                );
              })}
            </StaggerGroup>
          ) : null}

          {rest.length > 0 ? (
            <StaggerGroup className="space-y-2">
              {rest.map((entry) => (
                <StaggerItem key={entry.user_id}>
                  <LeaderboardRow entry={entry} />
                </StaggerItem>
              ))}
            </StaggerGroup>
          ) : null}

          {myEntry && !myInTop && myEntry.rank > 3 && !rest.some((e) => e.is_me) ? (
            <div className="sticky bottom-2">
              <LeaderboardRow entry={myEntry} pinned />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function PodiumSlot({ entry }: { entry: LeaderboardEntry }) {
  const isFirst = entry.rank === 1;
  return (
    <div className="flex w-24 flex-col items-center sm:w-28">
      <div
        className={cn(
          "flex items-center justify-center rounded-full border-2 text-sm font-bold",
          isFirst ? "h-14 w-14 border-warning bg-warning/10 text-warning" : "h-11 w-11 border-border bg-card text-foreground",
        )}
      >
        {initialsOf(entry.name)}
      </div>
      <p className="mt-2 max-w-full truncate text-xs font-semibold text-foreground">{entry.name}</p>
      <p className="numeric text-[11px] text-muted-foreground">{Math.round(entry.user_rating)}</p>
      <div className={cn("mt-2 flex w-full items-start justify-center rounded-t-lg border border-b-0 border-border bg-surface pt-2", PODIUM_HEIGHTS[entry.rank])}>
        <span className={cn("numeric text-2xl font-bold", isFirst ? "text-warning" : "text-muted-foreground")}>{entry.rank}</span>
      </div>
    </div>
  );
}

function LeaderboardRow({ entry, pinned = false }: { entry: LeaderboardEntry; pinned?: boolean }) {
  return (
    <li
      className={cn(
        "surface-panel grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 px-3 py-3 sm:px-4",
        entry.is_me && "border-primary/60 bg-primary/5",
        pinned && "glow-primary",
      )}
    >
      <span className="numeric flex items-center gap-1 text-sm font-bold text-muted-foreground">
        {entry.rank <= 3 ? <Medal className="h-4 w-4 text-warning" /> : null}
        {entry.rank}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">
          {entry.name} {entry.is_me ? <span className="text-primary">(you)</span> : null}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          @{entry.username}
          {entry.college_name ? ` · ${entry.college_name}` : ""}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="numeric text-sm font-bold text-primary">{Math.round(entry.user_rating)}</p>
        <p className="label-micro">{entry.league}</p>
      </div>
    </li>
  );
}
