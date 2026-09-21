import { Check, MinusCircle, X } from "lucide-react";
import { SafeHtml } from "@/components/common/SafeHtml";
import { resolveCorrectKey, toUiQuestion } from "@/lib/questions";
import { cn } from "@/lib/utils";
import type { OptionKey } from "@/types";
import type { DuelPlayerAnswer, DuelQuestionReview } from "@workspace/api-client-react";

const OPTION_KEYS: OptionKey[] = ["a", "b", "c", "d"];

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** "You" (P1 cyan) or the opponent (P2 coral) — the corner colors carry identity, the icon carries right/wrong. */
function PlayerTag({ mine, name }: { mine: boolean; name: string }) {
  return (
    <span
      className={cn(
        "numeric max-w-24 truncate rounded-[calc(var(--radius)-4px)] border px-1.5 py-0.5 text-xs font-bold",
        mine ? "border-primary text-primary" : "border-secondary text-secondary",
      )}
    >
      {mine ? "You" : firstName(name)}
    </span>
  );
}

function Verdict({ mine, name, answer }: { mine: boolean; name: string; answer: DuelPlayerAnswer }) {
  const skipped = answer.selected_answer == null;
  const Icon = skipped ? MinusCircle : answer.is_correct ? Check : X;
  return (
    <div className="flex min-w-0 items-center gap-2 border border-border bg-surface px-2.5 py-2">
      <PlayerTag mine={mine} name={name} />
      <span className={cn("flex min-w-0 items-center gap-1 text-sm font-semibold", skipped ? "text-muted-foreground" : answer.is_correct ? "text-primary" : "text-destructive")}>
        <Icon className="h-4 w-4 shrink-0" />
        <span className="truncate">{skipped ? "No answer" : answer.is_correct ? "Correct" : "Wrong"}</span>
      </span>
      <span className="numeric ml-auto flex shrink-0 items-baseline gap-2 text-sm text-muted-foreground">
        {(answer.points ?? 0) > 0 ? <span className="font-bold text-foreground">+{answer.points}</span> : null}
        {!skipped && answer.time_taken_seconds != null ? <span>{answer.time_taken_seconds}s</span> : null}
      </span>
    </div>
  );
}

/** One duel question: both players' verdicts, every option with who picked it, then the explanation. */
export function DuelReviewCard({
  review,
  index,
  meIsP1,
  opponentName,
}: {
  review: DuelQuestionReview;
  index: number;
  meIsP1: boolean;
  opponentName: string;
}) {
  const question = toUiQuestion({
    id: review.question_id,
    text: review.text,
    text_html: review.text_html,
    directions_html: review.directions_html,
    options: review.options,
    options_html: review.options_html,
  });
  const correctKey = resolveCorrectKey(question, review.correct_answer);
  const mine = meIsP1 ? review.player1 : review.player2;
  const theirs = meIsP1 ? review.player2 : review.player1;
  const myKey = resolveCorrectKey(question, mine.selected_answer);
  const theirKey = resolveCorrectKey(question, theirs.selected_answer);

  return (
    <article className="surface-panel overflow-hidden">
      <div className="space-y-3 border-b border-border p-4">
        <div className="grid gap-2 sm:grid-cols-[auto_1fr_1fr] sm:items-center">
          <span className="numeric text-sm font-bold text-muted-foreground">Q{index + 1}</span>
          <Verdict mine name="You" answer={mine} />
          <Verdict mine={false} name={opponentName} answer={theirs} />
        </div>
        {question.directionsHtml ? (
          <SafeHtml
            html={question.directionsHtml}
            className="rounded-[var(--radius)] border border-border bg-surface/60 p-3 text-base leading-relaxed text-muted-foreground [&_img]:h-auto [&_img]:max-w-full [&_table]:w-full"
          />
        ) : null}
        {question.textHtml ? (
          <SafeHtml html={question.textHtml} className="text-base font-medium leading-snug text-foreground [&_img]:max-w-full" />
        ) : (
          <p className="text-base font-medium leading-snug text-foreground">{question.text}</p>
        )}
      </div>

      <div className="space-y-2 p-4">
        {OPTION_KEYS.map((key) => {
          const isCorrect = key === correctKey;
          const wrongPick = !isCorrect && (key === myKey || key === theirKey);
          return (
            <div
              key={key}
              className={cn(
                "flex items-center gap-3 rounded-[var(--radius)] border px-3 py-2.5 text-base",
                isCorrect && "border-primary/50 bg-primary/10 text-foreground",
                wrongPick && "border-destructive/50 bg-destructive/10 text-foreground",
                !isCorrect && !wrongPick && "border-border text-muted-foreground",
              )}
            >
              <span className="numeric flex h-6 w-6 shrink-0 items-center justify-center rounded-[calc(var(--radius)-6px)] border border-current text-xs font-bold uppercase">{key}</span>
              {question.optionsHtml?.[key] ? (
                <SafeHtml html={question.optionsHtml[key]} className="min-w-0 flex-1 [&_img]:max-w-full" />
              ) : (
                <span className="min-w-0 flex-1">{question.options[key]}</span>
              )}
              <span className="flex shrink-0 items-center gap-1.5">
                {key === myKey ? <PlayerTag mine name="You" /> : null}
                {key === theirKey ? <PlayerTag mine={false} name={opponentName} /> : null}
                {isCorrect ? <Check className="h-4 w-4 text-primary" aria-label="Correct answer" /> : null}
                {wrongPick ? <X className="h-4 w-4 text-destructive" aria-label="Wrong pick" /> : null}
              </span>
            </div>
          );
        })}
      </div>

      {review.explanation || review.explanation_html ? (
        <div className="border-t border-border bg-surface/60 p-4">
          <p className="label-micro mb-1.5">Explanation</p>
          {review.explanation_html ? (
            <SafeHtml html={review.explanation_html} className="text-base leading-relaxed text-muted-foreground [&_img]:max-w-full" />
          ) : (
            <p className="text-base leading-relaxed text-muted-foreground">{review.explanation}</p>
          )}
        </div>
      ) : null}
    </article>
  );
}
