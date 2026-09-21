import type { ReactNode } from "react";
import { AlertTriangle, Inbox, WifiOff } from "lucide-react";
import { LogoMark } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import type { ConnectionState } from "@/types";
import { cn } from "@/lib/utils";

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="loader-fade flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground" role="status">
      <LogoMark animated className="h-10 w-10" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="surface-panel flex flex-col items-center gap-3 p-8 text-center" role="alert">
      <AlertTriangle className="h-6 w-6 text-destructive" />
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function EmptyState({ title, message, action }: { title: string; message: string; action?: ReactNode }) {
  return (
    <div className="surface-panel flex flex-col items-center gap-3 p-10 text-center">
      <Inbox className="h-6 w-6 text-muted-foreground" />
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      {action}
    </div>
  );
}

const CONNECTION_COPY: Record<ConnectionState, { label: string; tone: string }> = {
  IDLE: { label: "Idle", tone: "text-muted-foreground" },
  CONNECTING: { label: "Connecting…", tone: "text-warning" },
  OPEN: { label: "Connected", tone: "text-primary" },
  RECONNECTING: { label: "Reconnecting…", tone: "text-warning" },
  CLOSED: { label: "Disconnected", tone: "text-muted-foreground" },
  ERROR: { label: "Connection lost", tone: "text-destructive" },
};

export function ConnectionIndicator({ state, className }: { state: ConnectionState; className?: string }) {
  const copy = CONNECTION_COPY[state];
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-[11px] font-medium tracking-wide", copy.tone, className)}
      aria-live="polite"
    >
      {state === "OPEN" ? (
        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
      ) : (
        <WifiOff className="h-3 w-3" />
      )}
      {copy.label}
    </span>
  );
}

export function DemoBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-border bg-surface px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground",
        className,
      )}
      title="Demo data — no backend endpoint yet"
    >
      Demo data
    </span>
  );
}
