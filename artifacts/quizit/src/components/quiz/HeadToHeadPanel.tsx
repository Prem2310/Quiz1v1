import { getGetHeadToHeadQueryKey, useGetHeadToHead } from "@workspace/api-client-react";

const DAY_MS = 24 * 60 * 60 * 1000;

const PIP = {
  win: { letter: "W", cls: "border-primary text-primary" },
  loss: { letter: "L", cls: "border-secondary text-secondary" },
  draw: { letter: "D", cls: "border-border text-muted-foreground" },
} as const;

/**
 * Your record against one opponent. `phase="before"` is for the matchmaking screen (the duel hasn't been played yet),
 * `"after"` for the result screen, where the duel just played is already counted in the record.
 */
export function HeadToHeadPanel({ opponentId, opponentName, phase }: { opponentId: number; opponentName: string; phase: "before" | "after" }) {
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
    <div className="border border-border bg-surface p-3" aria-label={`Head to head against ${opponentName}`}>
      <div className="flex items-center justify-between gap-3">
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
      <div className="mt-2 flex items-center gap-1" aria-hidden>
        {[...h.recent].reverse().map((r) => (
          <span key={r.duel_id} className={`numeric flex h-5 w-5 items-center justify-center border text-[10px] font-bold ${PIP[r.result].cls}`}>
            {PIP[r.result].letter}
          </span>
        ))}
        <span className="ml-1 text-[11px] text-muted-foreground">oldest → latest</span>
      </div>
      {reduced ? <p className="mt-2 text-[11px] text-muted-foreground">Repeat matchups within 24 hours earn less rating, so rematches can't be farmed.</p> : null}
    </div>
  );
}
