import { useMemo, useState } from "react";
import { format } from "date-fns";
import { CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TrendingDown, TrendingUp } from "lucide-react";
import type { RatingPoint } from "@workspace/api-client-react";
import { LEAGUE_BANDS } from "@/lib/leagues";
import { cn } from "@/lib/utils";

const GRID = "hsl(var(--border))";
const AXIS = "hsl(var(--muted-foreground))";
const RESULT_COLOR = { win: "hsl(var(--primary))", loss: "hsl(var(--secondary))", draw: "hsl(var(--muted-foreground))" } as const;
const RESULT_LABEL = { win: "Won", loss: "Lost", draw: "Drew" } as const;
const RANGES = [
  { key: "10", label: "Last 10", size: 10 },
  { key: "30", label: "Last 30", size: 30 },
  { key: "all", label: "All", size: Infinity },
] as const;

interface Datum {
  n: number;
  rating: number;
  /** undefined for the starting point, which is the rating before the first duel in range */
  point?: RatingPoint;
}

const dateOf = (iso: string | null) => (iso ? format(new Date(iso), "d MMM") : "");
const signed = (value: number) => `${value >= 0 ? "+" : "−"}${Math.abs(Math.round(value * 10) / 10)}`;

/** Codeforces-style rating graph: your rating after every duel, over faint league bands. */
export function RatingGraph({ points }: { points: RatingPoint[] }) {
  const [picked, setPicked] = useState<(typeof RANGES)[number]["key"]>("30");
  // Only offer windows that actually cut something off; otherwise the whole history is shown.
  const ranges = RANGES.filter((r) => r.size === Infinity || r.size < points.length);
  const range = ranges.some((r) => r.key === picked) ? picked : "all";
  const size = RANGES.find((r) => r.key === range)?.size ?? Infinity;
  const shown = points.slice(-size);

  const { data, min, max } = useMemo(() => {
    const series: Datum[] = [{ n: 0, rating: shown[0]!.rating_before }, ...shown.map((point, i) => ({ n: i + 1, rating: point.rating_after, point }))];
    const ratings = series.map((d) => d.rating);
    return { data: series, min: Math.min(...ratings), max: Math.max(...ratings) };
  }, [shown]);

  const lo = Math.floor((min - 30) / 50) * 50;
  const hi = Math.max(Math.ceil((max + 30) / 50) * 50, lo + 100);
  const current = data[data.length - 1]!.rating;
  const change = current - data[0]!.rating;
  const peak = Math.max(...points.map((p) => p.rating_after), points[0]!.rating_before);
  const step = Math.max(1, Math.ceil((data.length - 1) / 4));
  const ticks = data.filter((d) => d.n % step === 0 || d.n === data.length - 1).map((d) => d.n);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <p className="flex items-baseline gap-3">
            <span className="numeric text-4xl font-bold text-foreground">{Math.round(current)}</span>
            {shown.length > 0 ? (
              <span className={cn("numeric flex items-center gap-1 text-base font-bold", change >= 0 ? "text-primary" : "text-secondary")}>
                {change >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                {signed(change)}
              </span>
            ) : null}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            over {range === "all" ? "all" : `the last ${shown.length}`} {shown.length === 1 ? "duel" : "duels"} · peak {Math.round(peak)}
          </p>
        </div>
        {ranges.length > 1 ? (
          <div className="flex gap-1.5" role="group" aria-label="Graph range">
            {ranges.map((r) => (
              <button
                key={r.key}
                type="button"
                aria-pressed={range === r.key}
                onClick={() => setPicked(r.key)}
                className={cn(
                  "min-h-9 rounded-full border px-3.5 text-sm font-medium transition",
                  range === r.key ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div
        className="mt-4 h-52 sm:h-64"
        role="img"
        aria-label={`Rating graph: ${Math.round(data[0]!.rating)} to ${Math.round(current)} across ${shown.length} duels. The list of recent duels has the same data.`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            {LEAGUE_BANDS.filter((b) => b.to > lo && b.from < hi).map((band, i) => (
              <ReferenceArea
                key={band.name}
                y1={Math.max(band.from, lo)}
                y2={Math.min(band.to, hi)}
                fill="hsl(var(--foreground) / 0.035)"
                fillOpacity={i % 2 === 0 ? 1 : 0}
                stroke="none"
                ifOverflow="hidden"
                label={{ value: band.name.toUpperCase(), position: "insideTopRight", fill: AXIS, fontSize: 11, fontWeight: 700, letterSpacing: 1.5 }}
              />
            ))}
            <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="n"
              type="number"
              domain={[0, data.length - 1]}
              ticks={ticks}
              tickFormatter={(n: number) => (n === 0 ? "Start" : dateOf(data[n]?.point?.completed_at ?? null))}
              stroke={AXIS}
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              padding={{ left: 8, right: 8 }}
            />
            <YAxis stroke={AXIS} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={44} domain={[lo, hi]} tickCount={5} />
            <Tooltip content={<RatingTooltip />} cursor={{ stroke: AXIS, strokeDasharray: "3 3" }} />
            <Line type="linear" dataKey="rating" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={<RatingDot />} activeDot={<RatingDot active />} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted-foreground">
        {(["win", "loss", "draw"] as const).map((r) => (
          <span key={r} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: RESULT_COLOR[r] }} />
            {RESULT_LABEL[r]}
          </span>
        ))}
        <span className="ml-auto hidden sm:inline">Hover a dot for the duel</span>
      </p>
    </div>
  );
}

function RatingDot({ cx, cy, payload, active }: { cx?: number; cy?: number; payload?: Datum; active?: boolean }) {
  if (cx == null || cy == null || !payload) return null;
  if (!payload.point) return <circle cx={cx} cy={cy} r={3.5} fill="hsl(var(--background))" stroke={AXIS} strokeWidth={2} />;
  return <circle cx={cx} cy={cy} r={active ? 7 : 4.5} fill={RESULT_COLOR[payload.point.result]} stroke="hsl(var(--background))" strokeWidth={2} />;
}

function RatingTooltip({ active, payload }: { active?: boolean; payload?: { payload: Datum }[] }) {
  const datum = active ? payload?.[0]?.payload : undefined;
  if (!datum) return null;
  const p = datum.point;
  return (
    <div className="border border-border bg-card px-3 py-2.5 text-sm shadow-lg">
      {p ? (
        <>
          <p className="font-semibold text-foreground">
            {RESULT_LABEL[p.result]} vs {p.opponent_name}
          </p>
          <p className="numeric mt-0.5 text-muted-foreground">
            {p.my_score}–{p.opponent_score} · {dateOf(p.completed_at)}
          </p>
          <p className={cn("numeric mt-1 font-bold", p.rating_after >= p.rating_before ? "text-primary" : "text-secondary")}>
            {Math.round(p.rating_before)} → {Math.round(p.rating_after)} ({signed(p.rating_after - p.rating_before)})
          </p>
        </>
      ) : (
        <p className="font-semibold text-foreground">Starting rating {Math.round(datum.rating)}</p>
      )}
    </div>
  );
}
