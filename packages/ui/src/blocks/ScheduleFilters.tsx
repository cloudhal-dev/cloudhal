import { Badge, Button, cn, DropdownMenu, Toolbar } from "@cloudflare/kumo";
import { BookmarkSimple, CaretDown, FloppyDisk } from "@phosphor-icons/react";

/**
 * Filter facets of the schedule views (RFC-0008 §15.5). `state` groups the release, automation
 * and run states the screen maps (scheduled, waiting, conflict, failed or missed, done, canceled).
 */
export type ScheduleFilterFacet =
  | "kind"
  | "state"
  | "origin"
  | "approval"
  | "collection"
  | "term"
  | "locale";

/** Selected values per facet; a facet that is absent or empty does not narrow. */
export type ScheduleFilterValue = Partial<Record<ScheduleFilterFacet, readonly string[]>>;

export interface ScheduleFilterOption {
  value: string;
  /** Already worded ("Publish", "Waiting for approval", "Desk"). */
  label: string;
}

export interface ScheduleFacetDefinition {
  facet: ScheduleFilterFacet;
  options: readonly ScheduleFilterOption[];
}

export interface ScheduleView {
  id: string;
  label: string;
  /** Built-in views (All, Waiting for approval, Proposed by agents, This week, Needs attention, Mine) list first. */
  builtin?: boolean;
}

export interface ScheduleFiltersLabels {
  /** The toolbar's name ("Filter schedules"). */
  toolbar: string;
  /** Facet names on their buttons ("Kind", "State", "Origin", "Approval", "Collection", "Category or tag", "Language"). */
  facet: Record<ScheduleFilterFacet, string>;
  /** A facet button's name with its selection count: "Kind, 2 selected". */
  selected: (facet: string, count: number) => string;
  /** The ghost button ("Clear filters"). */
  clear: string;
  /** The view menu's name ("View") and its groups ("Built-in views", "Saved views"). */
  view: string;
  builtinViews: string;
  savedViews: string;
  /** "Save view…", shown with `onSaveView`. */
  saveView?: string;
}

export interface ScheduleFiltersProps {
  /** Controlled; the screen keeps it in the URL (`?kind=publish,release&origin=agent`). */
  value: ScheduleFilterValue;
  onChange: (next: ScheduleFilterValue) => void;
  /** The facets shown, in order, with their options. */
  facets: readonly ScheduleFacetDefinition[];
  labels: ScheduleFiltersLabels;
  /** Built-in and saved views, and the one in force (its id, or undefined for a custom filter). */
  views?: readonly ScheduleView[];
  view?: string | undefined;
  onViewChange?: (id: string) => void;
  onSaveView?: () => void;
  className?: string;
}

/** True when any facet narrows the list. */
export function isScheduleFilterActive(value: ScheduleFilterValue): boolean {
  return Object.values(value).some((v) => (v?.length ?? 0) > 0);
}

/**
 * The calendar's filters (RFC-0008 §15.5; the `CommentFilters` pattern): a Kumo `Toolbar` whose
 * buttons open `DropdownMenu`s of checkbox items — every facet takes several values — with the
 * count as a `Badge`, a ghost "Clear filters" while any narrows, and the view menu (built-in
 * views first, then saved ones, and "Save view…") as radio items. Controlled; the URL is the
 * screen's (`lib/schedules-search.ts`). On phones the toolbar scrolls inside itself, never the page.
 */
export function ScheduleFilters({
  value,
  onChange,
  facets,
  labels,
  views,
  view,
  onViewChange,
  onSaveView,
  className,
}: ScheduleFiltersProps) {
  const toggle = (facet: ScheduleFilterFacet, option: string, on: boolean) => {
    const current = value[facet] ?? [];
    const next = on ? [...current, option] : current.filter((v) => v !== option);
    const out: ScheduleFilterValue = { ...value, [facet]: next };
    if (next.length === 0) delete out[facet];
    onChange(out);
  };
  const builtin = views?.filter((v) => v.builtin) ?? [];
  const saved = views?.filter((v) => !v.builtin) ?? [];
  const viewLabel = views?.find((v) => v.id === view)?.label ?? labels.view;
  return (
    <div
      className={cn("flex min-w-0 flex-wrap items-center gap-2", className)}
      data-schedule-filters=""
    >
      {views && views.length > 0 && onViewChange && (
        <DropdownMenu>
          <DropdownMenu.Trigger
            render={
              <Button
                variant="secondary"
                icon={<BookmarkSimple size={16} />}
                aria-label={`${labels.view}: ${viewLabel}`}
                data-schedule-view={view ?? ""}
              />
            }
          >
            {viewLabel}
            <CaretDown size={12} aria-hidden />
          </DropdownMenu.Trigger>
          <DropdownMenu.Content>
            <DropdownMenu.RadioGroup
              value={view ?? ""}
              onValueChange={(v) => onViewChange(String(v))}
            >
              {builtin.length > 0 && (
                <DropdownMenu.Group>
                  <DropdownMenu.Label>{labels.builtinViews}</DropdownMenu.Label>
                  {builtin.map((v) => (
                    <DropdownMenu.RadioItem key={v.id} value={v.id}>
                      {v.label}
                    </DropdownMenu.RadioItem>
                  ))}
                </DropdownMenu.Group>
              )}
              {saved.length > 0 && (
                <DropdownMenu.Group>
                  <DropdownMenu.Label>{labels.savedViews}</DropdownMenu.Label>
                  {saved.map((v) => (
                    <DropdownMenu.RadioItem key={v.id} value={v.id}>
                      {v.label}
                    </DropdownMenu.RadioItem>
                  ))}
                </DropdownMenu.Group>
              )}
            </DropdownMenu.RadioGroup>
            {onSaveView && labels.saveView && (
              <>
                <DropdownMenu.Separator />
                <DropdownMenu.Item icon={<FloppyDisk size={16} />} onClick={onSaveView}>
                  {labels.saveView}
                </DropdownMenu.Item>
              </>
            )}
          </DropdownMenu.Content>
        </DropdownMenu>
      )}
      {/* Phones: the joined buttons scroll sideways inside the toolbar, never the page. */}
      <Toolbar
        aria-label={labels.toolbar}
        className="min-w-0 max-w-full overflow-x-auto [scrollbar-width:none]"
      >
        {facets.map(({ facet, options }) => {
          const chosen = value[facet] ?? [];
          return (
            <DropdownMenu key={facet}>
              <DropdownMenu.Trigger
                render={
                  <Toolbar.Button
                    aria-label={
                      chosen.length > 0
                        ? labels.selected(labels.facet[facet], chosen.length)
                        : labels.facet[facet]
                    }
                    data-schedule-facet={facet}
                  />
                }
              >
                <span className="flex items-center gap-1.5 whitespace-nowrap">
                  {labels.facet[facet]}
                  {chosen.length > 0 && (
                    <Badge variant="secondary">
                      <span className="tabular-nums">{chosen.length}</span>
                    </Badge>
                  )}
                  <CaretDown size={12} aria-hidden />
                </span>
              </DropdownMenu.Trigger>
              <DropdownMenu.Content>
                {options.map((o) => (
                  <DropdownMenu.CheckboxItem
                    key={o.value}
                    checked={chosen.includes(o.value)}
                    onCheckedChange={(on: boolean) => toggle(facet, o.value, on)}
                    closeOnClick={false}
                    data-option={o.value}
                  >
                    {o.label}
                  </DropdownMenu.CheckboxItem>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu>
          );
        })}
      </Toolbar>
      {isScheduleFilterActive(value) && (
        <Button variant="ghost" onClick={() => onChange({})} data-schedule-clear="">
          {labels.clear}
        </Button>
      )}
    </div>
  );
}
