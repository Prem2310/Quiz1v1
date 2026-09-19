import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  BarChart3,
  Flame,
  LayoutGrid,
  LogOut,
  Settings,
  Swords,
  Target,
  Trophy,
  User as UserIcon,
  Users,
  Zap,
} from "lucide-react";
import type { ReactNode } from "react";
import { Logo, LogoMark, Wordmark } from "@/components/brand/Logo";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { NotificationsMenu } from "@/components/social/NotificationsMenu";
import { usePageMeta } from "@/hooks/usePageMeta";
import { cn } from "@/lib/utils";
import { useAuth } from "@/stores/auth";

type NavPath = "/arena" | "/duel/matchmaking" | "/practice" | "/leaderboard" | "/progress" | "/friends" | "/profile" | "/settings";

const PRIMARY_NAV: Array<{ to: NavPath; label: string; icon: typeof LayoutGrid }> = [
  { to: "/arena", label: "Arena", icon: LayoutGrid },
  { to: "/duel/matchmaking", label: "Duel", icon: Swords },
  { to: "/practice", label: "Practice", icon: Target },
  { to: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { to: "/progress", label: "Progress", icon: BarChart3 },
  { to: "/friends", label: "Friends", icon: Users },
];

const SECONDARY_NAV: Array<{ to: NavPath; label: string; icon: typeof LayoutGrid }> = [
  { to: "/profile", label: "Profile", icon: UserIcon },
  { to: "/settings", label: "Settings", icon: Settings },
];

const MOBILE_NAV: Array<{ to: NavPath; label: string; icon: typeof LayoutGrid }> = [
  { to: "/arena", label: "Arena", icon: LayoutGrid },
  { to: "/duel/matchmaking", label: "Duel", icon: Swords },
  { to: "/practice", label: "Practice", icon: Target },
  { to: "/leaderboard", label: "Ranks", icon: Trophy },
  { to: "/profile", label: "Profile", icon: UserIcon },
];

export function initialsOf(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "Q";
  return (parts[0]![0]! + (parts[1]?.[0] ?? "")).toUpperCase();
}

function NavItem({ to, label, icon: Icon, active }: { to: NavPath; label: string; icon: typeof LayoutGrid; active: boolean }) {
  return (
    <Link
      href={to}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex items-center gap-3 border px-3 py-2 font-sans text-sm font-bold uppercase tracking-wide transition-colors",
        active ? "border-primary/50 bg-primary/10 text-primary" : "border-transparent text-muted-foreground hover:border-border hover:bg-surface hover:text-foreground",
      )}
    >
      <Icon className="relative h-4 w-4 shrink-0" />
      <span className="relative truncate">{label}</span>
    </Link>
  );
}

export function AppShell({ children, bare = false }: { children: ReactNode; bare?: boolean }) {
  const [pathname] = useLocation();
  const { user, logout } = useAuth();
  const displayName = user?.name || user?.username || "Player";
  const section = [...PRIMARY_NAV, ...SECONDARY_NAV].find((item) => pathname.startsWith(item.to))?.label ?? (pathname.startsWith("/duel") ? "Duel" : null);
  usePageMeta(section ? `${section} · quiz1v1` : "quiz1v1", { noindex: true }); // signed-in screens are private, so keep them out of search

  if (bare) {
    return <main className="min-h-dvh bg-background">{children}</main>;
  }

  return (
    <div className="min-h-dvh bg-background">
      <a
        href="#main"
        className="sr-only z-50 border-2 border-primary bg-background px-4 py-2 font-bold uppercase text-primary focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to content
      </a>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-surface-2 lg:flex">
        <div className="flex items-center justify-between px-5 py-5">
          <Link href="/arena" aria-label="Go to Arena">
            <Logo />
          </Link>
          <NotificationsMenu />
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3" aria-label="Main">
          {PRIMARY_NAV.map((item) => (
            <NavItem key={item.to} {...item} active={pathname.startsWith(item.to)} />
          ))}
          <Separator className="my-3 bg-border" />
          {SECONDARY_NAV.map((item) => (
            <NavItem key={item.to} {...item} active={pathname.startsWith(item.to)} />
          ))}
        </nav>
        <div className="border-t border-border p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <Avatar className="h-9 w-9 shrink-0 border border-border">
              <AvatarFallback className="bg-card text-xs font-semibold text-primary">{initialsOf(displayName)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">{displayName}</p>
              <p className="label-micro">{user ? `${Math.round(user.user_rating)} · ${user.league.toUpperCase()}` : "UNRATED"}</p>
            </div>
            <button
              type="button"
              onClick={() => void logout()}
              aria-label="Log out"
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-card hover:text-destructive"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-background px-4 py-3 lg:hidden">
        <Link href="/arena" className="flex items-center gap-2">
          <LogoMark className="h-6 w-6" />
          <Wordmark className="text-base tracking-[0.16em]" />
        </Link>
        <div className="flex shrink-0 items-center gap-3">
          <span className="flex items-center gap-1 text-xs font-semibold text-warning">
            <Flame className="h-3.5 w-3.5" />
            {user?.current_streak ?? 0}
          </span>
          <span className="flex items-center gap-1 text-xs font-semibold text-primary">
            <Zap className="h-3.5 w-3.5" />
            {user?.total_xp ?? 0}
          </span>
          <NotificationsMenu />
          <Link href="/profile" aria-label="Profile">
            <Avatar className="h-7 w-7 border border-border">
              <AvatarFallback className="bg-card text-[10px] font-semibold text-primary">{initialsOf(displayName)}</AvatarFallback>
            </Avatar>
          </Link>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="min-h-dvh pb-24 outline-none lg:ml-60 lg:pb-8">
        <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 lg:py-8">{children}</div>
      </main>

      {/* Mobile bottom navigation */}
      <nav
        aria-label="Primary"
        className="safe-bottom fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-surface-2 pt-1.5 lg:hidden"
      >
        {MOBILE_NAV.map(({ to, label, icon: Icon }) => {
          const active = pathname.startsWith(to);
          return (
            <Link
              key={to}
              href={to}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-[48px] flex-col items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-wider transition-colors",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <motion.span animate={{ scale: active ? 1.15 : 1 }} transition={{ type: "spring", stiffness: 400, damping: 20 }}>
                <Icon className="h-5 w-5" />
              </motion.span>
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
