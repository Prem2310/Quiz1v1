import { useMemo, useState, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useLocation } from "wouter";
import { useGetMyHistory, useGetMyProgressTrend, useGetMyTopicInsights, useGetMyWeakness, useListTopics } from "@workspace/api-client-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/StateBlocks";
import { AnimatedNumber } from "@/components/common/AnimatedNumber";
import { Reveal, StaggerGroup, StaggerItem } from "@/components/common/Motion";
import { WeakSpotList, isWeakSpot } from "@/components/quiz/WeakSpotList";

const GRID = "hsl(var(--border))";
const AXIS = "hsl(var(--muted-foreground))";
const PRIMARY = "hsl(var(--primary))";
const SECONDARY = "hsl(var(--secondary))";

const RANGE_OPTIONS = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
];

export default function ProgressPage() {
  const [, navigate] = useLocation();
  const [days, setDays] = useState(30);
  const [topicId, setTopicId] = useState<number | null>(null);

  const topicsListQuery = useListTopics();
  const trendQuery = useGetMyProgressTrend({ days });
  const topicInsightsQuery = useGetMyTopicInsights({ days });
  const historyQuery = useGetMyHistory({ limit: 15, topic_id: topicId ?? undefined });
  const weaknessQuery = useGetMyWeakness({ limit: 12 });
  const weakSpots = (weaknessQuery.data ?? []).filter(isWeakSpot).slice(0, 6);

  const trendData = useMemo(
    () => (trendQuery.data ?? []).map((p) => ({ ...p, label: new Date(p.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }) })),
    [trendQuery.data],
  );

  const totals = useMemo(() => {
    const points = trendQuery.data ?? [];
    const attempts = points.reduce((sum, p) => sum + p.attempts, 0);
    const correct = points.reduce((sum, p) => sum + p.correct, 0);
    return { attempts, accuracy: attempts ? Math.round((correct / attempts) * 100) : 0 };
  }, [trendQuery.data]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader title="Your progress" description="History, trends, per-topic accuracy and the weak spots to work on." />
        <div className="flex gap-1.5">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.days}
              type="button"
              onClick={() => setDays(opt.days)}
              className={`rounded-[var(--radius)] border px-3 py-1.5 text-xs font-semibold transition ${
                days === opt.days ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <StaggerGroup className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StaggerItem>
          <StatTile label="Questions answered" value={totals.attempts} />
        </StaggerItem>
        <StaggerItem>
          <StatTile label="Avg accuracy" value={totals.accuracy} suffix="%" />
        </StaggerItem>
        <StaggerItem>
          <StatTile label="Topics practiced" value={topicInsightsQuery.data?.length ?? 0} />
        </StaggerItem>
        <StaggerItem>
          <StatTile label="Attempts logged" value={historyQuery.data?.length ?? 0} />
        </StaggerItem>
      </StaggerGroup>

      <Reveal delay={0.03}>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold text-foreground">Weak spots</h2>
          <p className="text-xs text-muted-foreground">Practice and duels lean on these automatically.</p>
        </div>
        {weaknessQuery.isError ? (
          <ErrorState message="Could not load your weak spots." onRetry={() => void weaknessQuery.refetch()} />
        ) : weaknessQuery.isPending ? (
          <LoadingState label="Analysing your answers…" />
        ) : weakSpots.length === 0 ? (
          <EmptyState title="No weak spots yet" message="Answer at least three questions in a subtopic and any that need work will show up here." />
        ) : (
          <WeakSpotList
            items={weakSpots}
            onDrill={(item) => navigate(`/practice?mode=weak_topics&topic=${item.topic_id}&subtopic=${item.subtopic_id}`)}
          />
        )}
      </Reveal>

      <Reveal delay={0.05} className="surface-panel p-5">
        <h2 className="mb-4 text-sm font-semibold text-foreground">Daily accuracy</h2>
        {trendQuery.isError ? (
          <ErrorState message="Could not load your trend." onRetry={() => void trendQuery.refetch()} />
        ) : trendQuery.isPending ? (
          <LoadingState label="Loading trend…" />
        ) : trendData.length < 2 ? (
          <EmptyState title="Not enough data yet" message="Complete a few more sessions in this range to see a trend line." />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trendData}>
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" stroke={AXIS} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis stroke={AXIS} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={32} domain={[0, 100]} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                formatter={(value: number, name: string) => [name === "accuracy" ? `${value}%` : value, name === "accuracy" ? "Accuracy" : "Questions"]}
              />
              <Line type="monotone" dataKey="accuracy" stroke={PRIMARY} strokeWidth={2.5} dot={{ r: 3, fill: PRIMARY }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Reveal>

      <Reveal delay={0.1} className="surface-panel p-5">
        <h2 className="mb-4 text-sm font-semibold text-foreground">Accuracy by topic</h2>
        {topicInsightsQuery.isError ? (
          <ErrorState message="Could not load topic accuracy." onRetry={() => void topicInsightsQuery.refetch()} />
        ) : topicInsightsQuery.isPending ? (
          <LoadingState label="Loading topics…" />
        ) : !topicInsightsQuery.data?.length ? (
          <EmptyState title="No data yet" message="Practice a few topics in this range to see this chart fill in." />
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(200, topicInsightsQuery.data.length * 44)}>
            <BarChart data={topicInsightsQuery.data} layout="vertical" margin={{ left: 8 }}>
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} stroke={AXIS} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="topic_name" stroke={AXIS} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={140} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                formatter={(v: number) => [`${v}%`, "Accuracy"]}
              />
              <Bar dataKey="accuracy" fill={SECONDARY} radius={[0, 6, 6, 0]} barSize={18} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Reveal>

      <Reveal delay={0.15}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-foreground">Recent attempts</h2>
          <div className="flex flex-wrap gap-1.5">
            <FilterChip active={topicId === null} onClick={() => setTopicId(null)}>
              All topics
            </FilterChip>
            {topicsListQuery.data?.map((t) => (
              <FilterChip key={t.id} active={topicId === t.id} onClick={() => setTopicId(t.id)}>
                {t.name}
              </FilterChip>
            ))}
          </div>
        </div>
        {historyQuery.isError ? (
          <ErrorState message="Could not load your history." onRetry={() => void historyQuery.refetch()} />
        ) : historyQuery.isPending ? (
          <LoadingState label="Loading history…" />
        ) : !historyQuery.data?.length ? (
          <EmptyState title="No attempts yet" message="Sessions you complete will show up here." />
        ) : (
          <StaggerGroup className="surface-panel divide-y divide-border">
            {historyQuery.data.map((attempt) => (
              <StaggerItem key={attempt.attempt_id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium capitalize text-foreground">{attempt.quiz_mode.replace("_", " ")}</p>
                  <p className="text-xs text-muted-foreground">
                    {attempt.total_correct}/{attempt.total_correct + attempt.total_incorrect} correct · {attempt.accuracy}%
                  </p>
                </div>
                <AnimatedNumber value={attempt.score} className="numeric text-sm font-bold text-primary" />
              </StaggerItem>
            ))}
          </StaggerGroup>
        )}
      </Reveal>
    </div>
  );
}

function StatTile({ label, value, suffix = "" }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="surface-panel p-4">
      <AnimatedNumber value={value} suffix={suffix} className="numeric block text-2xl font-bold text-foreground" />
      <p className="label-micro mt-1">{label}</p>
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
        active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
