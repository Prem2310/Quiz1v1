import { Link } from "wouter";
import { BarChart3, ChevronRight, Flame, LogOut, Settings, Swords, Target, Trophy, Users } from "lucide-react";
import { useGetMyHistory, useGetMyTopicInsights } from "@workspace/api-client-react";
import { PageHeader } from "@/components/common/PageHeader";
import { AnimatedNumber } from "@/components/common/AnimatedNumber";
import { Credit } from "@/components/common/Credit";
import { EmptyState, LoadingState } from "@/components/common/StateBlocks";
import { Reveal, StaggerGroup, StaggerItem } from "@/components/common/Motion";
import { initialsOf } from "@/components/layout/AppShell";
import { useAuth } from "@/stores/auth";

// The bottom tab bar only has room for five destinations, so these are reachable from here on phones.
const MORE_LINKS = [
  { to: "/progress", label: "Progress", icon: BarChart3 },
  { to: "/friends", label: "Friends", icon: Users },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export default function Profile() {
  const { user, logout } = useAuth();
  const historyQuery = useGetMyHistory({ limit: 10 });
  const topicsQuery = useGetMyTopicInsights();

  if (!user) return <LoadingState />;

  const totalAnswered = user.total_correct + user.total_incorrect;
  const accuracy = totalAnswered ? Math.round((user.total_correct / totalAnswered) * 100) : 0;

  return (
    <div className="space-y-6">
      <PageHeader title={user.name} description={`@${user.username}${user.college_name ? ` · ${user.college_name}` : ""}`} />

      <Reveal className="glass-panel flex flex-wrap items-center gap-5 p-6">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[var(--radius)] bg-primary/10 text-xl font-bold text-primary">
          {initialsOf(user.name)}
        </div>
        <div className="flex-1">
          <p className="text-lg font-bold text-foreground">
            {Math.round(user.user_rating)} <span className="text-sm font-medium text-muted-foreground">rating</span>
          </p>
          <p className="label-micro mt-1">{user.league} league · best {Math.round(user.best_rating)}</p>
        </div>
      </Reveal>

      <StaggerGroup className="grid gap-3 sm:grid-cols-4">
        <StaggerItem>
          <Stat icon={Flame} label="Streak" value={user.current_streak} sub={`best ${user.max_streak}`} />
        </StaggerItem>
        <StaggerItem>
          <Stat icon={Swords} label="Duels played" value={user.matches_played} />
        </StaggerItem>
        <StaggerItem>
          <Stat icon={Target} label="Accuracy" value={accuracy} suffix="%" />
        </StaggerItem>
        <StaggerItem>
          <Stat icon={Trophy} label="Total XP" value={user.total_xp} />
        </StaggerItem>
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

      <Reveal delay={0.1}>
        <h2 className="mb-3 text-sm font-semibold text-foreground">Accuracy by topic</h2>
        {topicsQuery.isPending ? (
          <LoadingState label="Loading topic insights…" />
        ) : !topicsQuery.data?.length ? (
          <EmptyState title="No data yet" message="Complete a practice session to see per-topic accuracy." />
        ) : (
          <StaggerGroup className="surface-panel divide-y divide-border">
            {topicsQuery.data.map((t) => (
              <StaggerItem key={t.topic_id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{t.topic_name}</p>
                  <p className="text-xs text-muted-foreground">{t.total_answered} answered</p>
                </div>
                <div className="w-32 shrink-0">
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface">
                    <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${t.accuracy}%` }} />
                  </div>
                  <p className="numeric mt-1 text-right text-xs font-semibold text-foreground">{t.accuracy}%</p>
                </div>
              </StaggerItem>
            ))}
          </StaggerGroup>
        )}
      </Reveal>

      <Reveal delay={0.15}>
        <h2 className="mb-3 text-sm font-semibold text-foreground">Recent activity</h2>
        {historyQuery.isPending ? (
          <LoadingState label="Loading history…" />
        ) : !historyQuery.data?.length ? (
          <EmptyState title="No attempts yet" message="Your recent practice and duel results will show up here." />
        ) : (
          <StaggerGroup className="surface-panel divide-y divide-border">
            {historyQuery.data.map((attempt) => (
              <StaggerItem key={attempt.attempt_id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium capitalize text-foreground">{attempt.quiz_mode.replace("_", " ")}</p>
                  <p className="text-xs text-muted-foreground">
                    {attempt.total_correct}/{attempt.total_correct + attempt.total_incorrect} correct
                  </p>
                </div>
                <AnimatedNumber value={attempt.score} className="text-sm font-bold text-primary" />
              </StaggerItem>
            ))}
          </StaggerGroup>
        )}
      </Reveal>

      <Credit className="pb-2 text-center text-xs text-muted-foreground lg:hidden" />
    </div>
  );
}

function Stat({ icon: Icon, label, value, suffix = "", sub }: { icon: typeof Flame; label: string; value: number; suffix?: string; sub?: string }) {
  return (
    <div className="surface-panel p-4">
      <Icon className="h-4 w-4 text-primary" />
      <AnimatedNumber value={value} suffix={suffix} className="mt-2 block text-xl font-bold text-foreground" />
      <p className="label-micro mt-0.5">
        {label}
        {sub ? ` · ${sub}` : ""}
      </p>
    </div>
  );
}
