import { Link } from "wouter";
import { ChevronRight, Swords } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PublicShell } from "@/components/layout/PublicShell";
import { findTopic, type Topic } from "@/content/topics";
import { usePageMeta } from "@/hooks/usePageMeta";
import NotFound from "@/pages/not-found";
import { useAuth } from "@/stores/auth";

const H2 = "font-display text-2xl uppercase tracking-wide text-foreground sm:text-3xl";

/** Unknown slugs get the normal 404 (which sets its own title and noindex). */
export default function TopicPage({ slug }: { slug: string }) {
  const topic = findTopic(slug);
  return topic ? <TopicView topic={topic} /> : <NotFound />;
}

/** Public, indexable explainer for one aptitude topic: what it covers, how to get faster, FAQ, and a way into the app. */
function TopicView({ topic }: { topic: Topic }) {
  const { isAuthenticated } = useAuth();
  usePageMeta(topic.title, { description: topic.description, canonicalPath: `/topics/${topic.slug}` });

  const origin = window.location.origin;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "quiz1v1", item: `${origin}/` },
          { "@type": "ListItem", position: 2, name: topic.name, item: `${origin}/topics/${topic.slug}` },
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: topic.faq.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
      },
    ],
  };
  const related = topic.related.map((s) => findTopic(s)).filter((t) => t !== undefined);

  return (
    <PublicShell>
      <main>
        <article className="mx-auto max-w-4xl px-4 pb-20 pt-6 sm:px-6">
          <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">
            <ol className="flex items-center gap-1.5">
              <li>
                <Link href="/" className="hover:text-foreground">
                  quiz1v1
                </Link>
              </li>
              <li aria-hidden="true">
                <ChevronRight className="h-3 w-3" />
              </li>
              <li aria-current="page" className="text-foreground">
                {topic.name}
              </li>
            </ol>
          </nav>

          <h1 className="mt-6 text-balance font-display text-4xl uppercase leading-[0.95] tracking-wide text-foreground sm:text-6xl">{topic.heading}</h1>
          <div className="mt-5 max-w-2xl space-y-3 text-base text-muted-foreground sm:text-lg">
            {topic.intro.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button size="lg" asChild>
              <Link href={isAuthenticated ? "/practice" : "/signup"}>Start practicing</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href={isAuthenticated ? "/duel/matchmaking" : "/signup"}>
                <Swords className="h-4 w-4" /> Find a duel
              </Link>
            </Button>
          </div>

          <section aria-labelledby="covers-heading" className="mt-16">
            <h2 id="covers-heading" className={H2}>
              What it covers
            </h2>
            <ul className="mt-5 grid gap-px border border-border bg-border sm:grid-cols-2">
              {topic.covers.map((item) => (
                <li key={item} className="bg-surface px-4 py-3 text-sm font-semibold text-foreground">
                  {item}
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="tips-heading" className="mt-16">
            <h2 id="tips-heading" className={H2}>
              How to get faster
            </h2>
            <div className="mt-5 divide-y divide-border border border-border">
              {topic.tips.map((tip) => (
                <div key={tip.title} className="bg-surface p-5">
                  <h3 className="font-display text-base uppercase tracking-wide text-foreground">{tip.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{tip.body}</p>
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby="faq-heading" className="mt-16">
            <h2 id="faq-heading" className={H2}>
              Questions, answered
            </h2>
            <div className="mt-5 divide-y divide-border border border-border">
              {topic.faq.map((item) => (
                <div key={item.q} className="bg-surface p-5">
                  <h3 className="font-display text-base uppercase tracking-wide text-foreground">{item.q}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{item.a}</p>
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby="more-heading" className="mt-16">
            <h2 id="more-heading" className={H2}>
              More topics
            </h2>
            <div className="mt-5 flex flex-wrap gap-2">
              {related.map((t) => (
                <Button key={t.slug} variant="outline" asChild>
                  <Link href={`/topics/${t.slug}`}>{t.name}</Link>
                </Button>
              ))}
            </div>
          </section>

          <div className="mt-16 flex flex-col items-center gap-4 border-2 border-primary bg-primary/10 p-8 text-center">
            <h2 className={H2}>Practise it against a real opponent</h2>
            <p className="max-w-md text-sm text-muted-foreground">Free to use. No credit card. Just questions, a rating, and people to beat.</p>
            <Button size="lg" asChild>
              <Link href={isAuthenticated ? "/" : "/signup"}>{isAuthenticated ? "Enter the arena" : "Create your free account"}</Link>
            </Button>
          </div>

          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        </article>
      </main>
    </PublicShell>
  );
}
