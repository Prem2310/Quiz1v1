import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Link } from "wouter";
import { keepPreviousData } from "@tanstack/react-query";
import { addDays, differenceInCalendarDays, format, isAfter, isBefore, parseISO, startOfDay, startOfWeek, subYears } from "date-fns";
import { Target } from "lucide-react";
import { getGetMyActivityDayQueryKey, getGetMyActivityQueryKey, useGetMyActivity, useGetMyActivityDay, type ActivityDay } from "@workspace/api-client-react";
import { ErrorState, LoadingState } from "@/components/common/StateBlocks";
import { DuelRow, HudStat, PracticeRow, SectionTitle, Segmented } from "@/components/profile/ProfileParts";
import { cn } from "@/lib/utils";
import { useAuth } from "@/stores/auth";

// Minutes east of UTC, so the server buckets sessions into the player's own calendar days.
const TZ_OFFSET = -new Date().getTimezoneOffset();
const LEVELS = ["bg-border/45", "bg-primary/25", "bg-primary/45", "bg-primary/70", "bg-primary"] as const;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const ROWS_7 = "repeat(7, minmax(0, 1fr))";
// Columns are weeks, rows are weekdays.
const STEP: Record<string, number> = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 };

const dayKey = (d: Date) => format(d, "yyyy-MM-dd");

/** 0 = nothing, 1–4 by questions answered; square-root scaled so one huge day doesn't wash every other day out. */
function levelOf(day: ActivityDay | undefined, max: number) {
  if (!day) return 0;
  if (!day.questions || !max) return 1;
  return Math.min(4, Math.max(1, Math.ceil(4 * Math.sqrt(day.questions / max))));
}

function describe(date: Date, day: ActivityDay | undefined) {
  const when = format(date, "EEE d MMM yyyy");
  if (!day) return `${when}: no activity`;
  const parts = [day.practice && `${day.practice} practice`, day.duels && `${day.duels} ${day.duels === 1 ? "duel" : "duels"}`].filter(Boolean);
  return `${when}: ${parts.join(", ")} · ${day.questions} questions`;
}

/**
 * GitHub-style contribution grid. The current year is the rolling twelve months ending today; an earlier year is
 * January to December. Pick a day to see what was played.
 */
export function ActivityHeatmap() {
  const { user } = useAuth();
  const today = useMemo(() => startOfDay(new Date()), []);
  const thisYear = today.getFullYear();
  const joinedYear = user?.date_joined ? new Date(user.date_joined).getFullYear() : thisYear;
  const years = Array.from({ length: Math.max(1, thisYear - joinedYear + 1) }, (_, i) => String(thisYear - i));
  const [year, setYear] = useState(String(thisYear));
  const [picked, setPicked] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);

  const rolling = year === String(thisYear);
  const rangeStart = rolling ? addDays(subYears(today, 1), 1) : new Date(Number(year), 0, 1);
  const rangeEnd = rolling ? today : new Date(Number(year), 11, 31);
  const params = { start: dayKey(rangeStart), end: dayKey(rangeEnd), tz_offset: TZ_OFFSET };
  const query = useGetMyActivity(params, { query: { queryKey: getGetMyActivityQueryKey(params), placeholderData: keepPreviousData } });
  const stale = query.isPlaceholderData;

  const data = stale ? undefined : query.data;
  const byDay = useMemo(() => new Map((data ?? []).map((d) => [d.date, d])), [data]);
  const max = useMemo(() => Math.max(0, ...(data ?? []).map((d) => d.questions)), [data]);
  const totals = useMemo(() => (data ?? []).reduce((t, d) => ({ days: t.days + 1, questions: t.questions + d.questions, duels: t.duels + d.duels }), { days: 0, questions: 0, duels: 0 }), [data]);

  const inRange = (key: string) => key >= params.start && key <= params.end;
  const fallback = data?.length ? data[data.length - 1]!.date : params.end;
  const selected = picked && inRange(picked) ? picked : fallback;

  // Keep the chosen day in view on phones, where a year is wider than the screen.
  useEffect(() => {
    const el = scroller.current;
    const cell = grid.current?.querySelector<HTMLElement>(`[data-day="${selected}"]`);
    if (!el || !cell) return;
    const offset = cell.getBoundingClientRect().left - el.getBoundingClientRect().left + el.scrollLeft;
    el.scrollLeft = offset - el.clientWidth / 2;
  }, [selected, data]);

  function select(date: Date, focus: boolean) {
    const clamped = isBefore(date, rangeStart) ? rangeStart : isAfter(date, rangeEnd) ? rangeEnd : date;
    const key = dayKey(clamped);
    setPicked(key);
    if (focus) requestAnimationFrame(() => grid.current?.querySelector<HTMLButtonElement>(`[data-day="${key}"]`)?.focus());
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = STEP[e.key];
    if (step) select(addDays(parseISO(selected), step), true);
    else if (e.key === "Home") select(rangeStart, true);
    else if (e.key === "End") select(rangeEnd, true);
    else return;
    e.preventDefault();
  }

  const first = startOfWeek(rangeStart, { weekStartsOn: 1 });
  const weeks = Math.ceil((differenceInCalendarDays(rangeEnd, first) + 1) / 7);
  const columns = `repeat(${weeks}, minmax(0, 1fr))`;
  const labels = Array.from({ length: weeks }, (_, w) => {
    const days = Array.from({ length: 7 }, (_, i) => addDays(first, w * 7 + i)).filter((d) => !isBefore(d, rangeStart) && !isAfter(d, rangeEnd));
    const firstOfMonth = days.find((d) => d.getDate() === 1);
    if (firstOfMonth) return format(firstOfMonth, "MMM");
    // The opening partial month gets a label too, unless the next month's label would crowd it.
    if (w === 0 && days[0] && days[0].getDate() <= 14) return format(days[0], "MMM");
    return "";
  });

  return (
    <div>
      <SectionTitle
        aside={
          <Segmented
            label="Year"
            options={years.map((y) => ({ key: y, label: y }))}
            value={year}
            onChange={(y) => {
              setYear(y);
              setPicked(null);
            }}
          />
        }
      >
        Daily activity
      </SectionTitle>

      <p className="-mt-1 mb-4 min-h-4 text-xs text-muted-foreground">
        {data ? (
          <>
            <span className="numeric font-semibold text-foreground">{totals.days}</span> active {totals.days === 1 ? "day" : "days"} ·{" "}
            <span className="numeric font-semibold text-foreground">{totals.questions.toLocaleString()}</span> questions ·{" "}
            <span className="numeric font-semibold text-foreground">{totals.duels}</span> {totals.duels === 1 ? "duel" : "duels"} {rolling ? "in the last 12 months" : `in ${year}`}
          </>
        ) : null}
      </p>

      {query.isError ? (
        <ErrorState message="Could not load your activity." onRetry={() => void query.refetch()} />
      ) : (
        <>
          <div ref={scroller} className={cn("-mx-1 overflow-x-auto px-1 pb-2 pt-1 transition-opacity [scrollbar-width:thin]", stale && "opacity-50")}>
            <div className="grid min-w-[640px] gap-x-2" style={{ gridTemplateColumns: "1.75rem minmax(0, 1fr)" }}>
              <span className="sticky left-0 z-20 -ml-1 bg-card pl-1" aria-hidden />
              <div className="grid gap-[3px] pb-1.5" style={{ gridTemplateColumns: columns }} aria-hidden>
                {labels.map((label, w) => (
                  <span key={w} className="overflow-visible whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {label}
                  </span>
                ))}
              </div>

              <div className="sticky left-0 z-20 -ml-1 grid gap-[3px] bg-card pl-1" style={{ gridTemplateRows: ROWS_7 }} aria-hidden>
                {WEEKDAYS.map((label, i) => (
                  <span key={label} className="flex items-center text-[10px] font-semibold uppercase leading-none tracking-wider text-muted-foreground">
                    {i % 2 === 0 && i < 6 ? label : ""}
                  </span>
                ))}
              </div>

              <div
                ref={grid}
                role="group"
                aria-label="Activity calendar. Use arrow keys to move between days."
                onKeyDown={onKeyDown}
                className="grid grid-flow-col gap-[3px]"
                style={{ gridTemplateColumns: columns, gridTemplateRows: ROWS_7 }}
              >
                {Array.from({ length: weeks * 7 }, (_, i) => {
                  const date = addDays(first, i);
                  const key = dayKey(date);
                  if (!inRange(key)) return <span key={key} aria-hidden />;
                  const day = byDay.get(key);
                  const isSelected = key === selected;
                  return (
                    <button
                      key={key}
                      type="button"
                      data-day={key}
                      tabIndex={isSelected ? 0 : -1}
                      aria-pressed={isSelected}
                      aria-label={describe(date, day)}
                      title={describe(date, day)}
                      onClick={() => select(date, false)}
                      // The year fills in as one left-to-right sweep once its data lands.
                      style={{ transitionDelay: data ? `${Math.floor(i / 7) * 6}ms, 0ms` : undefined }}
                      className={cn(
                        "relative aspect-square w-full rounded-[2px] transition-[background-color,transform] duration-300 ease-out hover:z-10 hover:scale-[1.35] focus-visible:z-10 focus-visible:outline-none motion-reduce:transition-none",
                        LEVELS[levelOf(day, max)],
                        isSelected && "z-10 ring-2 ring-foreground ring-offset-2 ring-offset-card",
                        !isSelected && key === dayKey(today) && "ring-1 ring-primary/70",
                      )}
                    />
                  );
                })}
              </div>
            </div>
          </div>

          <div className="mt-2 flex items-center justify-end gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground" aria-hidden>
            Less
            {LEVELS.map((cls) => (
              <span key={cls} className={cn("h-2.5 w-2.5 rounded-[2px]", cls)} />
            ))}
            More
          </div>

          <DayDetail key={selected} date={selected} day={byDay.get(selected)} isToday={selected === dayKey(today)} loading={!data} />
        </>
      )}
    </div>
  );
}

function DayDetail({ date, day, isToday, loading }: { date: string; day: ActivityDay | undefined; isToday: boolean; loading: boolean }) {
  const detail = useGetMyActivityDay({ date, tz_offset: TZ_OFFSET }, { query: { enabled: Boolean(day), queryKey: getGetMyActivityDayQueryKey({ date, tz_offset: TZ_OFFSET }) } });
  const accuracy = day?.questions ? Math.round((day.correct / day.questions) * 100) : 0;

  return (
    <section aria-live="polite" className="mt-4 border-t border-border pt-4 animate-in fade-in slide-in-from-bottom-1 duration-300 motion-reduce:animate-none">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display text-base uppercase leading-none tracking-wider text-foreground">{format(parseISO(date), "EEEE, d MMM yyyy")}</h3>
        {isToday ? <span className="label-micro text-primary">Today</span> : null}
      </div>

      {loading ? null : !day ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">{isToday ? "Nothing played yet today." : "Nothing played this day."}</p>
          {isToday ? (
            <Link href="/practice" className="inline-flex min-h-9 items-center gap-2 rounded-[var(--radius)] border-2 border-primary px-3 text-xs font-bold uppercase tracking-wider text-primary transition-colors hover:bg-primary/10">
              <Target className="h-3.5 w-3.5" /> Start practice
            </Link>
          ) : null}
        </div>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius)] border border-border bg-border sm:grid-cols-4">
            <HudStat className="bg-card" label="Practice">{day.practice}</HudStat>
            <HudStat className="bg-card" label="Duels">{day.duels}</HudStat>
            <HudStat className="bg-card" label="Questions">{day.questions}</HudStat>
            <HudStat className="bg-card" label="Accuracy" tone={accuracy >= 50 ? "text-primary" : "text-secondary"}>
              {accuracy}%
            </HudStat>
          </div>

          {detail.isError ? (
            <div className="mt-3">
              <ErrorState message="Could not load this day's sessions." onRetry={() => void detail.refetch()} />
            </div>
          ) : !detail.data ? (
            <LoadingState label="Loading sessions…" />
          ) : (
            <div className="mt-4 grid gap-4 lg:grid-cols-2 lg:items-start">
              {detail.data.duels.length ? (
                <div>
                  <p className="label-micro mb-2">Duels</p>
                  <ul className="divide-y divide-border rounded-[var(--radius)] border border-border">
                    {detail.data.duels.map((d) => (
                      <DuelRow key={d.duel_id} duel={d} clock />
                    ))}
                  </ul>
                </div>
              ) : null}
              {detail.data.practice.length ? (
                <div>
                  <p className="label-micro mb-2">Practice</p>
                  <ul className="divide-y divide-border rounded-[var(--radius)] border border-border">
                    {detail.data.practice.map((a) => (
                      <PracticeRow key={a.attempt_id} attempt={a} clock />
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </>
      )}
    </section>
  );
}
