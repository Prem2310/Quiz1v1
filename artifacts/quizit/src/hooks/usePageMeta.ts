import { useEffect } from "react";

/** Sets the tab title for a route (and optionally `noindex`), restoring both when the route unmounts. */
export function usePageMeta(title: string, { noindex = false }: { noindex?: boolean } = {}) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;
    const robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const previousRobots = robots?.content;
    if (noindex && robots) robots.content = "noindex, nofollow";
    return () => {
      document.title = previousTitle;
      if (robots && previousRobots !== undefined) robots.content = previousRobots;
    };
  }, [title, noindex]);
}
