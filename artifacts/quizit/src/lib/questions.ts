import type { OptionKey, Question, RawQuestion } from "@/types";

const OPTION_KEYS: OptionKey[] = ["a", "b", "c", "d"];

function parseOptionList(value: unknown): string[] {
  const list: string[] = [];
  if (Array.isArray(value)) {
    value.forEach((entry) => {
      if (typeof entry === "string") list.push(entry);
    });
  } else if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) {
        parsed.forEach((entry) => {
          if (typeof entry === "string") list.push(entry);
        });
      }
    } catch {
      const trimmed = value.trim();
      if (trimmed) list.push(trimmed);
    }
  }
  return list;
}

function toOptionRecord(value: unknown): Record<OptionKey, string> {
  const list = parseOptionList(value);
  const record: Record<OptionKey, string> = { a: "", b: "", c: "", d: "" };
  OPTION_KEYS.forEach((key, idx) => {
    record[key] = list[idx] ?? "";
  });
  return record;
}

function toOptionalOptionRecord(value: unknown): Record<OptionKey, string> | undefined {
  const list = parseOptionList(value);
  if (!list.some((html) => html?.trim().length)) return undefined;
  return toOptionRecord(value);
}

/** Converts a raw question payload (REST QuestionRead, or a duel WS `question` event) into
 * the sanitised shape the gameplay UI renders — never carries the answer. */
export function toUiQuestion(raw: RawQuestion): Question {
  const question: Question = {
    id: String(raw.id),
    text: raw.text ?? "",
    options: toOptionRecord(raw.options ?? []),
  };
  const textHtml = typeof raw.text_html === "string" ? raw.text_html.trim() : "";
  if (textHtml) question.textHtml = textHtml;

  const directionsHtml = typeof raw.directions_html === "string" ? raw.directions_html.trim() : "";
  if (directionsHtml) question.directionsHtml = directionsHtml;

  const optionsHtml = toOptionalOptionRecord(raw.options_html);
  if (optionsHtml) question.optionsHtml = optionsHtml;

  if (raw.difficulty) question.difficulty = raw.difficulty;
  return question;
}

/** Maps a correct-answer string (letter like "C", or the literal option text) to the
 * matching option key so the result UI can highlight it. */
export function resolveCorrectKey(question: Question, correctAnswer: string | null | undefined): OptionKey | null {
  if (!correctAnswer) return null;
  const letter = correctAnswer.trim().toUpperCase();
  if (letter.length === 1 && "ABCD".includes(letter)) {
    return OPTION_KEYS["ABCD".indexOf(letter)] ?? null;
  }
  const match = OPTION_KEYS.find((key) => question.options[key]?.trim() === correctAnswer.trim());
  return match ?? null;
}
