import { LogoMark, Wordmark } from "@/components/brand/Logo";

/**
 * Full-screen loader for app boot and sign-in hand-offs: the animated mark over the wordmark. It matches the static
 * splash in index.html, so first paint, boot and the app read as one continuous screen.
 */
export function BrandLoader({ label }: { label?: string }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-background px-4" role="status" aria-live="polite">
      <div className="loader-fade flex flex-col items-center">
        <LogoMark animated className="h-[88px] w-[88px]" />
        <Wordmark className="mt-5 text-[34px] leading-none" />
        {/* The wordmark already says what this is; the label only adds what is happening, and screen readers always get one. */}
        {label ? <p className="label-micro mt-3">{label}</p> : <span className="sr-only">Loading quiz1v1</span>}
      </div>
    </div>
  );
}
