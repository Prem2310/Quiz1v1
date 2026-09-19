import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Swords, X } from "lucide-react";
import { useListTopics } from "@workspace/api-client-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Reveal } from "@/components/common/Motion";
import { HeadToHeadPanel } from "@/components/quiz/HeadToHeadPanel";
import { Button } from "@/components/ui/button";
import { initialsOf } from "@/components/layout/AppShell";
import { createMatchmakingService } from "@/lib/realtime";
import { useAuth } from "@/stores/auth";
import type { ConnectionState, MatchFoundPayload } from "@/types";

type Phase = "idle" | "searching" | "matched" | "error";

export default function DuelMatchmaking() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const topicsQuery = useListTopics();

  const [topicId, setTopicId] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [connection, setConnection] = useState<ConnectionState>("IDLE");
  const [match, setMatch] = useState<MatchFoundPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const serviceRef = useRef<ReturnType<typeof createMatchmakingService> | null>(null);

  useEffect(() => () => serviceRef.current?.dispose(), []);

  function start() {
    setError(null);
    setPhase("searching");
    const service = createMatchmakingService(
      {
        onConnection: setConnection,
        onMatchFound: (payload) => {
          setMatch(payload);
          setPhase("matched");
          window.setTimeout(() => navigate(`/duel/${payload.duelId}`), 1500);
        },
        onError: (message) => {
          setError(message);
          setPhase("error");
        },
      },
      topicId,
    );
    serviceRef.current = service;
    service.start();
  }

  function cancel() {
    serviceRef.current?.cancel();
    serviceRef.current = null;
    setPhase("idle");
  }

  const showSlots = phase === "searching" || phase === "matched";

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader title="Find an opponent" description="Get matched with someone near your rating." />

      {showSlots ? (
        <VersusSlots
          youName={user?.name ?? "You"}
          opponentName={match?.opponent?.name ?? null}
          opponentRating={match?.opponent?.rating ?? null}
          searching={phase === "searching"}
        />
      ) : null}

      {phase === "idle" || phase === "error" ? (
        <Reveal className="glass-panel space-y-5 p-6">
          <div>
            <p className="label-micro mb-2">Topic (optional)</p>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setTopicId(null)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${topicId === null ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
              >
                Any topic
              </button>
              {topicsQuery.data?.map((topic) => (
                <button
                  key={topic.id}
                  type="button"
                  onClick={() => setTopicId(topic.id)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${topicId === topic.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
                >
                  {topic.name}
                </button>
              ))}
            </div>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button size="lg" className="w-full glow-primary" onClick={start}>
            <Swords className="h-4 w-4" /> Queue up
          </Button>
        </Reveal>
      ) : null}

      {phase === "searching" ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-4 text-center">
          <p className="numeric text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {connection === "OPEN" ? "Connected · widening search…" : "Connecting…"}
          </p>
          <Button variant="outline" onClick={cancel}>
            <X className="h-4 w-4" /> Cancel
          </Button>
        </motion.div>
      ) : null}

      {phase === "matched" && match?.opponent ? (
        <HeadToHeadPanel opponentId={match.opponent.user_id} opponentName={match.opponent.name} phase="before" />
      ) : null}

      {phase === "matched" && match ? (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="font-display text-center text-xl uppercase tracking-wide text-primary">
          Match found — entering the arena…
        </motion.p>
      ) : null}
    </div>
  );
}

/** The versus-screen signature moment: a P1 slot (you, always filled) facing a P2
 * slot that pulses empty while searching and locks in the real opponent the instant
 * matchmaking resolves — the same two-corner framing the duel room itself uses. */
function VersusSlots({
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
