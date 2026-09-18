import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  /** @deprecated no longer rendered — the heading carries its own weight */
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4 border-b border-border pb-4 sm:flex sm:flex-wrap sm:justify-between">
      <div className="min-w-0">
        <h1 className="truncate font-display text-3xl uppercase tracking-wide text-foreground sm:text-4xl">{title}</h1>
        {description ? <p className="mt-2 max-w-xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions}
    </header>
  );
}
