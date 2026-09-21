import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Flag, Home, Share2, Swords, TrendingDown, TrendingUp, Zap } from "lucide-react";
import {
  getCancelChallengeMutationOptions,
  getCreateChallengeMutationOptions,
  getGetChallengeQueryKey,
  getGetCurrentUserQueryKey,
  getGetHeadToHeadQueryKey,
  getGetMyAnalyticsQueryKey,
  getGetMyWeaknessQueryKey,
  useGetChallenge,
  useGetDuel,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ConnectionIndicator, LoadingState } from "@/components/common/StateBlocks";
import { AnimatedNumber } from "@/components/common/AnimatedNumber";
import { QuestionPanel } from "@/components/quiz/QuestionPanel";
import { HeadToHeadPanel } from "@/components/quiz/HeadToHeadPanel";
import { Countdown } from "@/components/quiz/Countdown";
import { CircularTimer } from "@/components/quiz/CircularTimer";
import { DisplayText3D } from "@/components/brand/DisplayText3D";
import { initialsOf } from "@/components/layout/AppShell";
import { createDuelService } from "@/lib/realtime";
import { toast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import { resolveCorrectKey, toUiQuestion } from "@/lib/questions";
import { useAuth } from "@/stores/auth";
import type { AnswerFeedback } from "@/components/quiz/AnswerOption";
import type { ConnectionState, DuelOpponent, DuelServerMessage, OptionKey, Question } from "@/types";

type Phase = "connecting" | "waiting" | "playing" | "finished" | "gone";

interface FinalResult {
  winnerId: number | null;
  ratingDelta: Record<string, number>;
  xpGained: Record<string, number>;
}

export default function DuelRoom() {
  const { id } = useParams<{ id: string }>();
  const duelId = Number(id);
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [showCountdown, setShowCountdown] = useState(true);
  const [phase, setPhase] = useState<Phase>("connecting");
  const [connection, setConnection] = useState<ConnectionState>("IDLE");
  const [question, setQuestion] = useState<Question | null>(null);
  const [index, setIndex] = useState(0);
  const [total, setTotal] = useState(0);
  const [timeLimit, setTimeLimit] = useState(15);
  const [secondsLeft, setSecondsLeft] = useState(15);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<OptionKey | null>(null);
  const [feedback, setFeedback] = useState<Partial<Record<OptionKey, AnswerFeedback>>>({});
  const [locked, setLocked] = useState(false);
  const [finalResult, setFinalResult] = useState<FinalResult | null>(null);
  const serviceRef = useRef<ReturnType<typeof createDuelService> | null>(null);
  const questionRef = useRef<Question | null>(null);
  const selectedRef = useRef<OptionKey | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const opponentIdRef = useRef(0);
  questionRef.current = question;
  selectedRef.current = selected;

  // Always resolve the opponent's identity from the duel summary (works even mid-game).
  const summaryQuery = useGetDuel(duelId);
  const opponent: DuelOpponent | null = useMemo(() => {
    const summary = summaryQuery.data;
    if (!summary || !user) return null;
    return summary.player1.user_id === user.id ? summary.player2 : summary.player1;
  }, [summaryQuery.data, user]);

  opponentIdRef.current = opponent?.user_id ?? 0;

  useEffect(() => {
    const summary = summaryQuery.data;
    // "gone" is included: for an already-finished duel the socket closes instantly and would otherwise
    // win the race against this (slower) REST summary, wrongly reporting "your opponent left".
    if (!summary || (phase !== "connecting" && phase !== "gone") || !user) return;
    if (summary.status === "completed") {
      const isPlayer1 = summary.player1.user_id === user.id;
      const myScore = isPlayer1 ? summary.player1_score : summary.player2_score;
      const oppScore = isPlayer1 ? summary.player2_score : summary.player1_score;
      const myBefore = isPlayer1 ? summary.player1_rating_before : summary.player2_rating_before;
      const myAfter = (isPlayer1 ? summary.player1_rating_after : summary.player2_rating_after) ?? myBefore;
      setScores({ [String(user.id)]: myScore, opponent: oppScore });
      setFinalResult({ winnerId: summary.winner_id ?? null, ratingDelta: { [String(user.id)]: Math.round((myAfter - myBefore) * 10) / 10 }, xpGained: {} });
      setPhase("finished");
    } else if (summary.status === "aborted") {
      setPhase("gone");
    }
  }, [summaryQuery.data, phase, user]);

  useEffect(() => {
    if (!Number.isFinite(duelId)) return;
    const service = createDuelService(duelId, {
      onConnection: setConnection,
      onError: () => setPhase((p) => (p === "connecting" ? "gone" : p)),
      onMessage: (message: DuelServerMessage) => {
        if (message.type === "waiting_for_opponent" || message.type === "opponent_joined") {
          setPhase("waiting");
        } else if (message.type === "question") {
          setQuestion(toUiQuestion(message.question));
          setIndex(message.index);
          setTotal(message.total);
          setTimeLimit(message.time_limit);
          setSecondsLeft(message.time_limit);
          setSelected(null);
          setFeedback({});
          setLocked(false);
          setPhase("playing");
        } else if (message.type === "score_update") {
          setScores(message.scores);
        } else if (message.type === "reveal") {
          setScores(message.scores);
          setLocked(true);
          const current = questionRef.current;
          const correctKey = current ? resolveCorrectKey(current, message.correct_answer) : null;
          const chosen = selectedRef.current;
          const next: Partial<Record<OptionKey, AnswerFeedback>> = {};
          if (correctKey) next[correctKey] = "correct";
          if (chosen && chosen !== correctKey) next[chosen] = "incorrect";
          setFeedback(next);
        } else if (message.type === "duel_end") {
          setScores(message.scores);
          setFinalResult({ winnerId: message.winner_id ?? null, ratingDelta: message.rating_delta ?? {}, xpGained: message.xp_gained ?? {} });
          setPhase("finished");
          void queryClient.invalidateQueries({ queryKey: getGetMyAnalyticsQueryKey() });
          void queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
          // The record and the weak-topic model both just changed (the duel's answers were graded server-side).
          void queryClient.invalidateQueries({ queryKey: getGetHeadToHeadQueryKey(opponentIdRef.current) });
          void queryClient.invalidateQueries({ queryKey: getGetMyWeaknessQueryKey() });
        } else if (message.type === "opponent_left") {
          setPhase("gone");
        }
      },
    });
    serviceRef.current = service;
    service.connect();
    return () => service.disconnect();
  }, [duelId, queryClient]);

  // Local visual countdown ring; the server remains authoritative on timing/scoring.
  useEffect(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    if (phase !== "playing" || locked) return;
    tickRef.current = setInterval(() => setSecondsLeft((v) => Math.max(0, v - 1)), 1000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [phase, locked, index]);

  function submit(choice: OptionKey) {
    if (locked || !question || !user) return;
    setSelected(choice);
    setLocked(true);
    serviceRef.current?.submitAnswer(index, choice);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (["a", "b", "c", "d"].includes(key)) submit(key as OptionKey);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked, question, user]);

  const myId = user ? String(user.id) : "";
  const myScore = scores[myId] ?? 0;
  const opponentEntry = Object.entries(scores).find(([uid]) => uid !== myId);
  const opponentScore = opponentEntry?.[1] ?? 0;

  if (phase === "finished" || phase === "gone") {
    return <DuelSummaryView phase={phase} finalResult={finalResult} myId={myId} myScore={myScore} opponentScore={opponentScore} opponent={opponent} />;
  }

  if (phase === "connecting" || phase === "waiting") {
    return <LoadingState label={phase === "waiting" ? "Waiting for your opponent…" : "Connecting to the duel…"} />;
  }

  return (
    <main className="flex min-h-[75vh] flex-col">
      {showCountdown ? <Countdown onDone={() => setShowCountdown(false)} /> : null}

      <header
        className="border-b border-border pb-3"
        style={{
          backgroundImage:
            "linear-gradient(90deg, hsl(var(--primary) / 0.08), transparent 45%, transparent 55%, hsl(var(--secondary) / 0.08))",
        }}
      >
        <div className="mx-auto grid max-w-3xl grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-4 pt-3">
          <PlayerBar corner="P1" name={user?.name || "You"} score={myScore} />
          <div className="relative flex shrink-0 items-center justify-center">
            <span className="font-display pointer-events-none absolute text-[10px] tracking-widest text-muted-foreground/70" style={{ top: -14 }}>
              VS
            </span>
            <CircularTimer secondsLeft={secondsLeft} total={timeLimit} size={48} />
          </div>
          <PlayerBar corner="P2" name={opponent?.name ?? "Opponent"} score={opponentScore} align="right" />
        </div>
        <div className="mx-auto mt-3 max-w-3xl px-4">
          <Progress value={total > 0 ? ((index + 1) / total) * 100 : 0} className="h-1" />
          <p className="numeric mt-1.5 text-center text-[11px] text-muted-foreground">
            Question {index + 1}/{total}
          </p>
        </div>
      </header>

      <section className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center py-4">
        <AnimatePresence mode="wait">
          {question ? (
            <motion.div
              key={question.id}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              <QuestionPanel question={question} selected={selected} feedback={feedback} disabled={locked} onSelect={submit} />
            </motion.div>
          ) : (
            <LoadingState label="Loading question…" />
          )}
        </AnimatePresence>
      </section>

      <footer className="safe-bottom py-3">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3">
          <ConnectionIndicator state={connection} />
          <p className="hidden text-xs text-muted-foreground sm:block">Press A · B · C · D to answer</p>
          <Button variant="ghost" size="sm" className="text-muted-foreground" asChild>
            <Link href="/">
              <Flag className="h-3.5 w-3.5" /> Leave
            </Link>
          </Button>
        </div>
      </footer>
    </main>
  );
}

function PlayerBar({
  corner,
  name,
  score,
  align = "left",
}: {
  corner: "P1" | "P2";
  name: string;
  score: number;
  align?: "left" | "right";
}) {
  const color = corner === "P1" ? "text-primary" : "text-secondary";
  const border = corner === "P1" ? "border-primary" : "border-secondary";
  return (
    <div className={`flex min-w-0 items-center gap-2.5 ${align === "right" ? "flex-row-reverse text-right" : ""}`}>
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[calc(var(--radius)-4px)] border-2 bg-card text-xs font-bold sm:h-12 sm:w-12 ${border} ${color}`}>
        {initialsOf(name)}
      </div>
      <div className="min-w-0">
        <p className={`numeric text-[10px] font-bold ${color}`}>{corner}</p>
        <p className="min-w-0 truncate text-xs font-semibold sm:text-sm">{name}</p>
      </div>
      <AnimatedNumber value={score} className={`numeric shrink-0 text-lg font-bold sm:text-xl ${color}`} />
    </div>
  );
}

function DuelSummaryView({
  phase,
  finalResult,
  myId,
  myScore,
  opponentScore,
  opponent,
}: {
  phase: "finished" | "gone";
  finalResult: FinalResult | null;
  myId: string;
  myScore: number;
  opponentScore: number;
  opponent: DuelOpponent | null;
}) {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [rematchState, setRematchState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [rematchChallengeId, setRematchChallengeId] = useState<number | null>(null);
  const createChallenge = useMutation(getCreateChallengeMutationOptions());
  const cancelChallenge = useMutation(getCancelChallengeMutationOptions());
  const rematchStatus = useGetChallenge(rematchChallengeId ?? 0, {
    query: { queryKey: getGetChallengeQueryKey(rematchChallengeId ?? 0), enabled: rematchChallengeId != null && rematchState === "sent", refetchInterval: 2000 },
  });

  useEffect(() => {
    const status = rematchStatus.data?.status;
    if (status === "accepted" && rematchStatus.data?.duel_match_id) {
      navigate(`/duel/${rematchStatus.data.duel_match_id}`);
    } else if (status === "declined" || status === "expired" || status === "cancelled") {
      setRematchState("idle");
      setRematchChallengeId(null);
      toast({ title: "Rematch not accepted", description: `${opponent?.name ?? "Your opponent"} didn't accept the rematch.` });
    }
  }, [rematchStatus.data, navigate, opponent]);

  if (phase === "gone" && !finalResult) {
    return (
      <div className="mx-auto max-w-md text-center">
        <div className="glass-panel p-8">
          <p className="text-lg font-semibold text-foreground">Your opponent left the duel</p>
          <p className="mt-2 text-sm text-muted-foreground">No rating change was applied.</p>
          <Button className="mt-6 w-full" asChild>
            <Link href="/">Back to Arena</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!finalResult) {
    return <LoadingState label="Loading result…" />;
  }

  const won = finalResult.winnerId != null && String(finalResult.winnerId) === myId;
  const draw = finalResult.winnerId == null;
  const delta = finalResult.ratingDelta[myId] ?? 0;
  const xp = finalResult.xpGained[myId] ?? 0;
  const tone = draw ? "muted" : won ? "primary" : "destructive";
  const newRating = Math.round((user?.user_rating ?? 1000) as number);

  async function sendRematch() {
    if (!opponent) return;
    setRematchState("sending");
    try {
      const challenge = await createChallenge.mutateAsync({ data: { opponent_id: opponent.user_id, num_questions: 10, time_per_question: 15 } });
      setRematchChallengeId(challenge.id);
      setRematchState("sent");
      toast({ title: "Rematch request sent", description: `Waiting for ${opponent.name} to respond.` });
    } catch (err) {
      setRematchState("error");
      toast({ title: "Couldn't send rematch", description: getErrorMessage(err), variant: "destructive" });
    }
  }

  async function cancelRematch() {
    if (rematchChallengeId == null) return;
    try {
      await cancelChallenge.mutateAsync({ challengeId: rematchChallengeId });
    } catch {
      // best-effort; it'll expire on its own if this fails
    } finally {
      setRematchState("idle");
      setRematchChallengeId(null);
    }
  }

  async function share() {
    const text = draw ? "I just drew a quiz1v1 duel!" : won ? "I just won a quiz1v1 duel!" : "I just played a quiz1v1 duel!";
    if (navigator.share) {
      try {
        await navigator.share({ title: "quiz1v1 duel", text, url: window.location.href });
        return;
      } catch {
        // user cancelled or share failed; fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast({ title: "Link copied", description: "Duel link copied to your clipboard." });
    } catch {
      toast({ title: "Couldn't share", description: "Copy the URL from your address bar instead.", variant: "destructive" });
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-6 flex items-center justify-between">
        <Button variant="outline" size="icon" aria-label="Home" asChild>
          <Link href="/">
            <Home className="h-4 w-4" />
          </Link>
        </Button>
        <Button variant="outline" size="icon" aria-label="Share result" onClick={() => void share()}>
          <Share2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="mb-2">
        <DisplayText3D text={draw ? "DRAW" : won ? "VICTORY" : "DEFEAT"} tone={tone} className="h-24" />
      </div>

      <div className="glass-panel p-6">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
          <div>
            <p className="numeric text-xs font-bold text-primary">P1</p>
            <p className="numeric text-4xl font-bold text-primary">{myScore}</p>
            <p className="mt-1 truncate text-sm font-medium text-muted-foreground">{user?.name ?? "You"}</p>
            <p className={`numeric mt-0.5 flex items-center justify-center gap-1 text-xs font-semibold ${delta >= 0 ? "text-primary" : "text-destructive"}`}>
              ({newRating}) {delta >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />} {delta >= 0 ? "+" : ""}
              {delta}
            </p>
          </div>
          <p className="font-display text-lg text-muted-foreground">VS</p>
          <div>
            <p className="numeric text-xs font-bold text-secondary">P2</p>
            <p className="numeric text-4xl font-bold text-secondary">{opponentScore}</p>
            <p className="mt-1 truncate text-sm font-medium text-muted-foreground">{opponent?.name ?? "Opponent"}</p>
            {opponent ? <p className="numeric mt-0.5 text-xs font-semibold text-muted-foreground">({Math.round(opponent.rating)})</p> : null}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <div className="rounded-[var(--radius)] border border-border bg-surface p-3 text-center">
            <p className="label-micro">Rating</p>
            <AnimatedNumber value={newRating} className="numeric mt-1 block text-xl font-bold text-foreground" />
          </div>
          <div className="rounded-[var(--radius)] border border-border bg-surface p-3 text-center">
            <p className="label-micro flex items-center justify-center gap-1">
              <Zap className="h-3 w-3 text-highlight" /> XP earned
            </p>
            <AnimatedNumber value={xp} className="numeric mt-1 block text-xl font-bold text-highlight" />
          </div>
        </div>

        {opponent ? (
          <div className="mt-4">
            <HeadToHeadPanel opponentId={opponent.user_id} opponentName={opponent.name} phase="after" />
          </div>
        ) : null}

        {rematchState === "sent" ? (
          <p className="mt-6 text-center text-xs text-muted-foreground">Waiting for {opponent?.name ?? "your opponent"} to respond…</p>
        ) : null}
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          {rematchState === "sent" ? (
            <Button variant="outline" className="flex-1" disabled={cancelChallenge.isPending} onClick={() => void cancelRematch()}>
              Cancel request
            </Button>
          ) : (
            <Button variant="outline" className="flex-1" disabled={!opponent || rematchState === "sending"} onClick={() => void sendRematch()}>
              <Swords className="h-4 w-4" /> {rematchState === "sending" ? "Sending…" : "Rematch"}
            </Button>
          )}
          <Button className="flex-1" onClick={() => navigate("/duel/matchmaking")}>
            New duel
          </Button>
        </div>
      </div>
    </div>
  );
}
