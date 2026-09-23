import { Link } from "wouter";
import { motion } from "framer-motion";
import { BarChart3, Flame, Github, Swords, Target, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnimatedNumber } from "@/components/common/AnimatedNumber";
import { PublicShell } from "@/components/layout/PublicShell";
import { AUTHOR_NAME, AUTHOR_URL, CONTRIBUTING_URL, ISSUES_URL, REPO_URL } from "@/content/project";
import { SocialCards } from "@/components/common/SocialLinks";
import { TOPICS } from "@/content/topics";
import { useAuth } from "@/stores/auth";
import { MIN_ONLINE_SHOWN, MIN_PLAYERS_SHOWN, usePublicStats } from "@/hooks/usePublicStats";

const MOVES = [
  {
    icon: Swords,
    title: "1v1 duels",
    body: "Queue up and face a classmate of similar rating in a live, timed head-to-head. Fastest correct answer wins the point.",
  },
  {
    icon: Target,
    title: "Weak-topic drills",
    body: "Every miss is tracked, and missed questions come back sooner, so you actually fix your weak spots.",
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

type Stat = { value: number; label: string; suffix?: string; live?: boolean };

// Rendered on the page and mirrored into FAQPage structured data below, so the markup always matches what people can read.
const FAQ = [
  {
    q: "What is quiz1v1?",
    a: "quiz1v1 is a free aptitude practice platform for campus placements and competitive exams such as banking and SSC. Drill topic-based questions on your own, then challenge other students to live 1v1 duels with a rating, leagues and a leaderboard.",
  },
  { q: "Is quiz1v1 free?", a: "Yes. It is free to use, with no credit card. Create an account and start practising straight away." },
  {
    q: "How is quiz1v1 different from an aptitude question bank?",
    a: "A question bank is a list of questions to read through. quiz1v1 turns practice into a game: live 1v1 duels against other students, a rating and leaderboard, and missed questions that come back sooner until you get them right.",
  },
  {
    q: "Which exams can I prepare for with quiz1v1?",
    a: "It is built for campus placement aptitude tests and for competitive exams that test the same skills, such as the quantitative, reasoning and verbal sections of banking and SSC-style papers.",
  },
  {
    q: "Which topics can I practise?",
    a: "Quantitative aptitude, data interpretation, verbal ability, logical reasoning, verbal reasoning and non-verbal reasoning. Each has its own accuracy tracking on your progress page.",
  },
  {
    q: "How does a 1v1 duel work?",
    a: "Queue up and you are matched with a student near your rating. You both answer the same timed questions live, the fastest correct answers win the points, and your rating moves with the result.",
  },
  {
    q: "How does quiz1v1 help with weak topics?",
    a: "Every miss is tracked. Missed questions come back sooner, until you answer them right, and your progress page shows accuracy topic by topic.",
  },
  { q: "Where do the questions come from?", a: "The question bank is sourced from IndiaBix. All credit for question content belongs to IndiaBix." },
  {
    q: "Can I compete with my friends or my college?",
    a: "Yes. Add friends and challenge them to a duel directly, and compare yourself on the leaderboard globally or against your own college.",
  },
  {
    q: "Who built quiz1v1, and is it open source?",
    a: "quiz1v1 is built by Prem2310 and the code is open source under the MIT license. Bug reports, ideas and pull requests are welcome on GitHub. The question content is sourced from IndiaBix and is not covered by that license.",
  },
];

const FAQ_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
};

export default function Landing() {
  const { isAuthenticated } = useAuth();
  const statsQuery = usePublicStats();
  const live = statsQuery.data;

  const liveStats: Stat[] = [];
  if (live && live.registered_users >= MIN_PLAYERS_SHOWN) liveStats.push({ value: live.registered_users, label: "Players" });
  if (live && live.online_now >= MIN_ONLINE_SHOWN) liveStats.push({ value: live.online_now, label: "Online now", live: true });
  const stats: Stat[] = [
    { value: 13600, label: "Questions", suffix: "+" },
    ...liveStats,
    { value: 6, label: "Topic areas" },
    ...(liveStats.length ? [] : [{ value: 1000, label: "Starting rating" }]),
  ];

  return (
    <PublicShell>
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
                quiz1v1 puts thousands of real placement-test questions across quant, verbal and reasoning in one place. Drill your weak topics on repeat, then prove it in a live 1v1 duel.
              </motion.p>
              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: 0.14 }}
                className="mt-8 flex flex-wrap items-center gap-3"
              >
                <Button size="lg" asChild>
                  <Link href={isAuthenticated ? "/practice" : "/signup"}>Start practicing</Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link href={isAuthenticated ? "/duel/matchmaking" : "/signup"}>
                    <Swords className="h-4 w-4" /> Find a duel
                  </Link>
                </Button>
              </motion.div>

              {/* Held back until the stats request settles so the strip never swaps chips under the reader. */}
              {statsQuery.isPending ? (
                <div className="mt-10 min-h-[5.625rem] sm:min-h-[4.75rem] border border-border bg-surface" aria-hidden="true" />
              ) : (
                <div
                  className={`numeric mt-10 grid min-h-[5.625rem] sm:min-h-[4.75rem] gap-px border border-border bg-border ${
                    stats.length === 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"
                  }`}
                >
                  {stats.map((stat) => (
                    <div key={stat.label} className="bg-surface px-4 py-3">
                      <AnimatedNumber value={stat.value} suffix={stat.suffix} className="block text-xl font-bold text-foreground sm:text-2xl" />
                      <p className="label-micro mt-1 flex items-center gap-1.5">
                        {stat.live ? <span className="h-1.5 w-1.5 rounded-full bg-primary motion-safe:animate-pulse" aria-hidden="true" /> : null}
                        {stat.label}
                      </p>
                    </div>
                  ))}
                </div>
              )}
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
                  <p className="numeric mt-2 text-3xl font-bold text-foreground">7</p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">You</p>
                </div>
                <p className="font-display text-2xl text-muted-foreground">VS</p>
                <div className="flex-1 border-2 border-secondary bg-card p-4 text-center">
                  <p className="numeric text-xs font-bold text-secondary">P2</p>
                  <p className="numeric mt-2 text-3xl font-bold text-foreground">6</p>
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

        <section aria-labelledby="topics-heading" className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
          <h2 id="topics-heading" className="font-display text-2xl uppercase tracking-wide text-foreground sm:text-3xl">
            What you can practise
          </h2>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Six topic areas from the IndiaBix question bank, each with its own accuracy tracking. Open one to see what it covers and how to get faster at it.
          </p>
          <div className="mt-5 grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
            {TOPICS.map((topic) => (
              <Link key={topic.slug} href={`/topics/${topic.slug}`} className="group block bg-surface p-5 transition-colors hover:bg-card">
                <h3 className="font-display text-base uppercase tracking-wide text-foreground transition-colors group-hover:text-primary">{topic.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{topic.blurb}</p>
              </Link>
            ))}
          </div>
        </section>

        <section aria-labelledby="faq-heading" className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <div>
              <h2 id="faq-heading" className="font-display text-2xl uppercase tracking-wide text-foreground sm:text-3xl">
                Questions, answered
              </h2>
              <p className="mt-2 max-w-xs text-sm text-muted-foreground">Everything to know before your first duel.</p>
            </div>
            <div className="divide-y divide-border border border-border">
              {FAQ.map((item) => (
                <div key={item.q} className="bg-surface p-5">
                  <h3 className="font-display text-base uppercase tracking-wide text-foreground">{item.q}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{item.a}</p>
                </div>
              ))}
            </div>
          </div>
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSON_LD) }} />
        </section>

        <section aria-labelledby="contribute-heading" className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
          <div className="grid gap-6 border-2 border-border bg-surface p-6 sm:p-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-center">
            <div>
              <h2 id="contribute-heading" className="font-display text-2xl uppercase tracking-wide text-foreground sm:text-3xl">
                Open to contribute
              </h2>
              <p className="mt-3 max-w-xl text-sm text-muted-foreground">
                quiz1v1 is built by{" "}
                <a href={AUTHOR_URL} target="_blank" rel="noreferrer noopener" className="font-medium text-foreground underline-offset-4 hover:underline">
                  {AUTHOR_NAME}
                </a>{" "}
                and its code is open source under the MIT license. Found a bug, want a new topic page, or have an idea for a duel mode? Issues and pull
                requests are welcome.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 lg:justify-end">
              <Button asChild>
                <a href={REPO_URL} target="_blank" rel="noreferrer noopener">
                  <Github /> View on GitHub
                </a>
              </Button>
              <Button variant="outline" asChild>
                <a href={ISSUES_URL} target="_blank" rel="noreferrer noopener">
                  Report an issue
                </a>
              </Button>
              <Button variant="outline" asChild>
                <a href={CONTRIBUTING_URL} target="_blank" rel="noreferrer noopener">
                  How to contribute
                </a>
              </Button>
            </div>
          </div>
        </section>

        <section aria-labelledby="follow-heading" className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
            <h2 id="follow-heading" className="font-display text-2xl uppercase tracking-wide text-foreground sm:text-3xl">
              Follow quiz1v1
            </h2>
            <p className="max-w-sm text-sm text-muted-foreground">Find us on Instagram and LinkedIn, or star the code on GitHub.</p>
          </div>
          <SocialCards />
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
            <Button size="lg" asChild>
              <Link href={isAuthenticated ? "/" : "/signup"}>
                {isAuthenticated ? "Enter the arena" : "Create your free account"}
              </Link>
            </Button>
          </div>
        </section>
      </main>
    </PublicShell>
  );
}
