import { Link } from "wouter";
import { motion } from "framer-motion";
import { BarChart3, Flame, Swords, Target, Trophy } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { AnimatedNumber } from "@/components/common/AnimatedNumber";
import { useAuth } from "@/stores/auth";

const MOVES = [
  {
    icon: Swords,
    title: "1v1 duels",
    body: "Queue up and face a classmate of similar rating in a live, timed head-to-head. Fastest correct answer wins the point.",
  },
  {
    icon: Target,
    title: "Weak-topic drills",
    body: "Every miss is tracked. QuizIt resurfaces the questions you got wrong sooner, so you actually fix your weak spots.",
  },
  {
    icon: Trophy,
    title: "Rating & leagues",
    body: "Climb from Novice to Diamond on an Elo rating. Compare yourself globally or just against your own college.",
  },
  {
    icon: BarChart3,
    title: "Real progress data",
    body: "Topic-by-topic accuracy, streaks and XP — see exactly where you stand before the real placement test.",
  },
];

export default function Landing() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Link href="/" aria-label="Go to homepage">
          <Logo />
        </Link>
        <nav className="flex items-center gap-2">
          {isAuthenticated ? (
            <Link href="/arena">
              <Button size="sm">Go to Arena</Button>
            </Link>
          ) : (
            <>
              <Link href="/login">
                <Button variant="ghost" size="sm">
                  Log in
                </Button>
              </Link>
              <Link href="/signup">
                <Button size="sm">Sign up free</Button>
              </Link>
            </>
          )}
        </nav>
      </header>

      <main>
        <section className="px-4 pb-16 pt-10 sm:px-6 sm:pt-14">
          <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <motion.h1
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45 }}
                className="text-balance font-display text-5xl uppercase leading-[0.95] tracking-wide text-foreground sm:text-7xl"
              >
                You. <span className="text-primary">Vs.</span>
                <br />
                Your rating.
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: 0.08 }}
                className="mt-5 max-w-md text-balance text-base text-muted-foreground sm:text-lg"
              >
                Thousands of real placement-test questions across quant, verbal and reasoning. Drill your weak
                topics on repeat, then prove it in a live 1v1 duel.
              </motion.p>
              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: 0.14 }}
                className="mt-8 flex flex-wrap items-center gap-3"
              >
                <Link href={isAuthenticated ? "/practice" : "/signup"}>
                  <Button size="lg">Start practicing</Button>
                </Link>
                <Link href={isAuthenticated ? "/duel/matchmaking" : "/signup"}>
                  <Button size="lg" variant="outline">
                    <Swords className="h-4 w-4" /> Find a duel
                  </Button>
                </Link>
              </motion.div>

              <div className="numeric mt-10 flex divide-x divide-border border border-border">
                {[
                  { value: 13600, label: "Questions", suffix: "+" },
                  { value: 6, label: "Topic areas", suffix: "" },
                  { value: 1000, label: "Starting rating", suffix: "" },
                ].map((stat) => (
                  <div key={stat.label} className="flex-1 bg-surface px-4 py-3">
                    <AnimatedNumber value={stat.value} suffix={stat.suffix} className="block text-xl font-bold text-foreground sm:text-2xl" />
                    <p className="label-micro mt-1">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>

            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="border-2 border-border bg-surface p-6"
            >
              <p className="label-micro text-center">Live duel preview</p>
              <div className="mt-4 flex items-center justify-between gap-3">
                <div className="flex-1 border-2 border-primary bg-card p-4 text-center">
                  <p className="numeric text-xs font-bold text-primary">P1</p>
                  <p className="numeric mt-2 text-3xl font-black text-foreground">7</p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">You</p>
                </div>
                <p className="font-display text-2xl text-muted-foreground">VS</p>
                <div className="flex-1 border-2 border-secondary bg-card p-4 text-center">
                  <p className="numeric text-xs font-bold text-secondary">P2</p>
                  <p className="numeric mt-2 text-3xl font-black text-foreground">6</p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">Opponent</p>
                </div>
              </div>
              <p className="mt-4 border border-border bg-card px-3 py-2 text-center text-sm text-foreground">
                "A container ship travels 240 km in 6 hours. What is its speed in m/s?"
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                {["A · 100/9", "B · 40", "C · 6.67", "D · 24"].map((opt) => (
                  <div key={opt} className="border border-border px-2 py-1.5 text-muted-foreground">
                    {opt}
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
          <h2 className="font-display text-2xl uppercase tracking-wide text-foreground sm:text-3xl">Move list</h2>
          <div className="mt-5 divide-y divide-border border border-border">
            {MOVES.map((feature, i) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.35, delay: i * 0.05 }}
                className="flex items-start gap-4 bg-surface p-5"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center border border-primary text-primary">
                  <feature.icon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-display text-base uppercase tracking-wide text-foreground">{feature.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{feature.body}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        <section className="px-4 pb-24 sm:px-6">
          <div className="mx-auto flex max-w-4xl flex-col items-center gap-4 border-2 border-primary bg-primary/10 p-10 text-center">
            <Flame className="h-8 w-8 text-warning" />
            <h2 className="font-display text-2xl uppercase tracking-wide text-foreground sm:text-3xl">
              Your placement test won't wait. Neither should you.
            </h2>
            <p className="max-w-md text-sm text-muted-foreground">
              Free to use. No credit card. Just questions, a rating, and people to beat.
            </p>
            <Link href={isAuthenticated ? "/arena" : "/signup"}>
              <Button size="lg">{isAuthenticated ? "Enter the arena" : "Create your free account"}</Button>
            </Link>
          </div>
        </section>
      </main>

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
          <p>© {new Date().getFullYear()} QuizIt</p>
        </div>
      </footer>
    </div>
  );
}
