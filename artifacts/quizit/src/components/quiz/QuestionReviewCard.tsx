import { Check, MinusCircle, X } from "lucide-react";
import { SafeHtml } from "@/components/common/SafeHtml";
import { resolveCorrectKey, toUiQuestion } from "@/lib/questions";
import { cn } from "@/lib/utils";
import type { OptionKey } from "@/types";
import type { QuestionReview } from "@workspace/api-client-react";

const OPTION_KEYS: OptionKey[] = ["a", "b", "c", "d"];

/** IndiaBix-style answer review: the question, every option with the correct one marked
 * (and the user's wrong pick, if any), then the explanation directly underneath. */
export function QuestionReviewCard({ review, index }: { review: QuestionReview; index: number }) {
  const question = toUiQuestion({
    id: review.question_id,
    text: review.text,
    text_html: review.text_html,
    directions_html: review.directions_html,
    options: review.options,
    options_html: review.options_html,
  });
  const correctKey = resolveCorrectKey(question, review.correct_answer);
  const selectedKey = resolveCorrectKey(question, review.selected_answer);
  const skipped = review.selected_answer == null;

  return (
    <div className="surface-panel overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-border p-4">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {question.directionsHtml ? (
            <SafeHtml html={question.directionsHtml} className="rounded-[var(--radius)] border border-border bg-surface/60 p-3 text-sm leading-relaxed text-muted-foreground [&_img]:max-w-full [&_table]:w-full" />
          ) : null}
          <div className="flex min-w-0 gap-3">
            <span className="numeric shrink-0 text-xs font-bold text-muted-foreground">Q{index + 1}</span>
            {question.textHtml ? (
              <SafeHtml html={question.textHtml} className="text-sm font-medium text-foreground [&_img]:max-w-full" />
            ) : (
              <p className="text-sm font-medium text-foreground">{question.text}</p>
            )}
          </div>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-[calc(var(--radius)-4px)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide",
            skipped ? "bg-muted text-muted-foreground" : review.is_correct ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive",
          )}
        >
          {skipped ? "Skipped" : review.is_correct ? "Correct" : "Incorrect"}
        </span>
      </div>

      <div className="space-y-2 p-4">
        {OPTION_KEYS.map((key) => {
          const isCorrect = key === correctKey;
          const isWrongPick = key === selectedKey && key !== correctKey;
          return (
            <div
              key={key}
              className={cn(
                "flex items-center gap-3 rounded-[var(--radius)] border px-3 py-2 text-sm",
                isCorrect && "border-primary/50 bg-primary/10 text-foreground",
                isWrongPick && "border-destructive/50 bg-destructive/10 text-foreground",
                !isCorrect && !isWrongPick && "border-border text-muted-foreground",
              )}
            >
              <span className="numeric flex h-5 w-5 shrink-0 items-center justify-center rounded-[calc(var(--radius)-6px)] border border-current text-[10px] font-bold uppercase">
                {key}
              </span>
              {question.optionsHtml?.[key] ? (
                <SafeHtml html={question.optionsHtml[key]} className="min-w-0 flex-1 [&_img]:max-w-full" />
              ) : (
                <span className="min-w-0 flex-1">{question.options[key]}</span>
              )}
              {isCorrect ? <Check className="h-4 w-4 shrink-0 text-primary" /> : null}
              {isWrongPick ? <X className="h-4 w-4 shrink-0 text-destructive" /> : null}
            </div>
          );
        })}
        {skipped ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MinusCircle className="h-3.5 w-3.5" /> You didn't answer this one.
          </p>
        ) : null}
      </div>

      {review.explanation || review.explanation_html ? (
        <div className="border-t border-border bg-surface/60 p-4">
          <p className="label-micro mb-1.5">Explanation</p>
          {review.explanation_html ? (
            <SafeHtml html={review.explanation_html} className="text-sm text-muted-foreground [&_img]:max-w-full" />
          ) : (
            <p className="text-sm text-muted-foreground">{review.explanation}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
