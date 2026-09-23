import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { Link } from "wouter";
import { keepPreviousData } from "@tanstack/react-query";
import {
  addDays,
  addMonths,
  addYears,
  differenceInCalendarDays,
  endOfMonth,
  endOfYear,
  format,
  isAfter,
  isBefore,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from "date-fns";
import { ChevronLeft, ChevronRight, Target } from "lucide-react";
import { getGetMyActivityDayQueryKey, getGetMyActivityQueryKey, useGetMyActivity, useGetMyActivityDay, type ActivityDay } from "@workspace/api-client-react";
import { ErrorState, LoadingState } from "@/components/common/StateBlocks";
import { DuelRow, HudStat, PracticeRow, SectionTitle, Segmented } from "@/components/profile/ProfileParts";
import { cn } from "@/lib/utils";
import { useAuth } from "@/stores/auth";

type View = "year" | "month";

const VIEWS = [
  { key: "year", label: "Year" },
  { key: "month", label: "Month" },
] as const;

// Minutes east of UTC, so the server buckets sessions into the player's own calendar days.
const TZ_OFFSET = -new Date().getTimezoneOffset();
const LEVELS = ["bg-border/45", "bg-primary/25", "bg-primary/45", "bg-primary/70", "bg-primary"] as const;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const ROWS_7 = "repeat(7, minmax(0, 1fr))";
// Arrow keys follow the grid's geometry: in the year view a column is a week, in the month view a row is.
const STEP: Record<View, Record<string, number>> = {
  year: { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 },
  month: { ArrowUp: -7, ArrowDown: 7, ArrowLeft: -1, ArrowRight: 1 },
};

const dayKey = (d: Date) => format(d, "yyyy-MM-dd");
const periodStart = (view: View, d: Date) => (view === "year" ? startOfYear(d) : startOfMonth(d));
const periodEnd = (view: View, d: Date) => (view === "year" ? endOfYear(d) : endOfMonth(d));

/** 0 = nothing, 1–4 by questions answered; square-root scaled so one huge day doesn't wash every other day out. */
function levelOf(day: ActivityDay | undefined, max: number) {
  if (!day) return 0;
  if (!day.questions || !max) return 1;
  return Math.min(4, Math.max(1, Math.ceil(4 * Math.sqrt(day.questions / max))));
}

function describe(date: Date, day: ActivityDay | undefined) {
  const when = format(date, "EEE d MMM");
  if (!day) return `${when}: no activity`;
  const parts = [day.practice && `${day.practice} practice`, day.duels && `${day.duels} ${day.duels === 1 ? "duel" : "duels"}`].filter(Boolean);
  return `${when}: ${parts.join(", ")} · ${day.questions} questions`;
}

/** Play history as a calendar: a GitHub-style year of weeks, or one month with day numbers. Pick a day to see what was played. */
export function ActivityHeatmap() {
  const { user } = useAuth();
  const today = useMemo(() => startOfDay(new Date()), []);
  const joined = useMemo(() => startOfDay(user?.date_joined ? new Date(user.date_joined) : today), [user?.date_joined, today]);
  const [view, setView] = useState<View>("year");
  const [cursor, setCursor] = useState(() => startOfYear(today));
  const [picked, setPicked] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);

  const rangeStart = periodStart(view, cursor);
  const rangeEnd = periodEnd(view, cursor);
  const params = { start: dayKey(rangeStart), end: dayKey(rangeEnd), tz_offset: TZ_OFFSET };
  const query = useGetMyActivity(params, { query: { queryKey: getGetMyActivityQueryKey(params), placeholderData: keepPreviousData } });
  const stale = query.isPlaceholderData;

  const data = stale ? undefined : query.data;
  const byDay = useMemo(() => new Map((data ?? []).map((d) => [d.date, d])), [data]);
  const max = useMemo(() => Math.max(0, ...(data ?? []).map((d) => d.questions)), [data]);
  const totals = useMemo(() => (data ?? []).reduce((t, d) => ({ days: t.days + 1, questions: t.questions + d.questions, duels: t.duels + d.duels }), { days: 0, questions: 0, duels: 0 }), [data]);

  const inRange = (key: string) => key >= params.start && key <= params.end && key <= dayKey(today);
  const fallback = data?.length ? data[data.length - 1]!.date : dayKey(isAfter(rangeEnd, today) ? today : rangeEnd);
  const selected = picked && inRange(picked) ? picked : fallback;

  const canPrev = isAfter(rangeStart, joined);
  const canNext = isBefore(rangeEnd, today);

  // Keep the chosen day in view on phones, where a year is wider than the screen.
  useEffect(() => {
    const el = scroller.current;
    const cell = grid.current?.querySelector<HTMLElement>(`[data-day="${selected}"]`);
    if (!el || !cell) return;
    const offset = cell.getBoundingClientRect().left - el.getBoundingClientRect().left + el.scrollLeft;
    el.scrollLeft = offset - el.clientWidth / 2;
  }, [selected, view, data]);

  function changeView(next: View) {
    setView(next);
    // Zoom into the month you were looking at (or out to its year), keeping the chosen day.
    setCursor(periodStart(next, parseISO(selected)));
  }

  function shift(dir: -1 | 1) {
    setPicked(null);
    setCursor((c) => (view === "year" ? addYears(c, dir) : addMonths(c, dir)));
  }

  function select(date: Date, focus: boolean) {
    const clamped = isBefore(date, joined) ? joined : isAfter(date, today) ? today : date;
    const key = dayKey(clamped);
    setPicked(key);
    // Arrowing past the edge of the period turns the page instead of stopping.
    if (!inRange(key)) setCursor(periodStart(view, clamped));
    if (focus) requestAnimationFrame(() => grid.current?.querySelector<HTMLButtonElement>(`[data-day="${key}"]`)?.focus());
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = STEP[view][e.key];
    if (step) select(addDays(parseISO(selected), step), true);
    else if (e.key === "Home") select(rangeStart, true);
    else if (e.key === "End") select(isAfter(rangeEnd, today) ? today : rangeEnd, true);
    else return;
    e.preventDefault();
  }

  const periodLabel = view === "year" ? format(cursor, "yyyy") : format(cursor, "MMMM yyyy");

  function cell(date: Date, index: number) {
    const key = dayKey(date);
    if (key < params.start || key > params.end) return <span key={key} aria-hidden />;
    if (isAfter(date, today)) return <span key={key} aria-hidden className="rounded-[2px] border border-dashed border-border/50" />;
    const day = byDay.get(key);
    const level = levelOf(day, max);
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
        // The period fills in as one sweep once its data lands.
        style={{ transitionDelay: data ? `${index * (view === "year" ? 6 : 12)}ms, 0ms` : undefined }}
        className={cn(
          "relative w-full transition-[background-color,transform] duration-300 ease-out hover:z-10 focus-visible:z-10 focus-visible:outline-none motion-reduce:transition-none",
          LEVELS[level],
          view === "year" ? "aspect-square rounded-[2px] hover:scale-[1.35]" : "aspect-square rounded-[calc(var(--radius)-2px)] hover:scale-[1.06]",
          isSelected && "z-10 ring-2 ring-foreground ring-offset-2 ring-offset-card",
          !isSelected && key === dayKey(today) && "ring-1 ring-primary/70",
        )}
      >
        {view === "month" ? (
          <>
            <span className={cn("numeric absolute left-1.5 top-1 text-[11px] font-bold leading-none sm:left-2 sm:top-1.5 sm:text-xs", level >= 3 ? "text-background" : "text-muted-foreground")}>
              {format(date, "d")}
            </span>
            {day?.duels ? <span className="absolute bottom-1.5 right-1.5 h-1.5 w-1.5 bg-secondary sm:bottom-2 sm:right-2" aria-hidden /> : null}
          </>
        ) : null}
      </button>
    );
  }

  return (
    <div>
      <SectionTitle
        aside={
          <div className="flex flex-wrap items-center gap-2">
            <Segmented label="Calendar view" options={VIEWS} value={view} onChange={changeView} />
            <div className="inline-flex items-center rounded-[var(--radius)] border border-border bg-surface-2 p-0.5">
              <button
                type="button"
                onClick={() => shift(-1)}
                disabled={!canPrev}
                aria-label={view === "year" ? "Previous year" : "Previous month"}
                className="flex h-8 w-8 items-center justify-center rounded-[calc(var(--radius)-2px)] text-muted-foreground transition-colors hover:bg-surface hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="numeric min-w-[7.5rem] text-center text-xs font-bold uppercase tracking-wider text-foreground" aria-live="polite">
                {periodLabel}
              </span>
              <button
                type="button"
                onClick={() => shift(1)}
                disabled={!canNext}
                aria-label={view === "year" ? "Next year" : "Next month"}
                className="flex h-8 w-8 items-center justify-center rounded-[calc(var(--radius)-2px)] text-muted-foreground transition-colors hover:bg-surface hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        }
      >
        Daily activity
      </SectionTitle>

      <p className="-mt-1 mb-4 min-h-4 text-xs text-muted-foreground">
        {data ? (
          <>
            <span className="numeric font-semibold text-foreground">{totals.days}</span> active {totals.days === 1 ? "day" : "days"} ·{" "}
            <span className="numeric font-semibold text-foreground">{totals.questions.toLocaleString()}</span> questions ·{" "}
            <span className="numeric font-semibold text-foreground">{totals.duels}</span> {totals.duels === 1 ? "duel" : "duels"} in {periodLabel}
          </>
        ) : null}
      </p>

      {query.isError ? (
        <ErrorState message="Could not load your activity." onRetry={() => void query.refetch()} />
      ) : view === "year" ? (
        <>
          <YearGrid start={rangeStart} end={rangeEnd} stale={stale} scroller={scroller} grid={grid} onKeyDown={onKeyDown} cell={cell} />
          <Legend />
          <DayDetail key={selected} date={selected} day={byDay.get(selected)} isToday={selected === dayKey(today)} loading={!data} />
        </>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-start">
          <div>
            <div className={cn("transition-opacity", stale && "opacity-50")}>
              <div className="mb-1.5 grid grid-cols-7 gap-1.5" aria-hidden>
                {WEEKDAYS.map((d) => (
                  <span key={d} className="text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {d}
                  </span>
                ))}
              </div>
              <div ref={grid} role="group" aria-label="Activity calendar. Use arrow keys to move between days." onKeyDown={onKeyDown} className="grid grid-cols-7 gap-1.5">
                {Array.from({ length: (rangeStart.getDay() + 6) % 7 }, (_, i) => (
                  <span key={`pad-${i}`} aria-hidden />
                ))}
                {Array.from({ length: differenceInCalendarDays(rangeEnd, rangeStart) + 1 }, (_, i) => cell(addDays(rangeStart, i), i))}
              </div>
            </div>
            <Legend duels />
          </div>
          <DayDetail key={selected} date={selected} day={byDay.get(selected)} isToday={selected === dayKey(today)} loading={!data} aside />
        </div>
      )}
    </div>
  );
}

function YearGrid({
  start,
  end,
  stale,
  scroller,
  grid,
  onKeyDown,
  cell,
}: {
  start: Date;
  end: Date;
  stale: boolean;
  scroller: RefObject<HTMLDivElement | null>;
  grid: RefObject<HTMLDivElement | null>;
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
  cell: (date: Date, index: number) => ReactNode;
}) {
  const first = startOfWeek(start, { weekStartsOn: 1 });
  const weeks = Math.ceil((differenceInCalendarDays(end, first) + 1) / 7);
  const columns = `repeat(${weeks}, minmax(0, 1fr))`;
  // A month's label sits over the week that holds its 1st.
  const labels = Array.from({ length: weeks }, (_, w) => {
    const firstOfMonth = Array.from({ length: 7 }, (_, i) => addDays(first, w * 7 + i)).find((d) => d.getDate() === 1 && d >= start && d <= end);
    return firstOfMonth ? format(firstOfMonth, "MMM") : "";
  });

  return (
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
          {Array.from({ length: weeks * 7 }, (_, i) => cell(addDays(first, i), Math.floor(i / 7)))}
        </div>
      </div>
    </div>
  );
}

function Legend({ duels = false }: { duels?: boolean }) {
  return (
    <div className="mt-2 flex items-center justify-end gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground" aria-hidden>
      {duels ? (
        <span className="mr-auto flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 bg-secondary" /> Played a duel
        </span>
      ) : null}
      Less
      {LEVELS.map((cls) => (
        <span key={cls} className={cn("h-2.5 w-2.5 rounded-[2px]", cls)} />
      ))}
      More
    </div>
  );
}

function DayDetail({ date, day, isToday, loading, aside = false }: { date: string; day: ActivityDay | undefined; isToday: boolean; loading: boolean; aside?: boolean }) {
  const detail = useGetMyActivityDay({ date, tz_offset: TZ_OFFSET }, { query: { enabled: Boolean(day), queryKey: getGetMyActivityDayQueryKey({ date, tz_offset: TZ_OFFSET }) } });
  const accuracy = day?.questions ? Math.round((day.correct / day.questions) * 100) : 0;

  return (
    <section
      aria-live="polite"
      className={cn(
        "animate-in fade-in slide-in-from-bottom-1 duration-300 motion-reduce:animate-none",
        aside ? "border-t border-border pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0" : "mt-4 border-t border-border pt-4",
      )}
    >
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
            <div className={cn("mt-4 grid gap-4 lg:items-start", !aside && "lg:grid-cols-2")}>
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
