import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Swords, X } from "lucide-react";
import { useListTopics } from "@workspace/api-client-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Reveal } from "@/components/common/Motion";
import { VersusSlots } from "@/components/quiz/VersusSlots";
import { HeadToHeadPanel } from "@/components/quiz/HeadToHeadPanel";
import { Button } from "@/components/ui/button";
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

  const [elapsed, setElapsed] = useState(0);

  const navigateTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      serviceRef.current?.dispose();
      if (navigateTimerRef.current) window.clearTimeout(navigateTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (phase !== "searching") return;
    setElapsed(0);
    const t = setInterval(() => setElapsed((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  function start() {
    setError(null);
    setPhase("searching");
    const service = createMatchmakingService(
      {
        onConnection: setConnection,
        onMatchFound: (payload) => {
          setMatch(payload);
          setPhase("matched");
          navigateTimerRef.current = window.setTimeout(() => navigate(`/duel/${payload.duelId}`), 1000);
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
                className={`min-h-9 rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${topicId === null ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
              >
                Any topic
              </button>
              {topicsQuery.data?.map((topic) => (
                <button
                  key={topic.id}
                  type="button"
                  onClick={() => setTopicId(topic.id)}
                  className={`min-h-9 rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${topicId === topic.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
                >
                  {topic.name}
                </button>
              ))}
            </div>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button size="lg" className="w-full" onClick={start}>
            <Swords className="h-4 w-4" /> Queue up
          </Button>
        </Reveal>
      ) : null}

      {phase === "searching" ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-2 text-center" role="status" aria-live="polite">
          <p className="numeric text-2xl font-bold text-foreground">
            {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
          </p>
          <p className="text-sm text-muted-foreground">
            {connection === "OPEN" ? "Looking for a rival near your rating" : "Connecting…"}
            {topicId != null ? ` · ${topicsQuery.data?.find((t) => t.id === topicId)?.name ?? "topic"}` : ""}
          </p>
          {elapsed >= 30 && topicId != null ? (
            <p className="max-w-xs text-sm text-muted-foreground">Taking a while — switch to “Any topic” to get matched faster.</p>
          ) : null}
          <Button variant="outline" size="lg" className="mt-3 min-w-40" onClick={cancel}>
            <X className="h-4 w-4" /> Cancel search
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
