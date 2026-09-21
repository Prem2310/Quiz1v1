import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useSearch } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Check, Brain, Flag, RotateCcw, Sparkles, XCircle } from "lucide-react";
import {
  getCompleteQuizMutationOptions,
  getCreateQuizMutationOptions,
  getGetMyAnalyticsQueryKey,
  getGetMyWeaknessQueryKey,
  getListSubtopicsQueryKey,
  getStartQuizMutationOptions,
  useGetMyAnalytics,
  useGetMyWeakness,
  useListSubtopics,
  useListTopics,
  QuizCreateQuizMode,
  type Question as ApiQuestion,
  type QuizComplete,
  type SubtopicWeakness,
} from "@workspace/api-client-react";
import { PageHeader } from "@/components/common/PageHeader";
import { AnimatedNumber } from "@/components/common/AnimatedNumber";
import { LoadingState, ErrorState } from "@/components/common/StateBlocks";
import { QuestionPanel } from "@/components/quiz/QuestionPanel";
import { CircularTimer } from "@/components/quiz/CircularTimer";
import { QuestionReviewCard } from "@/components/quiz/QuestionReviewCard";
import { WeakSpotList, isWeakSpot } from "@/components/quiz/WeakSpotList";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { iconForTopic } from "@/constants/topics";
import { HoverCard, Reveal, StaggerGroup, StaggerItem } from "@/components/common/Motion";
import { useCountdownTimer } from "@/hooks/useCountdownTimer";
import { toast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import { toUiQuestion } from "@/lib/questions";
import type { OptionKey, Question } from "@/types";

const NUM_QUESTIONS_OPTIONS = [5, 10, 15, 20];
const TIME_OPTIONS = [15, 30, 45];
const OPTION_KEYS: OptionKey[] = ["a", "b", "c", "d"];

type Phase = "pick" | "session" | "grading" | "result";
type ReviewFilter = "all" | "correct" | "incorrect";

interface LocalAnswer {
  selected: OptionKey | null;
  timeTaken: number;
}

interface SessionConfig {
  mode: QuizCreateQuizMode;
  topicId: number | null;
  subtopicId: number | null;
}

const idParam = (value: string | null) => (value && /^\d+$/.test(value) ? Number(value) : null);

export default function PracticePage() {
  const search = useSearch();
  // Deep links (Arena "Review now", Progress "Drill") preselect the mode and scope.
  const params = new URLSearchParams(search);
  const wantsWeak = params.get("mode") === "weak_topics";

  const [phase, setPhase] = useState<Phase>("pick");
  const [topicId, setTopicId] = useState<number | null>(() => idParam(params.get("topic")));
  const [subtopicId, setSubtopicId] = useState<number | null>(() => idParam(params.get("subtopic")));
  const [mode, setMode] = useState<QuizCreateQuizMode>(wantsWeak ? QuizCreateQuizMode.weak_topics : QuizCreateQuizMode.practice);
  const [numQuestions, setNumQuestions] = useState(10);
  const [timePerQuestion, setTimePerQuestion] = useState(30);

  const [attemptId, setAttemptId] = useState<number | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<OptionKey | null>(null);
  const [locked, setLocked] = useState(false);
  const [result, setResult] = useState<QuizComplete | null>(null);
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("all");
  const answersRef = useRef<Map<string, LocalAnswer>>(new Map());

  const queryClient = useQueryClient();
  const topicsQuery = useListTopics();
  const subtopicsQuery = useListSubtopics(topicId ?? 0, {
    query: { queryKey: getListSubtopicsQueryKey(topicId ?? 0), enabled: topicId != null },
  });
  const analyticsQuery = useGetMyAnalytics();
  const weakSpots = (useGetMyWeakness({ limit: 12 }).data ?? []).filter(isWeakSpot).slice(0, 4);

  const createQuiz = useMutation(getCreateQuizMutationOptions());
  const startQuiz = useMutation(getStartQuizMutationOptions());
  const completeQuiz = useMutation(getCompleteQuizMutationOptions());

  const currentQuestion = questions[index] ?? null;
  const secondsLeftRef = useRef(timePerQuestion);
  const secondsLeft = useCountdownTimer(
    timePerQuestion,
    currentQuestion?.id ?? "none",
    () => {
      if (!locked) recordAnswer(null);
    },
    phase === "session" && !locked,
  );
  secondsLeftRef.current = secondsLeft;

  // `override` lets one-click actions (drill a weak spot, drill your misses) start immediately with their own scope.
  async function handleStart(override?: SessionConfig) {
    const config = override ?? { mode, topicId, subtopicId };
    if (override) {
      setMode(override.mode);
      setTopicId(override.topicId);
      setSubtopicId(override.subtopicId);
    }
    try {
      const quiz = await createQuiz.mutateAsync({
        data: { topic_id: config.topicId, subtopic_id: config.subtopicId, num_questions: numQuestions, time_per_question: timePerQuestion, quiz_mode: config.mode },
      });
      if (quiz.question_ids.length < numQuestions) {
        toast({ title: "Fewer questions than requested", description: `Only ${quiz.question_ids.length} question${quiz.question_ids.length === 1 ? "" : "s"} available for this selection — starting with those.` });
      }
      const started = await startQuiz.mutateAsync({ quizId: quiz.id });
      answersRef.current = new Map();
      setAttemptId(started.attempt_id);
      setQuestions(started.questions.map((q: ApiQuestion) => toUiQuestion(q)));
      setIndex(0);
      setSelected(null);
      setLocked(false);
      setResult(null);
      setPhase("session");
    } catch (err) {
      toast({ title: "Couldn't start practice", description: getErrorMessage(err), variant: "destructive" });
    }
  }

  // No network call per answer: just remember the pick locally and move on.
  function recordAnswer(choice: OptionKey | null) {
    if (locked || !currentQuestion) return;
    setSelected(choice);
    setLocked(true);
    answersRef.current.set(currentQuestion.id, { selected: choice, timeTaken: timePerQuestion - secondsLeftRef.current });
    window.setTimeout(advance, 450);
  }

  function advance() {
    if (index + 1 < questions.length) {
      setIndex((v) => v + 1);
      setSelected(null);
      setLocked(false);
      return;
    }
    void finish();
  }

  async function finish() {
    if (attemptId == null) return;
    setPhase("grading");
    try {
      const responses = questions.map((q) => {
        const answer = answersRef.current.get(q.id);
        return { question_id: q.id, selected_answer: answer?.selected ?? null, time_taken: answer?.timeTaken ?? timePerQuestion };
      });
      const final = await completeQuiz.mutateAsync({ attemptId, data: { responses } });
      setResult(final);
      setReviewFilter("all");
      void queryClient.invalidateQueries({ queryKey: getGetMyAnalyticsQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getGetMyWeaknessQueryKey() });
      setPhase("result");
    } catch (err) {
      toast({ title: "Couldn't finish this session", description: getErrorMessage(err), variant: "destructive" });
      setPhase("session");
    }
  }

  // A / B / C / D keyboard shortcuts during play.
  useEffect(() => {
    if (phase !== "session") return;
    function onKey(e: KeyboardEvent) {
      const key = e.key.toLowerCase();
      if (OPTION_KEYS.includes(key as OptionKey)) recordAnswer(key as OptionKey);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, locked, currentQuestion?.id]);

  function reset() {
    setPhase("pick");
    setAttemptId(null);
    setQuestions([]);
    setResult(null);
  }

  const indexedReview = useMemo(() => (result?.review ?? []).map((review, originalIndex) => ({ review, originalIndex })), [result]);
  const filteredReview = useMemo(() => {
    if (reviewFilter === "all") return indexedReview;
    if (reviewFilter === "correct") return indexedReview.filter((r) => r.review.is_correct);
    return indexedReview.filter((r) => !r.review.is_correct);
  }, [indexedReview, reviewFilter]);

  if (phase === "session" && currentQuestion) {
    const progress = questions.length ? ((index + 1) / questions.length) * 100 : 0;
    const activeTopic = topicsQuery.data?.find((t) => t.id === topicId);
    const activeSubtopic = subtopicsQuery.data?.find((st) => st.id === subtopicId);
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-2xl flex-col justify-center">
        <div className="border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <div className="min-w-0">
              <p className="numeric text-[10px] font-bold text-primary">P1 · SOLO</p>
              <p className="truncate text-xs font-semibold text-foreground">
                {activeSubtopic?.name ?? activeTopic?.name ?? "Mixed practice"}
              </p>
            </div>
            <p className="numeric shrink-0 text-xs font-semibold text-muted-foreground">
              {index + 1} / {questions.length}
            </p>
            <CircularTimer secondsLeft={secondsLeft} total={timePerQuestion} size={40} />
          </div>
          <Progress value={progress} className="h-1 rounded-none border-0" />
        </div>
        <div className="mt-6">
          <QuestionPanel question={currentQuestion} selected={selected} feedback={{}} disabled={locked} onSelect={recordAnswer} />
        </div>
        <div className="mt-6 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Press A · B · C · D to answer</p>
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={reset}>
            <Flag className="h-3.5 w-3.5" /> Quit
          </Button>
        </div>
      </div>
    );
  }

  if (phase === "grading") {
    return <LoadingState label="Grading your answers…" />;
  }

  if (phase === "result" && result) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-8 text-center">
          <p className="font-display text-2xl uppercase tracking-wide text-foreground">Session complete</p>
          <AnimatedNumber value={result.accuracy} suffix="%" decimals={0} className="numeric mt-2 block text-5xl font-bold text-primary" />
          <p className="mt-1 text-sm text-muted-foreground">accuracy</p>
          <div className="mt-6 grid grid-cols-3 gap-4">
            <ResultStat label="Correct" value={result.total_correct} tone="text-primary" />
            <ResultStat label="Missed" value={result.total_incorrect} tone="text-destructive" />
            <ResultStat label="XP" value={result.xp_gained ?? 0} tone="text-highlight" />
          </div>
          {result.total_incorrect > 0 ? (
            <div className="mt-8 border border-secondary/60 bg-secondary/5 p-4 text-left">
              <p className="text-sm font-semibold text-foreground">
                {result.total_incorrect} question{result.total_incorrect === 1 ? "" : "s"} to lock in
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">Missed questions come back first, until you answer them right.</p>
              <Button
                className="mt-3 w-full"
                variant="secondary"
                disabled={createQuiz.isPending || startQuiz.isPending}
                onClick={() => void handleStart({ mode: QuizCreateQuizMode.weak_topics, topicId, subtopicId })}
              >
                <Sparkles className="h-4 w-4" /> {createQuiz.isPending || startQuiz.isPending ? "Preparing…" : "Drill my misses"}
              </Button>
            </div>
          ) : null}
          <div className={`flex flex-col gap-2 sm:flex-row ${result.total_incorrect > 0 ? "mt-3" : "mt-8"}`}>
            <Button className="flex-1" variant={result.total_incorrect > 0 ? "outline" : "default"} onClick={reset}>
              <RotateCcw className="h-4 w-4" /> Practice again
            </Button>
            <Button variant="outline" className="flex-1" asChild>
              <Link href="/">Back to Arena</Link>
            </Button>
          </div>
        </motion.div>

        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Review your answers</h2>
            <div className="flex gap-1.5">
              <FilterChip active={reviewFilter === "all"} onClick={() => setReviewFilter("all")}>
                All ({result.review?.length ?? 0})
              </FilterChip>
              <FilterChip active={reviewFilter === "correct"} onClick={() => setReviewFilter("correct")}>
                <CheckCircle2 className="h-3 w-3" /> {result.total_correct}
              </FilterChip>
              <FilterChip active={reviewFilter === "incorrect"} onClick={() => setReviewFilter("incorrect")}>
                <XCircle className="h-3 w-3" /> {result.total_incorrect}
              </FilterChip>
            </div>
          </div>
          <div className="space-y-3">
            {filteredReview.map(({ review, originalIndex }) => (
              <QuestionReviewCard key={review.question_id} review={review} index={originalIndex} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <Reveal>
        <PageHeader title="Choose what to drill" description="Pick a scope and quiz1v1 builds the session: what you missed first, then new questions from your weaker areas." />
      </Reveal>

      <Reveal delay={0.05}>
        <p className="label-micro mb-3">Mode</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <HoverCard className="sm:col-span-2">
            <ModeCard
              corner="P1"
              icon={Brain}
              title="Smart practice"
              body="Questions you're due to review, then new ones weighted toward your weaker subtopics. Nothing repeats until you've seen it all."
              active={mode === QuizCreateQuizMode.practice}
              onClick={() => setMode(QuizCreateQuizMode.practice)}
            />
          </HoverCard>
          <HoverCard>
            <ModeCard
              corner="P2"
              icon={Sparkles}
              title="Weak topics"
              body={
                analyticsQuery.data && analyticsQuery.data.due_for_review > 0
                  ? `${analyticsQuery.data.due_for_review} due for review now.`
                  : "Nothing due yet. Misses from any session land here."
              }
              active={mode === QuizCreateQuizMode.weak_topics}
              onClick={() => setMode(QuizCreateQuizMode.weak_topics)}
            />
          </HoverCard>
        </div>
      </Reveal>

      {weakSpots.length > 0 ? (
        <Reveal delay={0.08}>
          <div className="mb-3 flex items-center justify-between">
            <p className="label-micro">Your weak spots</p>
            <Link href="/progress" className="text-xs font-semibold text-primary hover:underline">
              See all →
            </Link>
          </div>
          <WeakSpotList
            items={weakSpots}
            disabled={createQuiz.isPending || startQuiz.isPending}
            onDrill={(item: SubtopicWeakness) =>
              void handleStart({ mode: QuizCreateQuizMode.weak_topics, topicId: item.topic_id, subtopicId: item.subtopic_id })
            }
          />
        </Reveal>
      ) : null}

      <div>
        <p className="label-micro mb-3">Topic</p>
        {topicsQuery.isPending ? (
          <LoadingState label="Loading topics…" />
        ) : topicsQuery.isError ? (
          <ErrorState message="Could not load topics." onRetry={() => void topicsQuery.refetch()} />
        ) : !topicsQuery.data?.length ? (
          <ErrorState title="No topics yet" message="Ask an admin to import the question bank." />
        ) : (
          <StaggerGroup className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {topicsQuery.data.map((topic) => {
              const Icon = iconForTopic(topic.slug);
              const active = topicId === topic.id;
              return (
                <StaggerItem key={topic.id}>
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      setTopicId(active ? null : topic.id);
                      setSubtopicId(null);
                    }}
                    className={`relative flex w-full items-center gap-3 border-2 bg-surface p-4 text-left transition ${active ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
                  >
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center border-2 transition-colors ${active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-primary/10 text-primary"}`}>
                      <Icon className="h-4.5 w-4.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{topic.name}</p>
                      {topic.description ? <p className="truncate text-xs text-muted-foreground">{topic.description}</p> : null}
                    </div>
                    <AnimatePresence>
                      {active ? (
                        <motion.div
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0, opacity: 0 }}
                          transition={{ duration: 0.15 }}
                          className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-[calc(var(--radius)-6px)] bg-primary text-primary-foreground"
                        >
                          <Check className="h-3 w-3" />
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </motion.button>
                </StaggerItem>
              );
            })}
          </StaggerGroup>
        )}
      </div>

      <AnimatePresence>
        {topicId != null && subtopicsQuery.data && subtopicsQuery.data.length > 0 ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <p className="label-micro mb-3">Subtopic</p>
            <div className="flex flex-wrap gap-2">
              <Chip active={subtopicId === null} onClick={() => setSubtopicId(null)}>
                All subtopics
              </Chip>
              {subtopicsQuery.data.map((st) => (
                <Chip key={st.id} active={subtopicId === st.id} onClick={() => setSubtopicId(st.id)}>
                  {st.name}
                </Chip>
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <Reveal delay={0.1} className="surface-panel flex flex-wrap items-center gap-6 p-5">
        <OptionGroup<number> label="Questions" values={NUM_QUESTIONS_OPTIONS} selected={numQuestions} onSelect={setNumQuestions} />
        <OptionGroup<number> label="Seconds / question" values={TIME_OPTIONS} selected={timePerQuestion} onSelect={setTimePerQuestion} />
      </Reveal>

      <Reveal delay={0.15} className="flex flex-wrap items-center gap-4">
        <Button size="lg" className="w-full sm:w-auto" onClick={() => void handleStart()} disabled={createQuiz.isPending || startQuiz.isPending}>
          {createQuiz.isPending || startQuiz.isPending ? "Preparing…" : "Start session"}
        </Button>
        <p className="numeric text-xs text-muted-foreground">
          {numQuestions} questions · {timePerQuestion}s each ·{" "}
          {subtopicsQuery.data?.find((st) => st.id === subtopicId)?.name ?? topicsQuery.data?.find((t) => t.id === topicId)?.name ?? "All topics"} ·{" "}
          {mode === QuizCreateQuizMode.weak_topics ? "weak topics" : "smart practice"}
        </p>
      </Reveal>
    </div>
  );
}

function ModeCard({
  corner,
  icon: Icon,
  title,
  body,
  active,
  onClick,
}: {
  corner: "P1" | "P2";
  icon: typeof Brain;
  title: string;
  body: string;
  active: boolean;
  onClick: () => void;
}) {
  const isP1 = corner === "P1";
  const cornerColor = isP1 ? "text-primary" : "text-secondary";
  const cornerBorder = isP1 ? "border-primary" : "border-secondary";
  const border = active
    ? isP1
      ? "border-primary bg-primary/5 glow-primary"
      : "border-secondary bg-secondary/5 glow-secondary"
    : isP1
      ? "border-border hover:border-primary/50"
      : "border-border hover:border-secondary/50";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex h-full min-h-0 w-full flex-col justify-between border-2 bg-surface p-4 text-left transition-shadow sm:min-h-36 sm:p-5 ${border}`}
    >
      <div className={`numeric absolute right-4 top-4 text-xs font-bold ${cornerColor}`}>{corner}</div>
      <div>
        <div className={`flex h-10 w-10 items-center justify-center border-2 ${cornerBorder} ${cornerColor}`}>
          <Icon className="h-5 w-5" />
        </div>
        <h3 className="mt-3 text-sm font-semibold text-foreground">{title}</h3>
        <p className="mt-1.5 max-w-xs text-xs text-muted-foreground">{body}</p>
      </div>
      <div
        className={`mt-3 flex h-5 w-5 shrink-0 sm:mt-4 items-center justify-center border-2 ${
          active ? `${cornerBorder} ${isP1 ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}` : "border-border"
        }`}
      >
        {active ? <Check className="h-3 w-3" /> : null}
      </div>
    </button>
  );
}

function ResultStat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div>
      <p className={`numeric text-xl font-bold ${tone}`}>{value}</p>
      <p className="label-micro mt-0.5">{label}</p>
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
        active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
        active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function OptionGroup<T extends string | number>({
  label,
  values,
  selected,
  onSelect,
  labels,
}: {
  label: string;
  values: T[];
  selected: T;
  onSelect: (v: T) => void;
  labels?: Partial<Record<string, string>>;
}) {
  return (
    <div>
      <p className="label-micro mb-2">{label}</p>
      <div className="flex gap-1.5">
        {values.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onSelect(v)}
            className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
              selected === v ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {labels?.[String(v)] ?? v}
          </button>
        ))}
      </div>
    </div>
  );
}
