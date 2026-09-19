import { Link } from "wouter";
import { BarChart3, Flame, Hash, RotateCcw, Swords, Target, Trophy, Zap } from "lucide-react";
import { useGetMyAnalytics, useListFriends } from "@workspace/api-client-react";
import { AnimatedNumber } from "@/components/common/AnimatedNumber";
import { ErrorState, LoadingState } from "@/components/common/StateBlocks";
import { HoverCard, Reveal, StaggerGroup, StaggerItem } from "@/components/common/Motion";
import { Button } from "@/components/ui/button";
import { initialsOf } from "@/components/layout/AppShell";
import { useAuth } from "@/stores/auth";

export default function Arena() {
  const { user } = useAuth();
  const { data, isPending, isError, refetch } = useGetMyAnalytics();
  const friendsQuery = useListFriends();
  const friends = friendsQuery.data?.slice(0, 3) ?? [];

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
        <div>
          <h1 className="font-display text-4xl uppercase leading-none tracking-wide text-foreground sm:text-5xl">
            Welcome back, {user?.name?.split(" ")[0] ?? "player"}
          </h1>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">Pick your match — practice solo, or queue for a live duel.</p>
        </div>
        <div className="numeric flex divide-x divide-border overflow-hidden rounded-[var(--radius)] border border-border">
          <HudChip icon={Trophy} value={Math.round(user?.user_rating ?? 1000)} label={user?.league ?? "Bronze"} tone="text-primary" />
          {data?.rank != null ? (
            <Link href="/leaderboard" className="contents">
              <HudChip icon={Hash} value={data.rank} label="rank" tone="text-foreground" />
            </Link>
          ) : null}
          <HudChip icon={Flame} value={user?.current_streak ?? 0} label="streak" tone="text-warning" />
          <HudChip icon={Zap} value={user?.total_xp ?? 0} label="xp" tone="text-highlight" />
          <HudChip icon={BarChart3} value={data?.accuracy ?? 0} label="acc%" tone="text-secondary" />
        </div>
      </header>

      {!isPending && data && (data.due_for_review > 0 || data.recommended_topic) ? (
        <Reveal className="glass-panel flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius)] border border-warning/40 bg-warning/10 text-warning">
              <RotateCcw className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {data.due_for_review > 0
                  ? `${data.due_for_review} question${data.due_for_review === 1 ? "" : "s"} due for review`
                  : `Your weakest topic: ${data.recommended_topic}`}
              </p>
              <p className="text-xs text-muted-foreground">Spaced repetition keeps your weak spots from coming back on test day.</p>
            </div>
          </div>
          <Link href="/practice?mode=weak_topics">
            <Button variant="outline" size="sm">
              Review now
            </Button>
          </Link>
        </Reveal>
      ) : null}

      <StaggerGroup className="grid gap-4 lg:grid-cols-3">
        <StaggerItem className="lg:col-span-2">
          <HoverCard className="h-full">
            <ModeTile
              corner="P1"
              icon={Swords}
              title="Find a duel"
              body="Get matched with someone at your rating. Answer head-to-head, live, best score wins."
              cta="Queue up"
              href="/duel/matchmaking"
              featured
            />
          </HoverCard>
        </StaggerItem>
        <StaggerItem>
          <HoverCard className="h-full">
            <ModeTile
              corner="P2"
              icon={Target}
              title="Practice"
              body="Drill any topic solo, or let QuizIt pick questions you've missed before."
              cta="Start practicing"
              href="/practice"
            />
          </HoverCard>
        </StaggerItem>
      </StaggerGroup>

      {!friendsQuery.isPending && friends.length > 0 ? (
        <Reveal delay={0.1}>
          <div className="mb-3 flex items-center justify-between">
            <p className="label-micro">Challenge a friend</p>
            <Link href="/friends" className="text-xs font-semibold text-primary hover:underline">
              All friends →
            </Link>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-3">
            {friends.map((friend) => (
              <Link key={friend.user_id} href="/friends" className="block">
                <div className="flex items-center gap-3 border border-border bg-surface p-3 transition hover:border-secondary">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[calc(var(--radius)-4px)] border-2 border-secondary bg-card text-xs font-bold text-secondary">
                    {initialsOf(friend.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{friend.name}</p>
                    <p className="numeric truncate text-xs text-muted-foreground">
                      {Math.round(friend.rating)} · {friend.league}
                    </p>
                  </div>
                  <Swords className="h-4 w-4 shrink-0 text-secondary" />
                </div>
              </Link>
            ))}
          </div>
        </Reveal>
      ) : !friendsQuery.isPending && friends.length === 0 ? (
        <Reveal delay={0.1} className="border border-dashed border-border bg-surface p-5 text-center">
          <p className="text-sm text-muted-foreground">
            Add friends to challenge them directly. <Link href="/friends" className="font-semibold text-primary hover:underline">Find friends →</Link>
          </p>
        </Reveal>
      ) : null}

      {isPending ? <LoadingState label="Loading your stats…" /> : null}
      {isError ? <ErrorState message="Couldn't load your stats." onRetry={() => void refetch()} /> : null}
    </div>
  );
}

function HudChip({
  icon: Icon,
  value,
  label,
  tone,
}: {
  icon: typeof Trophy;
  value: number;
  label: string;
  tone: string;
}) {
  return (
    <div className="flex items-center gap-2 bg-surface px-3 py-2">
      <Icon className={`h-3.5 w-3.5 shrink-0 ${tone}`} />
      <AnimatedNumber value={value} className={`text-sm font-bold ${tone}`} />
      <span className="label-micro">{label}</span>
    </div>
  );
}

function ModeTile({
  corner,
  icon: Icon,
  title,
  body,
  cta,
  href,
  featured,
}: {
  corner: "P1" | "P2";
  icon: typeof Swords;
  title: string;
  body: string;
  cta: string;
  href: string;
  featured?: boolean;
}) {
  const cornerColor = corner === "P1" ? "text-primary" : "text-secondary";
  const cornerBorder = corner === "P1" ? "border-primary" : "border-secondary";
  const tileBorder =
    corner === "P1"
      ? featured
        ? "border-primary hover:glow-primary"
        : "border-border hover:border-primary"
      : featured
        ? "border-secondary hover:glow-secondary"
        : "border-border hover:border-secondary";
  return (
    <Link href={href} className="block h-full">
      <div className={`group relative flex h-full min-h-56 flex-col justify-between overflow-hidden border-2 bg-surface p-6 transition-shadow ${tileBorder}`}>
        <div className={`numeric absolute right-4 top-4 text-xs font-bold ${cornerColor}`}>{corner}</div>
        <div>
          <div className={`flex h-12 w-12 items-center justify-center border-2 ${cornerBorder} ${cornerColor}`}>
            <Icon className="h-5 w-5" />
          </div>
          <h3 className="mt-4 font-display text-2xl uppercase tracking-wide text-foreground">{title}</h3>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">{body}</p>
        </div>
        <Button className="mt-6 w-fit" variant={featured ? "default" : "outline"}>
          {cta}
        </Button>
      </div>
    </Link>
  );
}
