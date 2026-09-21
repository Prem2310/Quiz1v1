import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Clock, Flag, Home, Share2, Swords, TrendingDown, TrendingUp, XCircle, Zap } from "lucide-react";
import {
  getCancelChallengeMutationOptions,
  getCreateChallengeMutationOptions,
  getGetChallengeQueryKey,
  getGetCurrentUserQueryKey,
  getGetDuelReviewQueryKey,
  getGetHeadToHeadQueryKey,
  getGetMyAnalyticsQueryKey,
  getGetMyWeaknessQueryKey,
  useGetChallenge,
  useGetDuel,
  useGetDuelReview,
} from "@workspace/api-client-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ConnectionIndicator, ErrorState, LoadingState } from "@/components/common/StateBlocks";
import { AnimatedNumber } from "@/components/common/AnimatedNumber";
import { QuestionPanel } from "@/components/quiz/QuestionPanel";
import { HeadToHeadPanel } from "@/components/quiz/HeadToHeadPanel";
import { VersusSlots } from "@/components/quiz/VersusSlots";
import { DuelReviewCard } from "@/components/quiz/DuelReview";
import { LogoMark } from "@/components/brand/Logo";
import { Countdown } from "@/components/quiz/Countdown";
import { CircularTimer } from "@/components/quiz/CircularTimer";
import { DisplayText3D } from "@/components/brand/DisplayText3D";
import { initialsOf } from "@/components/layout/AppShell";
import { createDuelService } from "@/lib/realtime";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { shareNodeAsImage } from "@/lib/shareImage";
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
  /** each player's rating once the duel was applied (keyed by user id) — the auth store's copy can still be stale */
  ratingAfter: Record<string, number>;
}

export default function DuelRoom() {
  const { id } = useParams<{ id: string }>();
  const duelId = Number(id);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

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
  const [revealed, setRevealed] = useState(false);
  const [opponentAnswered, setOpponentAnswered] = useState(false);
  const [roundGain, setRoundGain] = useState(0);
  const [goneReason, setGoneReason] = useState<"left" | "lost">("left");
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [finalResult, setFinalResult] = useState<FinalResult | null>(null);
  const serviceRef = useRef<ReturnType<typeof createDuelService> | null>(null);
  const questionRef = useRef<Question | null>(null);
  const selectedRef = useRef<OptionKey | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const opponentIdRef = useRef(0);
  const myIdRef = useRef("");
  const scoreAtQuestionStartRef = useRef(0);
  const myScoreRef = useRef(0);
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
  myIdRef.current = user ? String(user.id) : "";

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
      const oppAfter = (isPlayer1 ? summary.player2_rating_after : summary.player1_rating_after) ?? (isPlayer1 ? summary.player2_rating_before : summary.player1_rating_before);
      const myXp = isPlayer1 ? summary.player1_xp : summary.player2_xp;
      setScores({ [String(user.id)]: myScore, opponent: oppScore });
      setFinalResult({
        winnerId: summary.winner_id ?? null,
        ratingDelta: { [String(user.id)]: Math.round((myAfter - myBefore) * 10) / 10 },
        xpGained: myXp != null ? { [String(user.id)]: myXp } : {},
        ratingAfter: { [String(user.id)]: myAfter, [String(isPlayer1 ? summary.player2.user_id : summary.player1.user_id)]: oppAfter },
      });
      setPhase("finished");
    } else if (summary.status === "aborted") {
      setPhase("gone");
    }
  }, [summaryQuery.data, phase, user]);

  useEffect(() => {
    if (!Number.isFinite(duelId)) return;
    const service = createDuelService(duelId, {
      onConnection: setConnection,
      onError: () =>
        setPhase((p) => {
          if (p !== "connecting") return p;
          setGoneReason("lost");
          return "gone";
        }),
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
          setRevealed(false);
          setOpponentAnswered(false);
          setRoundGain(0);
          scoreAtQuestionStartRef.current = myScoreRef.current;
          setPhase("playing");
        } else if (message.type === "score_update") {
          setScores(message.scores);
          setOpponentAnswered(message.answered?.some((uid) => uid !== myIdRef.current) ?? false);
        } else if (message.type === "reveal") {
          setScores(message.scores);
          setLocked(true);
          setRevealed(true);
          setRoundGain(Math.max(0, (message.scores[myIdRef.current] ?? 0) - scoreAtQuestionStartRef.current));
          const current = questionRef.current;
          const correctKey = current ? resolveCorrectKey(current, message.correct_answer) : null;
          const chosen = selectedRef.current;
          const next: Partial<Record<OptionKey, AnswerFeedback>> = {};
          if (correctKey) next[correctKey] = "correct";
          if (chosen && chosen !== correctKey) next[chosen] = "incorrect";
          setFeedback(next);
        } else if (message.type === "duel_end") {
          setScores(message.scores);
          setFinalResult({ winnerId: message.winner_id ?? null, ratingDelta: message.rating_delta ?? {}, xpGained: message.xp_gained ?? {}, ratingAfter: message.rating_after ?? {} });
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
  myScoreRef.current = myScore;
  const opponentEntry = Object.entries(scores).find(([uid]) => uid !== myId);
  const opponentScore = opponentEntry?.[1] ?? 0;

  if (phase === "finished" || phase === "gone") {
    return <DuelSummaryView duelId={duelId} phase={phase} goneReason={goneReason} finalResult={finalResult} myId={myId} myScore={myScore} opponentScore={opponentScore} opponent={opponent} />;
  }

  if (phase === "connecting") {
    return <LoadingState label="Connecting to the duel…" />;
  }

  if (phase === "waiting") {
    return (
      <div className="mx-auto max-w-lg space-y-6 py-6">
        <VersusSlots youName={user?.name ?? "You"} opponentName={opponent?.name ?? null} opponentRating={opponent?.rating ?? null} searching />
        <div className="space-y-1 text-center" role="status" aria-live="polite">
          <p className="font-display text-xl uppercase tracking-wide text-foreground">Waiting for {opponent?.name ?? "your opponent"}</p>
          <p className="text-sm text-muted-foreground">The duel starts the moment they join. Keep this tab open.</p>
        </div>
        <div className="flex justify-center">
          <Button variant="outline" size="lg" asChild>
            <Link href="/">Leave</Link>
          </Button>
        </div>
      </div>
    );
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
            <span className="font-display pointer-events-none absolute text-[11px] tracking-widest text-muted-foreground" style={{ top: -14 }}>
              VS
            </span>
            <CircularTimer secondsLeft={secondsLeft} total={timeLimit} size={48} />
          </div>
          <PlayerBar corner="P2" name={opponent?.name ?? "Opponent"} score={opponentScore} align="right" />
        </div>
        <div className="mx-auto mt-3 max-w-3xl px-4">
          <Progress value={total > 0 ? ((index + 1) / total) * 100 : 0} className="h-1" />
          <p className="numeric mt-1.5 text-center text-xs text-muted-foreground">
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

        <RoundStatus
          className="mx-auto mt-4 w-full max-w-2xl px-4"
          locked={locked}
          revealed={revealed}
          selected={selected}
          feedback={feedback}
          opponentAnswered={opponentAnswered}
          opponentName={opponent?.name ?? "Your opponent"}
          gain={roundGain}
        />
      </section>

      <footer className="safe-bottom py-3">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3">
          <ConnectionIndicator state={connection} />
          <p className="hidden text-xs text-muted-foreground sm:block">Press A · B · C · D to answer</p>
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setConfirmLeave(true)}>
            <Flag className="h-3.5 w-3.5" /> Leave
          </Button>
        </div>
      </footer>

      <AlertDialog open={confirmLeave} onOpenChange={setConfirmLeave}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave this duel?</AlertDialogTitle>
            <AlertDialogDescription>
              The duel ends for both players and no rating change is applied. Your answers so far won't count.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep playing</AlertDialogCancel>
            <AlertDialogAction onClick={() => navigate("/")}>Leave duel</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

/** One live line under the question: what just happened and what we're waiting on. */
function RoundStatus({
  className,
  locked,
  revealed,
  selected,
  feedback,
  opponentAnswered,
  opponentName,
  gain,
}: {
  className?: string;
  locked: boolean;
  revealed: boolean;
  selected: OptionKey | null;
  feedback: Partial<Record<OptionKey, AnswerFeedback>>;
  opponentAnswered: boolean;
  opponentName: string;
  gain: number;
}) {
  let tone = "text-muted-foreground";
  let icon = <Clock className="h-4 w-4 shrink-0" />;
  let text = "Pick an answer — faster answers score more.";
  if (revealed) {
    const correct = selected != null && feedback[selected] === "correct";
    if (correct) {
      tone = "text-primary";
      icon = <CheckCircle2 className="h-4 w-4 shrink-0" />;
      text = `Correct +${gain}`;
    } else {
      tone = "text-destructive";
      icon = <XCircle className="h-4 w-4 shrink-0" />;
      text = selected ? "Not quite" : "Time's up";
    }
  } else if (locked) {
    text = opponentAnswered ? "Locked in — revealing…" : `Locked in — waiting for ${opponentName}…`;
  } else if (opponentAnswered) {
    tone = "text-warning";
    text = `${opponentName} has answered — you're up!`;
  }
  return (
    <div className={className} aria-live="polite">
      <p className={`flex items-center justify-center gap-2 text-center text-sm font-medium ${tone}`}>
        {icon} {text}
      </p>
    </div>
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
        <p className={`numeric text-[11px] font-bold ${color}`}>{corner}</p>
        <p className="min-w-0 truncate text-sm font-semibold">{name}</p>
      </div>
      <AnimatedNumber value={score} className={`numeric shrink-0 text-lg font-bold sm:text-xl ${color}`} />
    </div>
  );
}

function DuelSummaryView({
  duelId,
  phase,
  goneReason,
  finalResult,
  myId,
  myScore,
  opponentScore,
  opponent,
}: {
  duelId: number;
  phase: "finished" | "gone";
  goneReason: "left" | "lost";
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
  const [sharing, setSharing] = useState(false);
  const [reviewFilter, setReviewFilter] = useState<"all" | "missed">("all");
  const cardRef = useRef<HTMLDivElement>(null);
  const createChallenge = useMutation(getCreateChallengeMutationOptions());
  const cancelChallenge = useMutation(getCancelChallengeMutationOptions());
  const rematchStatus = useGetChallenge(rematchChallengeId ?? 0, {
    query: { queryKey: getGetChallengeQueryKey(rematchChallengeId ?? 0), enabled: rematchChallengeId != null && rematchState === "sent", refetchInterval: 2000 },
  });
  const summaryQuery = useGetDuel(duelId);
  const reviewQuery = useGetDuelReview(duelId, {
    query: { queryKey: getGetDuelReviewQueryKey(duelId), enabled: phase === "finished" && Number.isFinite(duelId) },
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
          <p className="text-lg font-semibold text-foreground">
            {goneReason === "lost" ? "Couldn't connect to the duel" : `${opponent?.name ?? "Your opponent"} left the duel`}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {goneReason === "lost" ? "Check your connection and try again. No rating change was applied." : "No rating change was applied."}
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" className="flex-1" asChild>
              <Link href="/">Back to Arena</Link>
            </Button>
            <Button className="flex-1" onClick={() => navigate("/duel/matchmaking")}>
              <Swords className="h-4 w-4" /> Find a new duel
            </Button>
          </div>
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
  const newRating = Math.round(finalResult.ratingAfter[myId] ?? user?.user_rating ?? 1000);
  const opponentName = opponent?.name ?? "Opponent";

  const meIsP1 = summaryQuery.data && user ? summaryQuery.data.player1.user_id === user.id : null;
  const review = meIsP1 == null ? undefined : reviewQuery.data;
  const myResults = review?.map((r) => (meIsP1 ? r.player1 : r.player2).is_correct);
  const opponentResults = review?.map((r) => (meIsP1 ? r.player2 : r.player1).is_correct);
  const missed = review?.map((r, i) => ({ r, i })).filter(({ i }) => !myResults?.[i]) ?? [];
  const shown = review?.map((r, i) => ({ r, i })).filter(({ i }) => reviewFilter === "all" || !myResults?.[i]) ?? [];

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

  /** Shares a picture of the result card. (The duel URL is participants-only, so a link would be useless to anyone else.) */
  async function share() {
    const node = cardRef.current;
    if (!node || sharing) return;
    setSharing(true);
    const text = draw ? "I just drew a quiz1v1 duel!" : won ? "I just won a quiz1v1 duel!" : "I just played a quiz1v1 duel!";
    try {
      const outcome = await shareNodeAsImage(node, { filename: `quiz1v1-duel-${duelId}.png`, title: "quiz1v1 duel", text });
      if (outcome === "downloaded") toast({ title: "Result image saved", description: "Attach it to a message or story to share." });
    } catch {
      toast({ title: "Couldn't create the image", description: "Take a screenshot of the result card instead.", variant: "destructive" });
    } finally {
      setSharing(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl pb-8">
      <div className="mb-4 flex items-center justify-between">
        <Button variant="outline" size="icon" aria-label="Home" asChild>
          <Link href="/">
            <Home className="h-4 w-4" />
          </Link>
        </Button>
        <Button variant="outline" disabled={sharing} onClick={() => void share()}>
          <Share2 className="h-4 w-4" /> {sharing ? "Preparing image…" : "Share result"}
        </Button>
      </div>

      <div ref={cardRef} className="glass-panel bg-background p-5 sm:p-6">
        <DisplayText3D text={draw ? "DRAW" : won ? "VICTORY" : "DEFEAT"} tone={tone} className="h-20 sm:h-24" />

        <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
          <ScoreColumn corner="P1" name={user?.name ?? "You"} score={myScore} rating={newRating} delta={delta} />
          <p className="font-display text-xl text-muted-foreground">VS</p>
          <ScoreColumn
            corner="P2"
            name={opponentName}
            score={opponentScore}
            rating={opponent ? Math.round(finalResult.ratingAfter[String(opponent.user_id)] ?? opponent.rating) : null}
            delta={opponent ? finalResult.ratingDelta[String(opponent.user_id)] ?? null : null}
          />
        </div>

        {myResults && opponentResults ? (
          <div className="mt-5 space-y-2 border-t border-border pt-4">
            <RoundPips label="You" results={myResults} tone="primary" />
            <RoundPips label={opponentName} results={opponentResults} tone="secondary" />
          </div>
        ) : null}

        <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4">
          {/* XP only arrives with the live end-of-duel message, so it's unknown when reopening a finished duel. */}
          {myId in finalResult.xpGained ? (
            <p className="numeric flex items-center gap-1.5 text-base font-bold text-highlight">
              <Zap className="h-4 w-4" />
              <span>
                +<AnimatedNumber value={xp} /> XP
              </span>
            </p>
          ) : (
            <span />
          )}
          <span className="flex items-center gap-2 text-muted-foreground">
            <LogoMark className="h-5 w-5" />
            <span className="font-display text-sm uppercase tracking-widest">quiz1v1</span>
          </span>
        </div>
      </div>

      {opponent ? (
        <div className="mt-4">
          <HeadToHeadPanel opponentId={opponent.user_id} opponentName={opponent.name} phase="after" />
        </div>
      ) : null}

      {rematchState === "sent" ? <p className="mt-4 text-center text-sm text-muted-foreground">Waiting for {opponentName} to respond…</p> : null}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        {rematchState === "sent" ? (
          <Button variant="outline" size="lg" className="flex-1" disabled={cancelChallenge.isPending} onClick={() => void cancelRematch()}>
            Cancel request
          </Button>
        ) : (
          <Button variant="outline" size="lg" className="flex-1" disabled={!opponent || rematchState === "sending"} onClick={() => void sendRematch()}>
            <Swords className="h-4 w-4" /> {rematchState === "sending" ? "Sending…" : "Rematch"}
          </Button>
        )}
        <Button size="lg" className="flex-1" onClick={() => navigate("/duel/matchmaking")}>
          New duel
        </Button>
      </div>

      <section className="mt-10" aria-labelledby="duel-review-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="duel-review-heading" className="font-display text-2xl uppercase tracking-wide text-foreground">
            Question review
          </h2>
          {review && review.length > 0 ? (
            <div className="flex gap-1.5">
              <ReviewFilter active={reviewFilter === "all"} onClick={() => setReviewFilter("all")}>
                All ({review.length})
              </ReviewFilter>
              <ReviewFilter active={reviewFilter === "missed"} onClick={() => setReviewFilter("missed")}>
                You missed ({missed.length})
              </ReviewFilter>
            </div>
          ) : null}
        </div>

        <p className="mt-2 text-base text-muted-foreground">
          A correct answer scores 10 plus up to 10 for speed; wrong or missed scores 0. Points decide the duel, so two fast answers can beat three slow ones.
        </p>
        <div className="mt-4 space-y-4">
          {reviewQuery.isError ? (
            <ErrorState title="Couldn't load the review" message="The questions and answers for this duel didn't load." onRetry={() => void reviewQuery.refetch()} />
          ) : !review ? (
            <LoadingState label="Loading question review…" />
          ) : shown.length === 0 ? (
            <p className="py-6 text-center text-base text-muted-foreground">{review.length === 0 ? "No questions to review." : "You got every question right."}</p>
          ) : (
            shown.map(({ r, i }) => <DuelReviewCard key={r.question_id} review={r} index={i} meIsP1={meIsP1 === true} opponentName={opponentName} />)
          )}
        </div>
      </section>
    </div>
  );
}

function ScoreColumn({
  corner,
  name,
  score,
  rating,
  delta,
}: {
  corner: "P1" | "P2";
  name: string;
  score: number;
  rating: number | null;
  delta: number | null;
}) {
  const color = corner === "P1" ? "text-primary" : "text-secondary";
  return (
    <div className="min-w-0">
      <p className={`numeric text-sm font-bold ${color}`}>{corner}</p>
      <p className={`numeric text-5xl font-bold leading-tight ${color}`}>{score}</p>
      <p className="mt-1 truncate text-base font-semibold text-foreground">{name}</p>
      <p className="numeric mt-0.5 flex items-center justify-center gap-1.5 text-sm font-semibold text-muted-foreground">
        {rating != null ? <span>{rating}</span> : null}
        {delta != null ? (
          <span className={`flex items-center gap-0.5 ${delta >= 0 ? "text-primary" : "text-destructive"}`}>
            {delta >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            {delta >= 0 ? "+" : ""}
            {delta}
          </span>
        ) : null}
      </p>
    </div>
  );
}

/** One square per question — filled in the player's corner color when they got it right. */
function RoundPips({ label, results, tone }: { label: string; results: boolean[]; tone: "primary" | "secondary" }) {
  const right = results.filter(Boolean).length;
  const fill = tone === "primary" ? "bg-primary" : "bg-secondary";
  const text = tone === "primary" ? "text-primary" : "text-secondary";
  return (
    <div className="flex items-center gap-3" role="img" aria-label={`${label}: ${right} of ${results.length} correct`}>
      <span className="w-20 shrink-0 truncate text-sm font-semibold text-muted-foreground">{label}</span>
      <div className="flex flex-1 gap-1" aria-hidden>
        {results.map((ok, i) => (
          <span key={i} className={`h-3 flex-1 rounded-[2px] border ${ok ? `${fill} border-transparent` : "border-border"}`} />
        ))}
      </div>
      <span className={`numeric w-12 shrink-0 text-right text-sm font-bold ${text}`}>
        {right}/{results.length}
      </span>
    </div>
  );
}

function ReviewFilter({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "min-h-9 rounded-full border px-3.5 py-1.5 text-sm font-medium transition",
        active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
