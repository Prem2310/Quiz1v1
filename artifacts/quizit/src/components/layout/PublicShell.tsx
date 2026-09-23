import type { ReactNode } from "react";
import { Link } from "wouter";
import { Logo } from "@/components/brand/Logo";
import { Credit } from "@/components/common/Credit";
import { SocialLinks } from "@/components/common/SocialLinks";
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

      <footer className="border-t border-border px-4 py-8 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 text-center text-xs text-muted-foreground sm:flex-row sm:justify-between sm:text-left">
          <Logo compact />
          <p>
            Question bank sourced from{" "}
            <a
              href="https://www.indiabix.com"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              IndiaBix
            </a>
            . All credit for question content belongs to IndiaBix.
          </p>
          <nav aria-label="Footer" className="flex items-center gap-4">
            {isAuthenticated ? (
              <Link href="/" className="hover:text-foreground">
                Arena
              </Link>
            ) : (
              <>
                <Link href="/signup" className="hover:text-foreground">
                  Sign up
                </Link>
                <Link href="/login" className="hover:text-foreground">
                  Log in
                </Link>
              </>
            )}
            <span>© {new Date().getFullYear()} quiz1v1</span>
          </nav>
        </div>
        <div className="mx-auto mt-4 flex max-w-6xl flex-col items-center gap-3 border-t border-border pt-4 sm:flex-row sm:justify-between">
          <Credit className="text-center text-xs text-muted-foreground sm:text-left" />
          <SocialLinks />
        </div>
      </footer>
    </div>
  );
}
