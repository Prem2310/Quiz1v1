import { useState, type ReactNode } from "react";
import { Link } from "wouter";
import { formatDistanceToNowStrict } from "date-fns";
import { BarChart3, ChevronRight, Flame, LogOut, Settings, Swords, Target, TrendingDown, TrendingUp, Trophy, Users, Zap } from "lucide-react";
import { useGetMyHistory, useGetMyRatingHistory, useGetMyTopicInsights, type RatingPoint } from "@workspace/api-client-react";
import { AnimatedNumber } from "@/components/common/AnimatedNumber";
import { Credit } from "@/components/common/Credit";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/StateBlocks";
import { Reveal, StaggerGroup, StaggerItem } from "@/components/common/Motion";
import { initialsOf } from "@/components/layout/AppShell";
import { RatingGraph } from "@/components/profile/RatingGraph";
import { leagueProgress } from "@/lib/leagues";
import { cn } from "@/lib/utils";
import { useAuth } from "@/stores/auth";

// The bottom tab bar only has room for five destinations, so these are reachable from here on phones.
const MORE_LINKS = [
  { to: "/progress", label: "Progress", icon: BarChart3 },
  { to: "/friends", label: "Friends", icon: Users },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

const RESULT_STYLE = {
  win: { letter: "W", cls: "border-primary text-primary" },
  loss: { letter: "L", cls: "border-secondary text-secondary" },
  draw: { letter: "D", cls: "border-border text-muted-foreground" },
} as const;

const ago = (iso: string | null) => (iso ? formatDistanceToNowStrict(new Date(iso), { addSuffix: true }) : "");

export default function Profile() {
  const { user, logout } = useAuth();
  const [activityTab, setActivityTab] = useState<"duels" | "practice">("duels");
  const ratingQuery = useGetMyRatingHistory({ limit: 200 });
  const historyQuery = useGetMyHistory({ limit: 8 });
  const topicsQuery = useGetMyTopicInsights();

  if (!user) return <LoadingState />;

  const totalAnswered = user.total_correct + user.total_incorrect;
  const accuracy = totalAnswered ? Math.round((user.total_correct / totalAnswered) * 100) : 0;
  const rating = Math.round(user.user_rating);
  const { next, pct, toNext } = leagueProgress(user.user_rating);
  const duels = ratingQuery.data ?? [];
  // The record is only trustworthy when we loaded every duel the user has played.
  const record = duels.length > 0 && duels.length === user.matches_played ? { w: duels.filter((d) => d.result === "win").length, l: duels.filter((d) => d.result === "loss").length } : null;
  const topics = [...(topicsQuery.data ?? [])].sort((a, b) => a.accuracy - b.accuracy);

  return (
    <div className="space-y-6">
      <Reveal>
        <header className="glass-panel p-5 sm:p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[var(--radius)] border-2 border-primary bg-primary/10 text-xl font-bold text-primary sm:h-20 sm:w-20 sm:text-2xl">
              {initialsOf(user.name)}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-display text-3xl uppercase tracking-wide text-foreground sm:text-4xl">{user.name}</h1>
              <p className="mt-1 truncate text-base text-muted-foreground">
                @{user.username}
                {user.college_name ? ` · ${user.college_name}` : ""}
              </p>
            </div>
          </div>

          <div className="mt-5">
            <div className="flex items-baseline justify-between gap-3">
              <p>
                <span className="numeric text-4xl font-bold text-foreground">{rating}</span> <span className="text-base text-muted-foreground">rating</span>
              </p>
              <p className="font-display text-xl uppercase tracking-wide text-primary">{user.league}</p>
            </div>
            <div className="mt-3 h-2.5 rounded-[2px] bg-border/60" role="progressbar" aria-valuenow={Math.round(pct * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={next ? `Progress to ${next.name}` : "Top league"}>
              <div className="h-full rounded-[2px] bg-primary transition-[width] duration-500" style={{ width: `${Math.max(pct * 100, 2)}%` }} />
            </div>
            <p className="mt-2 text-base text-muted-foreground">
              {next ? `${toNext} to ${next.name}` : "Top league"} · best {Math.round(user.best_rating)}
              {user.rank ? ` · #${user.rank} on the leaderboard` : ""}
            </p>
          </div>
        </header>
      </Reveal>

      <Reveal delay={0.05} className="surface-panel p-4 sm:p-5">
        <h2 className="mb-4 font-display text-2xl uppercase tracking-wide text-foreground">Rating history</h2>
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

      <StaggerGroup className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius)] border border-border bg-border lg:grid-cols-4">
        <Stat icon={Flame} label="Day streak" value={user.current_streak} sub={`best ${user.max_streak}`} />
        <Stat icon={Swords} label="Duels played" value={user.matches_played} sub={record ? `${record.w}W · ${record.l}L` : undefined} />
        <Stat icon={Target} label="Accuracy" value={accuracy} suffix="%" sub={`${user.total_correct} of ${totalAnswered} correct`} />
        <Stat icon={Trophy} label="Total XP" value={user.total_xp} sub={`${user.total_points.toLocaleString()} points`} />
      </StaggerGroup>

      <Reveal className="lg:hidden">
        <nav aria-label="More" className="surface-panel divide-y divide-border">
          {MORE_LINKS.map(({ to, label, icon: Icon }) => (
            <Link key={to} href={to} className="flex min-h-12 items-center gap-3 px-4 text-sm font-bold uppercase tracking-wide text-foreground">
              <Icon className="h-4 w-4 text-primary" />
              <span className="flex-1">{label}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          ))}
          <button
            type="button"
            onClick={() => void logout()}
            className="flex min-h-12 w-full items-center gap-3 px-4 text-left text-sm font-bold uppercase tracking-wide text-destructive"
          >
            <LogOut className="h-4 w-4" />
            Log out
          </button>
        </nav>
      </Reveal>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <Reveal delay={0.1}>
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="font-display text-2xl uppercase tracking-wide text-foreground">Accuracy by topic</h2>
            <span className="text-sm text-muted-foreground">Weakest first</span>
          </div>
          {topicsQuery.isPending ? (
            <LoadingState label="Loading topic insights…" />
          ) : topics.length === 0 ? (
            <EmptyState title="No data yet" message="Complete a practice session to see per-topic accuracy." />
          ) : (
            <StaggerGroup className="surface-panel divide-y divide-border">
              {topics.map((t) => {
                const weak = t.accuracy < 50;
                return (
                  <StaggerItem key={t.topic_id} className="px-4 py-3.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate text-base font-medium text-foreground">{t.topic_name}</p>
                      <p className={cn("numeric shrink-0 text-base font-bold", weak ? "text-secondary" : "text-primary")}>{Math.round(t.accuracy)}%</p>
                    </div>
                    <div className="mt-2 h-2 rounded-[2px] bg-border/60">
                      <div className={cn("h-full rounded-[2px] transition-[width] duration-500", weak ? "bg-secondary" : "bg-primary")} style={{ width: `${Math.max(t.accuracy, 1)}%` }} />
                    </div>
                    <p className="mt-1.5 text-sm text-muted-foreground">{t.total_answered} answered</p>
                  </StaggerItem>
                );
              })}
            </StaggerGroup>
          )}
        </Reveal>

        <Reveal delay={0.15}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-2xl uppercase tracking-wide text-foreground">Recent activity</h2>
            <div className="flex gap-1.5" role="group" aria-label="Activity type">
              {(["duels", "practice"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  aria-pressed={activityTab === tab}
                  onClick={() => setActivityTab(tab)}
                  className={cn(
                    "min-h-9 rounded-full border px-3.5 text-sm font-medium capitalize transition",
                    activityTab === tab ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

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
                <li key={attempt.attempt_id} className="flex items-center justify-between gap-3 px-4 py-3.5">
                  <div className="min-w-0">
                    <p className="truncate text-base font-medium capitalize text-foreground">{attempt.quiz_mode.replace("_", " ")}</p>
                    <p className="text-sm text-muted-foreground">
                      {attempt.total_correct}/{attempt.total_correct + attempt.total_incorrect} correct · {ago(attempt.completed_at ?? null)}
                    </p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1 text-base font-bold text-primary">
                    <Zap className="h-4 w-4" />
                    <AnimatedNumber value={attempt.score} className="numeric" />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Reveal>
      </div>

      <Credit className="pb-2 text-center text-xs text-muted-foreground lg:hidden" />
    </div>
  );
}

function DuelRow({ duel }: { duel: RatingPoint }) {
  const style = RESULT_STYLE[duel.result];
  const delta = Math.round((duel.rating_after - duel.rating_before) * 10) / 10;
  return (
    <li>
      <Link href={`/duel/${duel.duel_id}`} className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-surface">
        <span className={cn("numeric flex h-9 w-9 shrink-0 items-center justify-center rounded-[calc(var(--radius)-4px)] border-2 text-sm font-bold", style.cls)}>{style.letter}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-medium text-foreground">vs {duel.opponent_name}</p>
          <p className="numeric text-sm text-muted-foreground">
            {duel.my_score}–{duel.opponent_score} · {ago(duel.completed_at)}
          </p>
        </div>
        <span className={cn("numeric flex shrink-0 items-center gap-1 text-base font-bold", delta >= 0 ? "text-primary" : "text-secondary")}>
          {delta >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
          {delta >= 0 ? "+" : "−"}
          {Math.abs(delta)}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </Link>
    </li>
  );
}

function Stat({ icon: Icon, label, value, suffix = "", sub }: { icon: typeof Flame; label: string; value: number; suffix?: string; sub?: ReactNode }) {
  return (
    <div className="bg-card p-4 sm:p-5">
      <p className="label-micro flex items-center gap-1.5">
        <Icon className="h-4 w-4 text-primary" /> {label}
      </p>
      <AnimatedNumber value={value} suffix={suffix} className="numeric mt-2 block text-3xl font-bold text-foreground" />
      <p className="mt-1 min-h-5 text-sm text-muted-foreground">{sub}</p>
    </div>
  );
}
