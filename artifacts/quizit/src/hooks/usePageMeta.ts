import { useEffect } from "react";

interface PageMeta {
  noindex?: boolean;
  /** Replaces <meta name="description"> for this route. */
  description?: string;
  /** Path (e.g. "/topics/logical-reasoning") the canonical link should point at, on the same origin as the built-in canonical. */
  canonicalPath?: string;
}

/** Sets the tab title (and optionally description, canonical and `noindex`) for a route, restoring all of it when the route unmounts. */
export function usePageMeta(title: string, { noindex = false, description, canonicalPath }: PageMeta = {}) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;

    const robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const previousRobots = robots?.content;
    if (noindex && robots) robots.content = "noindex, nofollow";

    const desc = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const previousDesc = desc?.content;
    if (description && desc) desc.content = description;

    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    const previousCanonical = canonical?.href;
    if (canonicalPath && canonical) canonical.href = new URL(canonicalPath, canonical.href).href;

    return () => {
      document.title = previousTitle;
      if (robots && previousRobots !== undefined) robots.content = previousRobots;
      if (desc && previousDesc !== undefined) desc.content = previousDesc;
      if (canonical && previousCanonical !== undefined) canonical.href = previousCanonical;
    };
  }, [title, noindex, description, canonicalPath]);
}
