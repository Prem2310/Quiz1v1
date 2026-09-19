/** Shared gameplay + realtime types for QuizIt. Auth/catalog/quiz REST types come
 * from the generated client (@workspace/api-client-react) — these cover only what
 * that spec can't express: sanitised gameplay questions and WebSocket payloads. */

export type OptionKey = "a" | "b" | "c" | "d";

/** Sanitised question used by gameplay UI. Correct answer is never included. */
export interface Question {
  id: string;
  text: string;
  textHtml?: string;
  /** Shared IndiaBix "Directions to Solve" passage/table/chart, when this question needs one. */
  directionsHtml?: string;
  options: Record<OptionKey, string>;
  optionsHtml?: Record<OptionKey, string>;
  difficulty?: string;
  explanation?: string;
  explanationHtml?: string;
}

/** Raw shape returned by the backend for a question (REST or over a duel WS). */
export interface RawQuestion {
  id: string;
  text?: string;
  text_html?: string | null;
  directions_html?: string | null;
  options?: unknown;
  options_html?: unknown;
  answer_letter?: string | null;
  explanation?: string | null;
  explanation_html?: string | null;
  difficulty?: string | null;
}

export type ConnectionState = "IDLE" | "CONNECTING" | "OPEN" | "RECONNECTING" | "CLOSED" | "ERROR";

export type MatchmakingState = "IDLE" | "SEARCHING" | "MATCH_FOUND" | "ERROR" | "CANCELLED" | "DISCONNECTED";

export interface DuelOpponent {
  user_id: number;
  username: string;
  name: string;
  rating: number;
  league: string;
}

export interface MatchFoundPayload {
  duelId: number;
  opponent: DuelOpponent | null;
}

export interface DuelQuestionPayload {
  type: "question";
  index: number;
  total: number;
  time_limit: number;
  question: RawQuestion;
}

export interface DuelScorePayload {
  type: "score_update" | "reveal" | "duel_end";
  index?: number;
  scores: Record<string, number>;
  correct_answer?: string | null;
  explanation?: string | null;
  winner_id?: number | null;
  rating_after?: Record<string, number>;
  rating_delta?: Record<string, number>;
  xp_gained?: Record<string, number>;
}

export type DuelServerMessage =
  | { type: "waiting_for_opponent" | "opponent_joined" | "opponent_left" }
  | DuelQuestionPayload
  | DuelScorePayload;
