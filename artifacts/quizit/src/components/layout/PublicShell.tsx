import type { ReactNode } from "react";
import { Link } from "wouter";
import { Logo } from "@/components/brand/Logo";
import { Credit } from "@/components/common/Credit";
import { SocialLinks } from "@/components/common/SocialLinks";
import { CONTRIBUTING_URL, ISSUES_URL, REPO_URL } from "@/content/project";
import { TOPICS } from "@/content/topics";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/stores/auth";

/** Header and footer shared by the public pages: landing (also at /about for signed-in players) and the topic pages. */
export function PublicShell({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-dvh bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Link href="/" aria-label="Go to homepage">
          <Logo />
        </Link>
        <nav className="flex items-center gap-2">
          {isAuthenticated ? (
            <Button size="sm" asChild>
              <Link href="/">Go to Arena</Link>
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/login">Log in</Link>
              </Button>
              <Button size="sm" asChild>
                <Link href="/signup">Sign up free</Link>
              </Button>
            </>
          )}
        </nav>
      </header>

      {children}

      <footer className="border-t border-border bg-surface-2">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-10 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))]">
          <div className="col-span-2 lg:col-span-1">
            <Logo />
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">Aptitude practice and live 1v1 quiz duels for placement and competitive-exam prep. Free, and open source.</p>
            <SocialLinks className="mt-5" />
          </div>

          <FooterColumn title="Practice">
            {TOPICS.map((topic) => (
              <FooterLink key={topic.slug} href={`/topics/${topic.slug}`}>
                {topic.name}
              </FooterLink>
            ))}
          </FooterColumn>

          <FooterColumn title="Project">
            <FooterLink href={REPO_URL} external>
              Source on GitHub
            </FooterLink>
            <FooterLink href={ISSUES_URL} external>
              Report an issue
            </FooterLink>
            <FooterLink href={CONTRIBUTING_URL} external>
              How to contribute
            </FooterLink>
          </FooterColumn>

          <FooterColumn title="Account">
            {isAuthenticated ? (
              <>
                <FooterLink href="/">Arena</FooterLink>
                <FooterLink href="/profile">Profile</FooterLink>
              </>
            ) : (
              <>
                <FooterLink href="/signup">Sign up free</FooterLink>
                <FooterLink href="/login">Log in</FooterLink>
              </>
            )}
          </FooterColumn>
        </div>

        <div className="border-t border-border">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-5 text-xs text-muted-foreground sm:px-6 lg:flex-row lg:items-center lg:justify-between">
            <p>
              © {new Date().getFullYear()} quiz1v1 · Question bank sourced from{" "}
              <a href="https://www.indiabix.com" target="_blank" rel="noreferrer" className="font-medium text-foreground underline-offset-4 hover:underline">
                IndiaBix
              </a>
              , and all credit for question content belongs to it.
            </p>
            <Credit />
          </div>
        </div>
      </footer>
    </div>
  );
}

function FooterColumn({ title, children }: { title: string; children: ReactNode }) {
  return (
    <nav aria-label={title}>
      <p className="label-micro">{title}</p>
      <ul className="mt-4 space-y-2.5">{children}</ul>
    </nav>
  );
}

function FooterLink({ href, external = false, children }: { href: string; external?: boolean; children: ReactNode }) {
  const cls = "text-sm text-muted-foreground transition-colors hover:text-foreground";
  return (
    <li>
      {external ? (
        <a href={href} target="_blank" rel="noreferrer noopener" className={cls}>
          {children}
        </a>
      ) : (
        <Link href={href} className={cls}>
          {children}
        </Link>
      )}
    </li>
  );
}
