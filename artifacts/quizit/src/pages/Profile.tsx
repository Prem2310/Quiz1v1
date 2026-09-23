import { useState } from "react";
import { Link } from "wouter";
import { BarChart3, ChevronRight, Flame, LogOut, Settings, Swords, Target, Trophy, Users } from "lucide-react";
import { useGetMyHistory, useGetMyRatingHistory, useGetMyTopicInsights } from "@workspace/api-client-react";
import { Credit } from "@/components/common/Credit";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/StateBlocks";
import { Reveal, StaggerGroup, StaggerItem } from "@/components/common/Motion";
import { ActivityHeatmap } from "@/components/profile/ActivityHeatmap";
import { DuelRow, HudStat, LeagueMeter, Portrait, PracticeRow, SectionTitle, Segmented, Stat } from "@/components/profile/ProfileParts";
import { RatingGraph } from "@/components/profile/RatingGraph";
import { cn } from "@/lib/utils";
import { useAuth } from "@/stores/auth";

// The bottom tab bar only has room for five destinations, so these are reachable from here on phones.
const MORE_LINKS = [
  { to: "/progress", label: "Progress", icon: BarChart3 },
  { to: "/friends", label: "Friends", icon: Users },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

const ACTIVITY_TABS = [
  { key: "duels", label: "Duels" },
  { key: "practice", label: "Practice" },
] as const;

export default function Profile() {
  const { user, logout } = useAuth();
  const [activityTab, setActivityTab] = useState<"duels" | "practice">("duels");
  const ratingQuery = useGetMyRatingHistory({ limit: 200 });
  const historyQuery = useGetMyHistory({ limit: 8 });
  const topicsQuery = useGetMyTopicInsights();

  if (!user) return <LoadingState />;

  const totalAnswered = user.total_correct + user.total_incorrect;
  const accuracy = totalAnswered ? Math.round((user.total_correct / totalAnswered) * 100) : 0;
  const duels = ratingQuery.data ?? [];
  // The record is only trustworthy when we loaded every duel the user has played.
  const record = duels.length > 0 && duels.length === user.matches_played ? { w: duels.filter((d) => d.result === "win").length, l: duels.filter((d) => d.result === "loss").length } : null;
  const topics = [...(topicsQuery.data ?? [])].sort((a, b) => a.accuracy - b.accuracy);

  return (
    <div className="space-y-6">
      <Reveal>
        <header className="glass-panel overflow-hidden">
          <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:p-6">
            <div className="flex min-w-0 items-center gap-4">
              <Portrait name={user.name} corner="p1" />
              <div className="min-w-0">
                <h1 className="truncate font-display text-3xl uppercase leading-none tracking-wide text-foreground sm:text-4xl">{user.name}</h1>
                <p className="mt-2 truncate text-sm text-muted-foreground">
                  @{user.username}
                  {user.college_name ? ` · ${user.college_name}` : ""}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 divide-x divide-border overflow-hidden rounded-[var(--radius)] border border-border sm:min-w-[19rem]">
              <HudStat label="Rating" tone="text-primary">
                {Math.round(user.user_rating)}
              </HudStat>
              <HudStat label="Rank">{user.rank ? `#${user.rank}` : "–"}</HudStat>
              <HudStat label="Best">{Math.round(user.best_rating)}</HudStat>
            </div>
          </div>
          <div className="border-t border-border bg-surface-2/60 px-5 py-3.5 sm:px-6">
            <LeagueMeter rating={user.user_rating} corner="p1" />
          </div>
        </header>
      </Reveal>

      <StaggerGroup className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius)] border border-border bg-border lg:grid-cols-4">
        <Stat icon={Flame} label="Day streak" value={user.current_streak} sub={`best ${user.max_streak}`} />
        <Stat icon={Swords} label="Duels played" value={user.matches_played} sub={record ? `${record.w}W · ${record.l}L` : undefined} />
        <Stat icon={Target} label="Accuracy" value={accuracy} suffix="%" sub={`${user.total_correct} of ${totalAnswered} correct`} />
        <Stat icon={Trophy} label="Total XP" value={user.total_xp} sub={`${user.total_points.toLocaleString()} points`} />
      </StaggerGroup>

      <Reveal delay={0.05} className="surface-panel p-4 sm:p-5">
        <ActivityHeatmap />
      </Reveal>

      <Reveal delay={0.05} className="surface-panel p-4 sm:p-5">
        <SectionTitle>Rating history</SectionTitle>
        {ratingQuery.isError ? (
          <ErrorState message="Could not load your rating history." onRetry={() => void ratingQuery.refetch()} />
        ) : ratingQuery.isPending ? (
          <LoadingState label="Loading rating history…" />
        ) : duels.length === 0 ? (
          <EmptyState
            title="No rated duels yet"
            message="Finish a duel and your rating starts its line here."
            action={
              <Link href="/duel/matchmaking" className="mt-1 inline-flex min-h-10 items-center gap-2 rounded-[var(--radius)] border-2 border-primary px-4 text-sm font-bold uppercase tracking-wide text-primary">
                <Swords className="h-4 w-4" /> Find a duel
              </Link>
            }
          />
        ) : (
          <RatingGraph points={duels} />
        )}
      </Reveal>

      <Reveal className="lg:hidden">
        <nav aria-label="More" className="surface-panel divide-y divide-border">
          {MORE_LINKS.map(({ to, label, icon: Icon }) => (
            <Link key={to} href={to} className="flex min-h-12 items-center gap-3 px-4 text-sm font-bold uppercase tracking-wider text-foreground">
              <Icon className="h-4 w-4 text-primary" />
              <span className="flex-1">{label}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          ))}
          <button
            type="button"
            onClick={() => void logout()}
            className="flex min-h-12 w-full items-center gap-3 px-4 text-left text-sm font-bold uppercase tracking-wider text-destructive"
          >
            <LogOut className="h-4 w-4" />
            Log out
          </button>
        </nav>
      </Reveal>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <Reveal delay={0.1}>
          <SectionTitle aside={<span className="label-micro">Weakest first</span>}>Accuracy by topic</SectionTitle>
          {topicsQuery.isPending ? (
            <LoadingState label="Loading topic insights…" />
          ) : topics.length === 0 ? (
            <EmptyState title="No data yet" message="Complete a practice session to see per-topic accuracy." />
          ) : (
            <StaggerGroup className="surface-panel divide-y divide-border">
              {topics.map((t) => {
                const weak = t.accuracy < 50;
                return (
                  <StaggerItem key={t.topic_id} className="px-4 py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate text-sm font-semibold text-foreground">{t.topic_name}</p>
                      <p className={cn("numeric shrink-0 text-sm font-bold", weak ? "text-secondary" : "text-primary")}>{Math.round(t.accuracy)}%</p>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-[1px] bg-border/70">
                      <div className={cn("h-full transition-[width] duration-500", weak ? "bg-secondary" : "bg-primary")} style={{ width: `${Math.max(t.accuracy, 1)}%` }} />
                    </div>
                    <p className="mt-1.5 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                      <span className="numeric">{t.total_answered} answered</span>
                      {weak ? <span className="label-micro text-secondary">Needs work</span> : null}
                    </p>
                  </StaggerItem>
                );
              })}
            </StaggerGroup>
          )}
        </Reveal>

        <Reveal delay={0.15}>
          <SectionTitle aside={<Segmented label="Activity type" options={ACTIVITY_TABS} value={activityTab} onChange={setActivityTab} />}>Recent activity</SectionTitle>

          {activityTab === "duels" ? (
            ratingQuery.isPending ? (
              <LoadingState label="Loading duels…" />
            ) : duels.length === 0 ? (
              <EmptyState title="No duels yet" message="Your finished duels show up here, with a full question review." />
            ) : (
              <ul className="surface-panel divide-y divide-border">
                {[...duels].reverse().slice(0, 8).map((d) => (
                  <DuelRow key={d.duel_id} duel={d} />
                ))}
              </ul>
            )
          ) : historyQuery.isPending ? (
            <LoadingState label="Loading history…" />
          ) : !historyQuery.data?.length ? (
            <EmptyState title="No practice yet" message="Your recent practice sessions will show up here." />
          ) : (
            <ul className="surface-panel divide-y divide-border">
              {historyQuery.data.map((attempt) => (
                <PracticeRow key={attempt.attempt_id} attempt={attempt} />
              ))}
            </ul>
          )}
        </Reveal>
      </div>

      <Credit className="pb-2 text-center text-xs text-muted-foreground lg:hidden" />
    </div>
  );
}

