import type { ReactNode } from "react";
import type { Flame } from "lucide-react";
import { AnimatedNumber } from "@/components/common/AnimatedNumber";
import { initialsOf } from "@/components/layout/AppShell";
import { leagueProgress } from "@/lib/leagues";
import { cn } from "@/lib/utils";

type Corner = "p1" | "p2";

const CORNER = {
  p1: { border: "border-primary", fill: "bg-primary/10", text: "text-primary", bar: "bg-primary", tag: "bg-primary", label: "P1" },
  p2: { border: "border-secondary", fill: "bg-secondary/10", text: "text-secondary", bar: "bg-secondary", tag: "bg-secondary", label: "P2" },
} as const;

/** Square fighter-select portrait with its corner tag hanging off the bottom edge. */
export function Portrait({ name, corner, size = "lg" }: { name: string; corner: Corner; size?: "md" | "lg" }) {
  const c = CORNER[corner];
  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center rounded-[calc(var(--radius)-2px)] border-2 font-display uppercase tracking-wide",
        c.border,
        c.fill,
        c.text,
        size === "lg" ? "h-16 w-16 text-2xl sm:h-[4.5rem] sm:w-[4.5rem]" : "h-14 w-14 text-xl sm:h-16 sm:w-16 sm:text-2xl",
      )}
    >
      {initialsOf(name)}
      <span className={cn("numeric absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-[2px] px-1.5 py-px text-[10px] font-bold leading-none tracking-wider text-background", c.tag)}>
        {c.label}
      </span>
    </div>
  );
}

/** League band as an instrument: current league left, next league right, a thin segmented fill between. */
export function LeagueMeter({ rating, corner }: { rating: number; corner: Corner }) {
  const { band, next, pct, toNext } = leagueProgress(rating);
  const c = CORNER[corner];
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className={cn("label-micro", c.text)}>{band.name}</span>
        <span className="text-xs text-muted-foreground">
          {next ? (
            <>
              <span className="numeric font-semibold text-foreground">{toNext}</span> to {next.name}
            </>
          ) : (
            "Top league"
          )}
        </span>
      </div>
      <div
        className="relative mt-2 h-1.5 overflow-hidden rounded-[1px] bg-border/70"
        role="progressbar"
        aria-valuenow={Math.round(pct * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={next ? `Progress to ${next.name}` : "Top league"}
      >
        <div className={cn("h-full transition-[width] duration-700 ease-out", c.bar)} style={{ width: `${Math.max(pct * 100, 2)}%` }} />
        {/* Quarter ticks turn the bar into a gauge rather than a loading strip. */}
        <div className="pointer-events-none absolute inset-0 grid grid-cols-4" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="border-r border-background/80 last:border-r-0" />
          ))}
        </div>
      </div>
    </div>
  );
}

/** One readout in a divided HUD strip. */
export function HudStat({ label, children, tone = "text-foreground" }: { label: string; children: ReactNode; tone?: string }) {
  return (
    <div className="min-w-0 bg-surface-2/70 px-3 py-2.5 sm:px-4">
      <p className={cn("numeric truncate text-lg font-bold leading-none sm:text-xl", tone)}>{children}</p>
      <p className="label-micro mt-1.5 truncate">{label}</p>
    </div>
  );
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex min-h-9 flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <h2 className="font-display text-lg uppercase leading-none tracking-wider text-foreground sm:text-xl">{children}</h2>
      {aside}
    </div>
  );
}

/** Square segmented switch — the system radius, not a soft pill. */
export function Segmented<T extends string>({ options, value, onChange, label }: { options: readonly { key: T; label: string }[]; value: NoInfer<T>; onChange: (key: NoInfer<T>) => void; label: string }) {
  return (
    <div className="inline-flex gap-0.5 rounded-[var(--radius)] border border-border bg-surface-2 p-0.5" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          aria-pressed={value === o.key}
          onClick={() => onChange(o.key)}
          className={cn(
            "min-h-8 rounded-[calc(var(--radius)-2px)] px-3 text-xs font-bold uppercase tracking-wider transition-colors",
            value === o.key ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stat({ icon: Icon, label, value, suffix = "", sub }: { icon: typeof Flame; label: string; value: number; suffix?: string; sub?: ReactNode }) {
  return (
    <div className="bg-card px-4 py-3.5 sm:px-5 sm:py-4">
      <p className="label-micro flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-primary" /> {label}
      </p>
      <AnimatedNumber value={value} suffix={suffix} className="numeric mt-2 block text-2xl font-bold leading-none text-foreground" />
      <p className="mt-1.5 min-h-4 truncate text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}
