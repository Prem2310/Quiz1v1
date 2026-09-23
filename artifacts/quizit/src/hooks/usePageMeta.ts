import { useEffect } from "react";

interface PageMeta {
  noindex?: boolean;
  /** Replaces <meta name="description"> for this route. */
  description?: string;
  /** Path such as "/topics/logical-reasoning". */
  canonicalPath?: string;
  /** Optional Open Graph image for this route. */
  ogImage?: string;
}

/**
 * Updates SEO metadata for the current client-side route.
 *
 * Handles:
 * - document title
 * - meta description
 * - robots
 * - canonical URL
 * - Open Graph title/description/url/image
 * - Twitter title/description/image
 *
 * Previous values are restored when the route changes/unmounts.
 */
export function usePageMeta(
  title: string,
  {
    noindex = false,
    description,
    canonicalPath,
    ogImage,
  }: PageMeta = {},
) {
  useEffect(() => {
    // Resolve against the build-time site URL that index.html's canonical carries (VITE_SITE_URL), not the host this
    // tab happens to be on: www, preview deploys and mirrors must still point search engines at the real site.
    const siteBase =
      document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href ??
      window.location.origin;
    // No explicit path: this page's own path, without query or hash, so ?utm_source=… links don't mint new canonicals.
    const canonicalUrl = new URL(canonicalPath ?? window.location.pathname, siteBase).href;

    const imageUrl = new URL(ogImage ?? "/og-image.png", siteBase).href;

    const previousTitle = document.title;

    const getMeta = (selector: string) =>
      document.querySelector<HTMLMetaElement>(selector);

    const getOrCreateMeta = (
      attribute: "name" | "property",
      value: string,
    ) => {
      const selector = `meta[${attribute}="${value}"]`;
      let meta = document.querySelector<HTMLMetaElement>(selector);

      if (!meta) {
        meta = document.createElement("meta");
        meta.setAttribute(attribute, value);
        document.head.appendChild(meta);
      }

      return meta;
    };

    const setMeta = (
      attribute: "name" | "property",
      name: string,
      content: string,
    ) => {
      const meta = getOrCreateMeta(attribute, name);
      const previousContent = meta.content;

      meta.content = content;

      return {
        meta,
        previousContent,
      };
    };

    const getCanonical = () =>
      document.querySelector<HTMLLinkElement>('link[rel="canonical"]');

    document.title = title;

    /* ---------------- Robots ---------------- */

    const robots = getMeta('meta[name="robots"]');
    const previousRobots = robots?.content;

    if (robots) {
      robots.content = noindex
        ? "noindex, nofollow"
        : "index, follow, max-image-preview:large";
    }

    /* ---------------- Description ---------------- */

    let previousDescription:
      | { meta: HTMLMetaElement; previousContent: string }
      | undefined;

    if (description) {
      previousDescription = setMeta(
        "name",
        "description",
        description,
      );
    }

    /* ---------------- Canonical ---------------- */

    const canonical = getCanonical();

    const previousCanonical = canonical?.href;

    if (canonical) {
      canonical.href = canonicalUrl;
    }

    /* ---------------- Open Graph ---------------- */

    const ogTitle = setMeta(
      "property",
      "og:title",
      title,
    );

    const ogUrl = setMeta(
      "property",
      "og:url",
      canonicalUrl,
    );

    const ogImageMeta = setMeta(
      "property",
      "og:image",
      imageUrl,
    );

    let ogDescription:
      | { meta: HTMLMetaElement; previousContent: string }
      | undefined;

    if (description) {
      ogDescription = setMeta(
        "property",
        "og:description",
        description,
      );
    }

    /* ---------------- Twitter ---------------- */

    const twitterTitle = setMeta(
      "name",
      "twitter:title",
      title,
    );

    const twitterImage = setMeta(
      "name",
      "twitter:image",
      imageUrl,
    );

    let twitterDescription:
      | { meta: HTMLMetaElement; previousContent: string }
      | undefined;

    if (description) {
      twitterDescription = setMeta(
        "name",
        "twitter:description",
        description,
      );
    }

    /* ---------------- Cleanup ---------------- */

    return () => {
      document.title = previousTitle;

      if (robots && previousRobots !== undefined) {
        robots.content = previousRobots;
      }

      if (previousDescription) {
        previousDescription.meta.content =
          previousDescription.previousContent;
      }

      if (canonical && previousCanonical !== undefined) {
        canonical.href = previousCanonical;
      }

      ogTitle.meta.content = ogTitle.previousContent;
      ogUrl.meta.content = ogUrl.previousContent;
      ogImageMeta.meta.content = ogImageMeta.previousContent;

      if (ogDescription) {
        ogDescription.meta.content =
          ogDescription.previousContent;
      }

      twitterTitle.meta.content = twitterTitle.previousContent;
      twitterImage.meta.content = twitterImage.previousContent;

      if (twitterDescription) {
        twitterDescription.meta.content =
          twitterDescription.previousContent;
      }
    };
  }, [title, noindex, description, canonicalPath, ogImage]);
}
