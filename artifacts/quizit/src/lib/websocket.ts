import type { ConnectionState } from "@/types";

/** Server close code: this user connected again elsewhere and that newer socket replaced this one. */
const REPLACED_CLOSE_CODE = 4000;

export interface SocketManagerOptions {
  url: string;
  /** Heartbeat payload sent on an interval; omit to disable heartbeats. */
  heartbeat?: { message: unknown; intervalMs: number };
  maxRetries?: number;
  onMessage?: (data: unknown, raw: MessageEvent) => void;
  onStateChange?: (state: ConnectionState) => void;
  onError?: (message: string) => void;
}

/**
 * Reusable WebSocket manager with exponential backoff, heartbeat and strict
 * cleanup. Cookies (HTTP-only `access_token`) are sent automatically by the
 * browser on same-site/CORS-credentialed websocket handshakes — no tokens in URLs.
 */
export class SocketManager {
  private socket: WebSocket | null = null;
  private retries = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private manuallyClosed = false;
  private state: ConnectionState = "IDLE";

  constructor(private readonly options: SocketManagerOptions) {}

  get connectionState(): ConnectionState {
    return this.state;
  }

  connect(): void {
    if (typeof window === "undefined") return;
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.manuallyClosed = false;
    this.setState(this.retries === 0 ? "CONNECTING" : "RECONNECTING");

    let socket: WebSocket;
    try {
      socket = new WebSocket(this.options.url);
    } catch {
      this.setState("ERROR");
      this.options.onError?.("Unable to open a realtime connection.");
      return;
    }
    this.socket = socket;

    socket.onopen = () => {
      this.retries = 0;
      this.setState("OPEN");
      this.startHeartbeat();
    };

    socket.onmessage = (event) => {
      let parsed: unknown = event.data;
      if (typeof event.data === "string") {
        try {
          parsed = JSON.parse(event.data);
        } catch {
          parsed = event.data;
        }
      }
      this.options.onMessage?.(parsed, event);
    };

    // No onError here: every error is followed by a close, which retries. Reporting the first blip made pages
    // give up on connections the retry would have recovered. onError fires only once retries are exhausted.

    socket.onclose = (event) => {
      this.stopHeartbeat();
      this.socket = null;
      if (this.manuallyClosed) {
        this.setState("CLOSED");
        return;
      }
      if (event.code === REPLACED_CLOSE_CODE) {
        // A newer socket (another tab) took over; reconnecting would just kick that one out in turn.
        this.setState("ERROR");
        this.options.onError?.("Opened in another tab.");
        return;
      }
      this.scheduleReconnect();
    };
  }

  send(payload: unknown): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    this.socket.send(typeof payload === "string" ? payload : JSON.stringify(payload));
    return true;
  }

  disconnect(): void {
    this.manuallyClosed = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.onclose = null;
      this.socket.onerror = null;
      this.socket.onmessage = null;
      this.socket.close();
      this.socket = null;
    }
    this.setState("CLOSED");
  }

  private scheduleReconnect(): void {
    const max = this.options.maxRetries ?? 5;
    if (this.retries >= max) {
      this.setState("ERROR");
      this.options.onError?.("Connection lost. Please try again.");
      return;
    }
    const delay = Math.min(800 * 2 ** this.retries, 8000);
    this.retries += 1;
    this.setState("RECONNECTING");
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private startHeartbeat(): void {
    const hb = this.options.heartbeat;
    if (!hb) return;
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => this.send(hb.message), hb.intervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private setState(state: ConnectionState): void {
    if (this.state === state) return;
    this.state = state;
    this.options.onStateChange?.(state);
  }
}
