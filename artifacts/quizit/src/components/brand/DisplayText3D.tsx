import { cn } from "@/lib/utils";

export type Tone = "primary" | "destructive" | "muted";

/** Foreground word color and the offset "print-strike" layer behind it. */
export const TONE_COLORS: Record<Tone, { fg: string; strike: string }> = {
  primary: { fg: "var(--color-primary)", strike: "var(--color-secondary)" },
  destructive: { fg: "var(--color-secondary)", strike: "var(--color-primary)" },
  muted: { fg: "var(--color-muted-foreground)", strike: "var(--color-border)" },
};

/**
 * Arcade "K.O. screen-print" display text for moment screens (duel
 * VICTORY/DEFEAT, streak milestones): a solid offset strike layer behind a
 * solid foreground word, like a misregistered two-color print — no gradient.
 */
export function DisplayText3D({ text, tone = "primary", className }: { text: string; tone?: Tone; className?: string }) {
  const { fg, strike } = TONE_COLORS[tone];

  return (
    <svg viewBox="0 0 640 150" className={cn("w-full overflow-visible", className)} role="img" aria-label={text}>
      <text
        x="50%"
        y="108"
        textAnchor="middle"
        textLength="580"
        lengthAdjust="spacingAndGlyphs"
        fontFamily="var(--font-display)"
        fontSize="104"
        fill={strike}
        transform="translate(7 7)"
      >
        {text}
      </text>

      <text
        x="50%"
        y="108"
        textAnchor="middle"
        textLength="580"
        lengthAdjust="spacingAndGlyphs"
        fontFamily="var(--font-display)"
        fontSize="104"
        fill={fg}
        stroke="var(--color-background)"
        strokeWidth={2}
      >
        {text}
      </text>
    </svg>
  );
}
