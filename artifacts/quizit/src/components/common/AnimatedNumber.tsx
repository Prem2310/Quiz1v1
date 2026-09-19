import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  value: number;
  from?: number;
  durationMs?: number;
  className?: string;
  suffix?: string;
  decimals?: number;
}

const fmt = (n: number, decimals: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

/** Animated counter that respects prefers-reduced-motion. */
export function AnimatedNumber({ value, from, durationMs = 900, className, suffix = "", decimals = 0 }: Props) {
  const [display, setDisplay] = useState(from ?? 0);
  // Later changes tween from what is on screen, not from zero (a live score going 7 -> 8 must not replay 0 -> 8).
  const shown = useRef(from ?? 0);
  const frame = useRef<number>(0);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      shown.current = value;
      setDisplay(value);
      return;
    }
    const begin = performance.now();
    const initial = shown.current;
    const step = (now: number) => {
      const t = Math.min(1, (now - begin) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      shown.current = initial + (value - initial) * eased;
      setDisplay(shown.current);
      if (t < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame.current);
  }, [value, durationMs]);

  // The tween is decorative; assistive tech and copy/paste always get the real value.
  return (
    <span className={cn("numeric", className)}>
      <span className="sr-only">
        {fmt(value, decimals)}
        {suffix}
      </span>
      <span aria-hidden="true">
        {fmt(display, decimals)}
        {suffix}
      </span>
    </span>
  );
}
