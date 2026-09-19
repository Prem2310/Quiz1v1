import { cn } from "@/lib/utils";

/** QuizIt versus-mark — a split shield, P1 cyan facing P2 coral across a hard seam. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("h-7 w-7", className)}>
      <path d="M16 2 L29 8 V18 C29 24.5 23.5 29 16 30 C8.5 29 3 24.5 3 18 V8 Z" fill="var(--color-surface-2)" stroke="var(--color-border)" strokeWidth="1.5" />
      <path d="M16 4.3 L16 27.6 C10.5 26.5 5.3 22.6 5.3 17.4 V9.1 Z" fill="var(--color-primary)" />
      <path d="M16 4.3 L16 27.6 C21.5 26.5 26.7 22.6 26.7 17.4 V9.1 Z" fill="var(--color-secondary)" />
    </svg>
  );
}

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <LogoMark />
      {!compact && (
        <span className="font-display text-lg uppercase tracking-[0.1em] text-foreground">
          QUIZ<span className="text-primary">IT</span>
        </span>
      )}
    </span>
  );
}
