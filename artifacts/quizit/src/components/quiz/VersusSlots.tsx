import { motion } from "framer-motion";
import { initialsOf } from "@/components/layout/AppShell";

/** The versus-screen signature moment: a P1 slot (you, always filled) facing a P2
 * slot that pulses empty while searching and locks in the real opponent the instant
 * matchmaking resolves — the same two-corner framing the duel room itself uses. */
export function VersusSlots({
  youName,
  opponentName,
  opponentRating,
  searching,
}: {
  youName: string;
  opponentName: string | null;
  opponentRating: number | null;
  searching: boolean;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-center gap-3">
      <div className="flex-1 border-2 border-primary bg-surface p-5 text-center">
        <p className="numeric text-xs font-bold text-primary">P1</p>
        <div className="mx-auto mt-3 flex h-14 w-14 items-center justify-center rounded-[calc(var(--radius)-4px)] border-2 border-primary bg-card text-lg font-bold text-primary">
          {initialsOf(youName)}
        </div>
        <p className="mt-2 truncate text-sm font-semibold text-foreground">{youName}</p>
      </div>

      <p className="font-display shrink-0 text-2xl text-muted-foreground">VS</p>

      <div className={`relative flex-1 border-2 bg-surface p-5 text-center ${opponentName ? "border-secondary" : "border-dashed border-border"}`}>
        {searching ? <div className="pulse-ring absolute inset-0" /> : null}
        <p className={`numeric text-xs font-bold ${opponentName ? "text-secondary" : "text-muted-foreground"}`}>P2</p>
        <div
          className={`mx-auto mt-3 flex h-14 w-14 items-center justify-center rounded-[calc(var(--radius)-4px)] border-2 text-lg font-bold ${
            opponentName ? "border-secondary bg-card text-secondary" : "border-dashed border-border text-muted-foreground"
          }`}
        >
          {opponentName ? initialsOf(opponentName) : "?"}
        </div>
        <p className="mt-2 truncate text-sm font-semibold text-foreground">
          {opponentName ?? "Searching…"}
        </p>
        {opponentRating != null ? <p className="numeric mt-0.5 text-xs text-muted-foreground">{Math.round(opponentRating)} rating</p> : null}
      </div>
    </motion.div>
  );
}
