import { Button, cn, Select, Toolbar } from "@cloudflare/kumo";
import type { CommentStatus } from "@cloudhal/core-contracts";
import { COMMENT_LABELS, COMMENT_STATUSES, type CommentLabelName } from "./comment-model.ts";

export type CommentStatusFilter = "all" | CommentStatus | "reported";
export type CommentLabelFilter = "all" | CommentLabelName;
/** "Hidden or labelled by agents" (RFC-0007 §11.2 point 4). */
export type CommentActorFilter = "all" | "agents";
export type CommentDateFilter = "all" | "24h" | "7d" | "30d" | "90d";

export interface CommentFilterValue {
  status: CommentStatusFilter;
  /** An entry id, or `all`. */
  entry: string;
  label: CommentLabelFilter;
  actor: CommentActorFilter;
  date: CommentDateFilter;
}

export const DEFAULT_COMMENT_FILTERS: CommentFilterValue = {
  status: "all",
  entry: "all",
  label: "all",
  actor: "all",
  date: "all",
};

export const COMMENT_DATE_FILTERS: readonly CommentDateFilter[] = [
  "all",
  "24h",
  "7d",
  "30d",
  "90d",
];

/** True when any filter narrows the list (the screen then shows "Clear filters"). */
export function isCommentFilterActive(
  value: CommentFilterValue,
  facets: readonly CommentFilterFacet[] = ["status", "entry", "label", "actor", "date"],
): boolean {
  return facets.some((f) => value[f] !== "all");
}

/** The start of a date filter's window, as an RFC 3339 instant for the API's `since`. */
export function commentFilterSince(
  date: CommentDateFilter,
  now: number = Date.now(),
): string | undefined {
  const hours = { all: 0, "24h": 24, "7d": 168, "30d": 720, "90d": 2160 }[date];
  return hours ? new Date(now - hours * 3_600_000).toISOString() : undefined;
}

export type CommentFilterFacet = keyof CommentFilterValue;

export interface CommentFiltersLabels {
  /** Accessible name of the toolbar ("Filter comments"). */
  toolbar: string;
  /** Accessible names of the selects. */
  facet: Record<CommentFilterFacet, string>;
  status: Record<CommentStatusFilter, string>;
  /** "All articles". */
  allEntries: string;
  /** Label filter: "All labels" and each label's name (`CommentWords.label`). */
  allLabels: string;
  label: Record<CommentLabelName, string>;
  /** "Anyone", "Hidden or labelled by agents". */
  actor: Record<CommentActorFilter, string>;
  /** "Any time", "Last 24 hours", "Last 7 days" … */
  date: Record<CommentDateFilter, string>;
  /** The ghost button ("Clear filters"). */
  clear: string;
}

export interface CommentFiltersProps {
  value: CommentFilterValue;
  onChange: (next: CommentFilterValue) => void;
  labels: CommentFiltersLabels;
  /**
   * Which selects to show, in order. The queue leaves out `status` (its page tabs are the status);
   * a commenter's list may leave out `entry`. Default: entry, label, actor, date.
   */
  facets?: readonly CommentFilterFacet[];
  /** The entries to filter by (articles with comments), as `{ value: nodeId, label: title }`. */
  entries?: readonly { value: string; label: string }[];
  /** While the entries load (the entry select shows a skeleton). */
  entriesLoading?: boolean;
  className?: string;
}

/**
 * The moderation queue's filters (RFC-0007 §14 queue; DESIGN.md §2w): a Kumo `Toolbar` of
 * `Select`s rendered as toolbar buttons — status, entry, label, "Hidden or labelled by agents",
 * date — and a ghost "Clear filters" while any narrows the list. Sits on the right of the
 * screen's `ListToolbar` (search on the left), like the media library's filters; it wraps under
 * the search on phones. Words are props; entry titles are plain text.
 */
export function CommentFilters({
  value,
  onChange,
  labels,
  facets = ["entry", "label", "actor", "date"],
  entries = [],
  entriesLoading,
  className,
}: CommentFiltersProps) {
  const set = <K extends CommentFilterFacet>(key: K, v: CommentFilterValue[K]) =>
    onChange({ ...value, [key]: v });
  const items: Record<CommentFilterFacet, Record<string, string>> = {
    status: Object.fromEntries(
      (["all", ...COMMENT_STATUSES, "reported"] as CommentStatusFilter[]).map((s) => [
        s,
        labels.status[s],
      ]),
    ),
    entry: {
      all: labels.allEntries,
      ...Object.fromEntries(entries.map((e) => [e.value, e.label])),
    },
    label: {
      all: labels.allLabels,
      ...Object.fromEntries(COMMENT_LABELS.map((l) => [l, labels.label[l]])),
    },
    actor: { all: labels.actor.all, agents: labels.actor.agents },
    date: Object.fromEntries(COMMENT_DATE_FILTERS.map((d) => [d, labels.date[d]])),
  };
  const active = isCommentFilterActive(value, facets);
  return (
    <div
      className={cn("flex min-w-0 flex-wrap items-center gap-2", className)}
      data-testid="comment-filters"
    >
      {active && (
        <Button
          variant="ghost"
          onClick={() =>
            onChange({
              ...value,
              ...Object.fromEntries(facets.map((f) => [f, "all"])),
            } as CommentFilterValue)
          }
        >
          {labels.clear}
        </Button>
      )}
      <Toolbar aria-label={labels.toolbar} className="max-w-full">
        {facets.map((f) => (
          <Select
            key={f}
            aria-label={labels.facet[f]}
            value={value[f]}
            onValueChange={(v) => set(f, (v ?? "all") as CommentFilterValue[typeof f])}
            items={items[f]}
            loading={f === "entry" && entriesLoading}
            render={<Toolbar.Button />}
            data-comment-filter={f}
          />
        ))}
      </Toolbar>
    </div>
  );
}
