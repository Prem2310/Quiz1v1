import { motion } from "framer-motion";
import { AnswerOption, type AnswerFeedback } from "./AnswerOption";
import { SafeHtml } from "@/components/common/SafeHtml";
import type { OptionKey, Question } from "@/types";

const KEYS: OptionKey[] = ["a", "b", "c", "d"];

interface Props {
  question: Question;
  selected: OptionKey | null;
  /**
   * Feedback map. Gameplay passes an empty map — the correct answer is never
   * available to this component while a question is active.
   */
  feedback?: Partial<Record<OptionKey, AnswerFeedback>>;
  disabled?: boolean;
  onSelect: (key: OptionKey) => void;
}

export function QuestionPanel({ question, selected, feedback = {}, disabled, onSelect }: Props) {
  return (
    <motion.div
      key={question.id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="w-full"
    >
      {question.directionsHtml ? (
        <SafeHtml
          html={question.directionsHtml}
          className="mb-4 rounded-lg border border-border bg-surface/60 p-3 text-sm text-muted-foreground [&_img]:max-w-full [&_img]:h-auto [&_table]:w-full"
        />
      ) : null}
      {question.textHtml ? (
        <SafeHtml html={question.textHtml} className="text-balance text-lg font-semibold leading-snug text-foreground sm:text-2xl [&_img]:max-w-full [&_img]:h-auto" />
      ) : (
        <h2 className="text-balance text-lg font-semibold leading-snug text-foreground sm:text-2xl">
          {question.text}
        </h2>
      )}
      <div className="mt-5 grid gap-2.5 sm:mt-7 sm:grid-cols-2">
        {KEYS.map((key) => (
          <AnswerOption
            key={key}
            optionKey={key}
            text={question.options[key]}
            html={question.optionsHtml?.[key]}
            selected={selected === key}
            feedback={feedback[key] ?? "none"}
            {...(disabled ? { disabled: true } : {})}
            onSelect={onSelect}
          />
        ))}
      </div>
    </motion.div>
  );
}
