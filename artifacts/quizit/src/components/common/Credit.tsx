import { AUTHOR_NAME, AUTHOR_URL, REPO_URL } from "@/content/project";

const LINK = "font-medium text-foreground underline-offset-4 hover:underline";

/** "Built by Prem2310 · Open source on GitHub": the credit line used in the footer, the app sidebar and Profile. */
export function Credit({ className }: { className?: string }) {
  return (
    <p className={className}>
      Built by{" "}
      <a href={AUTHOR_URL} target="_blank" rel="noreferrer noopener" className={LINK}>
        {AUTHOR_NAME}
      </a>{" "}
      ·{" "}
      <a href={REPO_URL} target="_blank" rel="noreferrer noopener" className={LINK}>
        Open source on GitHub
      </a>
    </p>
  );
}
