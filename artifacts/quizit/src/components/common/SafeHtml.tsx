import { useMemo } from "react";
import DOMPurify from "dompurify";

interface Props {
  html: string;
  className?: string;
}

const ASSET_HOST = "https://www.indiabix.com";

/** IndiaBix's math notation (fractions, brackets, root signs) ships as tiny relative-path
 * images and marked-up tables — rewrite `/_files/...` src attributes to absolute URLs so
 * they actually load (credit: IndiaBix, see footer). */
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "IMG") {
    const src = node.getAttribute("src");
    if (src && src.startsWith("/")) {
      node.setAttribute("src", `${ASSET_HOST}${src}`);
    }
    node.setAttribute("loading", "lazy");
  }
});

const NBSP = " ";

/**
 * IndiaBix's original markup fakes column alignment (figure labels sitting under
 * boxes in a combined problem/answer-figure image, "Problem Figures:" vs "Answer
 * Figures:" columns, etc.) with runs of repeated `&nbsp;`, which browsers never
 * collapse — IndiaBix's own CSS (`.nvr-ques-text{white-space:nowrap}`) then just
 * trusts those literal widths. Our scraped content sometimes flattened those
 * non-breaking spaces to plain ASCII spaces, which HTML *does* collapse to one,
 * losing the gap. This restores it: every run of 2+ plain spaces becomes the same
 * number of real non-breaking spaces, so it behaves exactly like a question that
 * kept its `&nbsp;` — existing non-breaking spaces are left untouched. */
function restoreNbspRuns(container: HTMLElement): void {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const text = node.textContent ?? "";
    if (/ {2,}/.test(text)) {
      node.textContent = text.replace(/ {2,}/g, (run) => NBSP.repeat(run.length));
    }
    node = walker.nextNode();
  }
}

/** IndiaBix's root/√ symbols (`.ga-root-h1` etc., see index.css) are a background-image
 * GIF behind literal text/exponent content — the dark-theme `filter: invert()` that
 * makes the black-ink glyph visible on our dark ground would also invert the text
 * sitting on top of it. Wrap that content in an inner span the CSS re-inverts, so the
 * glyph flips but the number reads normally. */
const ROOT_SYMBOL_CLASSES = new Set([
  "ga-root-h1", "ga-root-h2", "ga-3root-h1", "ga-nroot-h1", "ga-tbl-dsqrt",
  "ga-td-root-up-h2", "ga-td-xmark", "root", "root3", "rootn",
]);

function wrapRootSymbolContent(container: HTMLElement): void {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT);
  const targets: Element[] = [];
  let el = walker.nextNode();
  while (el) {
    const classList = (el as Element).classList;
    if ([...classList].some((c) => ROOT_SYMBOL_CLASSES.has(c))) targets.push(el as Element);
    el = walker.nextNode();
  }
  for (const target of targets) {
    const inner = document.createElement("span");
    inner.className = "ga-root-content";
    while (target.firstChild) inner.appendChild(target.firstChild);
    target.appendChild(inner);
  }
}

const ALLOWED_TAGS = [
  "p", "br", "strong", "em", "u", "i", "b", "sup", "sub", "a", "img",
  "div", "span", "ul", "ol", "li", "h1", "h2", "h3", "h4", "h5", "h6",
  "table", "thead", "tbody", "tr", "td", "th",
];
const ALLOWED_ATTR = ["src", "alt", "href", "title", "class", "id", "style", "width", "height", "align", "rowspan", "colspan", "cellpadding", "cellspacing"];

/**
 * Renders HTML content safely using DOMPurify to sanitize and prevent XSS.
 * Allows images, links, basic formatting, and the small answer-notation tables
 * IndiaBix uses for fractions/expressions — blocks scripts and everything else.
 */
export function SafeHtml({ html, className = "" }: Props) {
  const sanitized = useMemo(() => {
    const clean = DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR, ALLOW_DATA_ATTR: false, KEEP_CONTENT: true });
    const container = document.createElement("div");
    container.innerHTML = clean;
    restoreNbspRuns(container);
    wrapRootSymbolContent(container);
    return container.innerHTML;
  }, [html]);

  return (
    <div
      className={`indiabix-html ${className}`}
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}
