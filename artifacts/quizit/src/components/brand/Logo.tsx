import { cn } from "@/lib/utils";

/** quiz1v1 icon: P1 cyan and P2 coral chevrons facing off over two health bars. Same drawing as public/favicon.svg (which needs literal colors). */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={cn("h-7 w-7", className)}>
      <rect x="1" y="1" width="62" height="62" rx="13" fill="var(--color-surface)" stroke="var(--color-border)" strokeWidth="2" />
      <path d="M8 13h11l10 16-10 16H8l10-16z" fill="var(--color-primary)" />
      <path d="M56 13H45L35 29l10 16h11L46 29z" fill="var(--color-secondary)" />
      <rect x="8" y="50" width="22" height="4" fill="var(--color-primary)" />
      <rect x="34" y="50" width="22" height="4" fill="var(--color-secondary)" />
    </svg>
  );
}

/** QUIZ1V1: "1V1" is one blue (P1 cyan) block, the way "IT" was in the old wordmark. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-display uppercase tracking-[0.1em] text-foreground", className)}>
      QUIZ<span className="text-primary">1V1</span>
    </span>
  );
}

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <LogoMark />
      {!compact && <Wordmark className="text-lg" />}
    </span>
  );
}
