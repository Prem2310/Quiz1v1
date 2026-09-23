import { ArrowUpRight, Github, Instagram, Linkedin } from "lucide-react";
import { INSTAGRAM_URL, LINKEDIN_URL, REPO_URL } from "@/content/project";
import { cn } from "@/lib/utils";

const SOCIALS = [
  { name: "Instagram", handle: "@quiz1v1", action: "Follow", href: INSTAGRAM_URL, icon: Instagram },
  { name: "LinkedIn", handle: "company/quiz1v1", action: "Follow", href: LINKEDIN_URL, icon: Linkedin },
  { name: "GitHub", handle: "Prem2310/QuizIt", action: "Star the repo", href: REPO_URL, icon: Github },
] as const;

/**
 * quiz1v1's own profiles as icon buttons. `ghost` is the quiet borderless row for tight spots (the app sidebar);
 * `outline` gives each a bezel for open space (the public footer, Profile on phones).
 */
export function SocialLinks({ className, variant = "outline" }: { className?: string; variant?: "outline" | "ghost" }) {
  return (
    <nav aria-label="quiz1v1 on social media" className={cn("flex items-center", variant === "ghost" ? "gap-0.5" : "gap-2", className)}>
      {SOCIALS.map(({ name, href, icon: Icon }) => (
        <a
          key={href}
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          aria-label={`quiz1v1 on ${name}`}
          title={`quiz1v1 on ${name}`}
          className={cn(
            "flex items-center justify-center rounded-[var(--radius)] text-muted-foreground transition-colors hover:text-primary focus-visible:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
            variant === "ghost" ? "h-7 w-7 hover:bg-surface" : "h-9 w-9 border border-border bg-surface hover:border-primary",
          )}
        >
          <Icon className={variant === "ghost" ? "h-3.5 w-3.5" : "h-4 w-4"} />
        </a>
      ))}
    </nav>
  );
}

/** The landing page's "Follow quiz1v1" cards: one per profile, platform, handle and what the link does. */
export function SocialCards() {
  return (
    <div className="grid gap-px overflow-hidden border border-border bg-border sm:grid-cols-3">
      {SOCIALS.map(({ name, handle, action, href, icon: Icon }) => (
        <a
          key={href}
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          className="group relative flex items-center gap-4 bg-surface p-5 transition-colors hover:bg-card focus-visible:bg-card focus-visible:outline-none sm:flex-col sm:items-start sm:gap-5 sm:p-6"
        >
          {/* Accent bar slides in on hover: the tile lights up like a selected fighter slot. */}
          <span className="absolute inset-x-0 top-0 h-0.5 origin-left scale-x-0 bg-primary transition-transform duration-300 ease-out group-hover:scale-x-100 group-focus-visible:scale-x-100" aria-hidden />
          <span className="flex h-12 w-12 shrink-0 items-center justify-center border-2 border-border text-foreground transition-colors group-hover:border-primary group-hover:text-primary">
            <Icon className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-xl uppercase leading-none tracking-wide text-foreground">{name}</span>
            <span className="numeric mt-1.5 block truncate text-sm text-muted-foreground">{handle}</span>
          </span>
          <span className="flex shrink-0 items-center gap-1 text-xs font-bold uppercase tracking-wider text-muted-foreground transition-colors group-hover:text-primary">
            <span className="hidden sm:inline">{action}</span>
            <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </span>
        </a>
      ))}
    </div>
  );
}
