import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SafeHtml } from "@/components/common/SafeHtml";
import type { OptionKey } from "@/types";

export type AnswerFeedback = "none" | "correct" | "incorrect" | "revealed";

interface Props {
  optionKey: OptionKey;
  text: string;
  html?: string; // HTML version with images
  selected: boolean;
  feedback?: AnswerFeedback;
  disabled?: boolean;
  onSelect: (key: OptionKey) => void;
}

/** Large, touch-friendly answer button (min 48px target). */
export function AnswerOption({ optionKey, text, html, selected, feedback = "none", disabled, onSelect }: Props) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect(optionKey)}
      aria-pressed={selected}
      className={cn(
        "group flex min-h-[56px] w-full items-center gap-3 rounded-[var(--radius)] border bg-card px-3 py-3 text-left transition-all duration-150 sm:px-4",
        "hover:border-primary-muted hover:-translate-y-[1px] active:scale-[0.985] disabled:cursor-not-allowed",
        selected && feedback === "none" && "border-primary bg-primary/10",
        feedback === "correct" && "border-primary bg-primary/15",
        feedback === "incorrect" && "shake border-destructive bg-destructive/10",
        feedback === "revealed" && "border-primary-muted",
        !selected && feedback === "none" && "border-border",
      )}
    >
      <span
        className={cn(
          "numeric flex h-8 w-8 shrink-0 items-center justify-center rounded-[calc(var(--radius)-4px)] border-2 border-border text-xs font-bold uppercase text-muted-foreground",
          selected && "border-primary text-primary",
          feedback === "correct" && "border-primary bg-primary text-primary-foreground",
          feedback === "incorrect" && "border-destructive text-destructive",
        )}
      >
        {optionKey}
      </span>
      {html ? (
        <SafeHtml html={html} className="min-w-0 flex-1 break-words text-sm text-foreground sm:text-base [&_img]:max-w-full [&_img]:h-auto" />
      ) : (
        <span className="min-w-0 flex-1 break-words text-sm text-foreground sm:text-base">{text}</span>
      )}
      {feedback === "correct" ? <Check className="h-4 w-4 shrink-0 text-primary" /> : null}
      {feedback === "incorrect" ? <X className="h-4 w-4 shrink-0 text-destructive" /> : null}
    </button>
  );
}
