import { SocketManager } from "@/lib/websocket";
import { WS_PATHS, wsUrl } from "@/lib/config";
import type { ConnectionState, DuelServerMessage, MatchFoundPayload } from "@/types";

export interface MatchmakingHandlers {
  onConnection: (state: ConnectionState) => void;
  onMatchFound: (payload: MatchFoundPayload) => void;
  onError: (message: string) => void;
}

/** WS /api/ws/matchmaking — join the queue, get paired with a similarly-rated opponent. */
export function createMatchmakingService(handlers: MatchmakingHandlers, topicId?: number | null) {
  const query = topicId != null ? `?topic_id=${topicId}` : "";
  const manager = new SocketManager({
    url: wsUrl(`${WS_PATHS.matchmaking}${query}`),
    onStateChange: handlers.onConnection,
    onError: handlers.onError,
    onMessage: (data) => {
      if (!data || typeof data !== "object") return;
      const payload = data as { type?: string; duel_id?: number; opponent?: MatchFoundPayload["opponent"]; detail?: string };
      if (payload.type === "match_found" && typeof payload.duel_id === "number") {
        // The queue's job is done: close it ourselves so the server's close isn't taken for a drop and reconnected (re-queueing us).
        manager.disconnect();
        handlers.onMatchFound({ duelId: payload.duel_id, opponent: payload.opponent ?? null });
      } else if (payload.type === "error") {
        manager.disconnect();
        handlers.onError(payload.detail ?? "Couldn't start the duel. Please try again.");
      }
    },
  });

  return {
    start: () => manager.connect(),
    cancel: () => {
      manager.send({ type: "cancel" });
      manager.disconnect();
    },
    dispose: () => manager.disconnect(),
  };
}

export interface DuelHandlers {
  onConnection: (state: ConnectionState) => void;
  onMessage: (message: DuelServerMessage) => void;
  onError: (message: string) => void;
}

/** WS /api/ws/duels/{id} — the live duel game loop. */
export function createDuelService(duelId: number | string, handlers: DuelHandlers) {
  const manager = new SocketManager({
    url: wsUrl(WS_PATHS.duel(duelId)),
    heartbeat: { message: { type: "ping" }, intervalMs: 20000 },
    onStateChange: handlers.onConnection,
    onError: handlers.onError,
    onMessage: (data) => {
      if (data && typeof data === "object" && "type" in data) {
        // Terminal: the server closes right after; don't let that close trigger reconnects.
        if ((data as DuelServerMessage).type === "opponent_left") manager.disconnect();
        handlers.onMessage(data as DuelServerMessage);
      }
    },
  });

  return {
    connect: () => manager.connect(),
    submitAnswer: (index: number, answer: string) => manager.send({ type: "answer", index, answer }),
    disconnect: () => manager.disconnect(),
  };
}
