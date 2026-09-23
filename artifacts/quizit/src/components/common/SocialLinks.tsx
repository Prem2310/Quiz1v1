import { Github, Instagram, Linkedin } from "lucide-react";
import { INSTAGRAM_URL, LINKEDIN_URL, REPO_URL } from "@/content/project";
import { cn } from "@/lib/utils";

const SOCIALS = [
  { href: INSTAGRAM_URL, label: "quiz1v1 on Instagram", icon: Instagram },
  { href: LINKEDIN_URL, label: "quiz1v1 on LinkedIn", icon: Linkedin },
  { href: REPO_URL, label: "quiz1v1 on GitHub", icon: Github },
] as const;

/** quiz1v1's own profiles as a row of square icon buttons: the public footer, the app sidebar and Profile. */
export function SocialLinks({ className, size = "md" }: { className?: string; size?: "sm" | "md" }) {
  return (
    <nav aria-label="quiz1v1 on social media" className={cn("flex items-center gap-1.5", className)}>
      {SOCIALS.map(({ href, label, icon: Icon }) => (
        <a
          key={href}
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          aria-label={label}
          title={label}
          className={cn(
            "flex items-center justify-center rounded-[var(--radius)] border border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary focus-visible:border-primary focus-visible:text-primary focus-visible:outline-none",
            size === "sm" ? "h-8 w-8" : "h-9 w-9",
          )}
        >
          <Icon className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
        </a>
      ))}
    </nav>
  );
}
