import { Link } from "wouter";
import { formatDistanceToNowStrict } from "date-fns";
import { ChevronRight, TrendingDown, TrendingUp } from "lucide-react";
import { getGetHeadToHeadQueryKey, useGetHeadToHead } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

const DAY_MS = 24 * 60 * 60 * 1000;

const PIP = {
  win: { letter: "W", label: "Won", cls: "border-primary text-primary" },
  loss: { letter: "L", label: "Lost", cls: "border-secondary text-secondary" },
  draw: { letter: "D", label: "Drew", cls: "border-border text-muted-foreground" },
} as const;

/**
 * Your record against one opponent. `phase="before"` is for the matchmaking screen (the duel hasn't been played yet),
 * `"after"` for the result screen, where the duel just played is already counted in the record.
 * `linked` lists the recent duels as links to their reviews — only where leaving the page is safe (not mid-match).
 */
export function HeadToHeadPanel({ opponentId, opponentName, phase, linked = false }: { opponentId: number; opponentName: string; phase: "before" | "after"; linked?: boolean }) {
  const query = useGetHeadToHead(opponentId, { query: { queryKey: getGetHeadToHeadQueryKey(opponentId), enabled: opponentId > 0 } });
  const h = query.data;
  if (!h) return null;

  if (h.played === 0) {
    return <p className="text-center text-xs text-muted-foreground">First time facing {opponentName}.</p>;
  }

  const lead = h.wins > h.losses ? "You lead" : h.wins < h.losses ? `${opponentName} leads` : "Series tied";
  // Rematches inside 24h earn reduced rating (server-side); explain it right where the player would wonder why.
  const inLastDay = h.recent.filter((r) => r.completed_at && Date.now() - new Date(r.completed_at).getTime() < DAY_MS).length;
  const reduced = phase === "before" ? inLastDay >= 1 : inLastDay >= 2;

  return (
    <div className="border border-border bg-surface" aria-label={`Head to head against ${opponentName}`}>
      <div className="flex items-center justify-between gap-3 p-3">
        <div className="min-w-0">
          <p className="label-micro">Head to head</p>
          <p className="truncate text-sm font-semibold text-foreground">{lead}</p>
        </div>
        <p className="numeric shrink-0 text-lg font-bold text-foreground">
          <span className="text-primary">{h.wins}</span>
          <span className="text-muted-foreground"> – </span>
          <span className="text-secondary">{h.losses}</span>
          {h.draws > 0 ? <span className="text-xs font-semibold text-muted-foreground"> ({h.draws} draw{h.draws === 1 ? "" : "s"})</span> : null}
        </p>
      </div>

      {linked ? (
        <ul className="divide-y divide-border border-t border-border" aria-label={`Recent duels against ${opponentName}`}>
          {h.recent.map((r) => (
            <li key={r.duel_id}>
              <Link href={`/duel/${r.duel_id}`} className="group flex min-h-12 items-center gap-3 px-3 py-2 transition-colors hover:bg-card">
                <span className={cn("numeric flex h-7 w-7 shrink-0 items-center justify-center rounded-[calc(var(--radius)-4px)] border-2 text-[11px] font-bold", PIP[r.result].cls)}>
                  {PIP[r.result].letter}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-foreground">{PIP[r.result].label}</span>
                  <span className="block text-xs text-muted-foreground">
                    {r.completed_at ? formatDistanceToNowStrict(new Date(r.completed_at), { addSuffix: true }) : ""}
                  </span>
                </span>
                <span className={cn("numeric flex shrink-0 items-center gap-1 text-sm font-bold", r.rating_change >= 0 ? "text-primary" : "text-secondary")}>
                  {r.rating_change >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                  {r.rating_change >= 0 ? "+" : "−"}
                  {Math.abs(r.rating_change)}
                </span>
                <span className="hidden text-xs font-bold uppercase tracking-wider text-muted-foreground transition-colors group-hover:text-foreground sm:inline">Review</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex items-center gap-1 px-3 pb-3" aria-hidden>
          {[...h.recent].reverse().map((r) => (
            <span key={r.duel_id} className={`numeric flex h-5 w-5 items-center justify-center border text-[10px] font-bold ${PIP[r.result].cls}`}>
              {PIP[r.result].letter}
            </span>
          ))}
          <span className="ml-1 text-[11px] text-muted-foreground">oldest → latest</span>
        </div>
      )}

      {reduced ? <p className={cn("px-3 pb-3 text-[11px] text-muted-foreground", linked && "border-t border-border pt-2")}>Repeat matchups within 24 hours earn less rating, so rematches can't be farmed.</p> : null}
    </div>
  );
}
