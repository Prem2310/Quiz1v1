import { Medal } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { GetLeaderboardScope, useGetLeaderboard, type LeaderboardEntry } from "@workspace/api-client-react";
import { AnimatedNumber } from "@/components/common/AnimatedNumber";
import { PageHeader } from "@/components/common/PageHeader";
import { ErrorState, LoadingState } from "@/components/common/StateBlocks";
import { Reveal, StaggerGroup, StaggerItem } from "@/components/common/Motion";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TONE_COLORS, type Tone } from "@/components/brand/DisplayText3D";
import { initialsOf } from "@/components/layout/AppShell";
import { useAuth } from "@/stores/auth";
import { cn } from "@/lib/utils";

const PODIUM_HEIGHTS: Record<number, string> = { 1: "h-28", 2: "h-20", 3: "h-14" };
const PODIUM_ORDER = [2, 1, 3];
const RANK_TONE: Record<number, Tone> = { 1: "primary", 2: "muted", 3: "destructive" };
const RANK_NUMBER_SIZE: Record<number, string> = { 1: "text-7xl", 2: "text-5xl", 3: "text-4xl" };

function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  if (n % 10 === 1) return `${n}st`;
  if (n % 10 === 2) return `${n}nd`;
  if (n % 10 === 3) return `${n}rd`;
  return `${n}th`;
}

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
              : (
                <>
                  <Link href="/settings" className="font-medium text-primary hover:underline">
                    Pick your college in Settings
                  </Link>{" "}
                  to see a college leaderboard.
                </>
              )
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

          {myEntry && myEntry.rank > 3 ? (
            <Reveal className="flex items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full bg-primary motion-safe:animate-pulse" aria-hidden="true" />
              <span className="label-micro">Your rank</span>
              <span className="numeric rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">{ordinal(myEntry.rank)} place</span>
            </Reveal>
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

function profileHref(entry: LeaderboardEntry): string {
  return entry.is_me ? "/profile" : `/profile/${entry.username}`;
}

/** Back to the flat bordered block (gold ring only for #1, everything else neutral) — the filled/extruded versions
 * didn't land. The one new thing is the rank digit itself: the same offset "print-strike" treatment as the duel
 * VICTORY/DEFEAT screen (DisplayText3D) — solid display-font digit with a solid offset duplicate behind it, no
 * gradient — reusing that component's exact three tones (primary/muted/destructive) so 1/2/3 read as distinct
 * without inventing new colors. */
function PodiumSlot({ entry }: { entry: LeaderboardEntry }) {
  const isFirst = entry.rank === 1;
  return (
    <Link href={profileHref(entry)} className={cn("flex flex-col items-center", isFirst ? "w-28 sm:w-32" : "w-24 sm:w-28")}>
      <div
        className={cn(
          "flex items-center justify-center rounded-full border-2 font-bold transition-colors hover:border-primary",
          isFirst ? "h-16 w-16 border-warning bg-warning/10 text-base text-warning" : "h-12 w-12 border-border bg-card text-sm text-foreground",
        )}
      >
        {initialsOf(entry.name)}
      </div>
      <p className={cn("mt-2 max-w-full truncate font-semibold text-foreground", isFirst ? "text-sm" : "text-xs")}>{entry.name}</p>
      <AnimatedNumber value={Math.round(entry.user_rating)} className={cn("text-muted-foreground", isFirst ? "text-xs" : "text-[11px]")} />
      <div className={cn("mt-2 flex w-full items-center justify-center rounded-t-[var(--radius)] border border-b-0 border-border bg-surface", PODIUM_HEIGHTS[entry.rank])}>
        <RankNumeral rank={entry.rank} tone={RANK_TONE[entry.rank] ?? "muted"} className={RANK_NUMBER_SIZE[entry.rank]} />
      </div>
    </Link>
  );
}

/** The digit-sized sibling of DisplayText3D's word treatment: same tone colors, same offset-duplicate-behind-solid-
 * foreground recipe, same display font — but plain HTML instead of SVG, since DisplayText3D's `textLength` is built
 * to stretch a whole word to a fixed width and would badly distort a single character. */
function RankNumeral({ rank, tone, className }: { rank: number; tone: Tone; className?: string }) {
  const { fg, strike } = TONE_COLORS[tone];
  return (
    <span className={cn("numeric relative inline-block font-display font-normal leading-none", className)}>
      <span aria-hidden="true" className="absolute inset-0 translate-x-[3px] translate-y-[3px]" style={{ color: strike }}>
        {rank}
      </span>
      <span className="relative" style={{ color: fg, WebkitTextStroke: "1.5px hsl(var(--background))" }}>
        {rank}
      </span>
    </span>
  );
}

function LeaderboardRow({ entry, pinned = false }: { entry: LeaderboardEntry; pinned?: boolean }) {
  return (
    <li className="list-none">
      <Link
        href={profileHref(entry)}
        className={cn(
          "surface-panel grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 px-3 py-3 transition-colors hover:border-primary sm:px-4",
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
      </Link>
    </li>
  );
}
