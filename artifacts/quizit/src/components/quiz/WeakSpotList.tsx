import type { SubtopicWeakness } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";

/** A subtopic only counts as a weak spot once there is real evidence (3+ answers) and accuracy is actually low. */
export function isWeakSpot(item: SubtopicWeakness): boolean {
  return item.attempted >= 3 && item.accuracy < 75;
}

export function WeakSpotList({
  items,
  onDrill,
  disabled,
}: {
  items: SubtopicWeakness[];
  onDrill: (item: SubtopicWeakness) => void;
  disabled?: boolean;
}) {
  return (
    <ul className="grid gap-2.5 sm:grid-cols-2">
      {items.map((item) => (
        <li key={item.subtopic_id} className="flex items-stretch border border-border bg-surface">
          <span className="w-1 shrink-0 bg-secondary" aria-hidden />
          <div className="flex min-w-0 flex-1 items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">{item.subtopic_name}</p>
              <p className="truncate text-xs text-muted-foreground">{item.topic_name}</p>
              <div className="mt-2 flex items-center gap-2" role="img" aria-label={`${Math.round(item.accuracy)} percent accuracy`}>
                <div className="h-1 flex-1 bg-border">
                  <div className="h-full bg-secondary" style={{ width: `${Math.max(4, Math.min(100, item.accuracy))}%` }} />
                </div>
                <span className="numeric text-xs font-bold text-secondary">{Math.round(item.accuracy)}%</span>
              </div>
              <p className="numeric mt-1 text-[11px] text-muted-foreground">
                {item.attempted} answered{item.due_for_review > 0 ? ` · ${item.due_for_review} to review` : ""}
              </p>
            </div>
            <Button size="sm" variant="outline" disabled={disabled} onClick={() => onDrill(item)}>
              Drill
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
