import { Tabs, type TabsItem } from "@cloudflare/kumo";
import type { ReactNode } from "react";

export interface ResourceMode {
  /** The resource's sub-views, in the dashboard's order: Overview, Metrics, Deployments, …, Settings. */
  tabs: TabsItem[];
  /** The current tab (from the route), so other navigation keeps it in sync. */
  tab: string;
  onTabChange: (value: string) => void;
  /** An environment switcher shown after the breadcrumbs in the top bar (production, preview). */
  switcher?: ReactNode;
}

/**
 * The header of a resource page (`PageLayout resource`): Kumo's underline `Tabs` with the
 * page's actions on the right, the primary action last, over one hairline (Kumo's own list border
 * is turned off, so the active indicator always sits on this one rule: under the whole row when
 * the page is wide, under the tab line when it is narrow and the actions go below). The title is the
 * page's visually hidden `h1`, so the page keeps one heading without a large title. In the DOM the
 * tabs come before the actions, so focus moves: crumbs and switcher (top bar), the tab bar (one
 * stop; arrow keys move between tabs, Enter or Space opens one), then the actions, then the
 * content. A tab bar wider than the page (a phone) scrolls sideways; underline tabs have no
 * scroll buttons, and the arrow keys bring the focused tab into view.
 */
export function ResourceHeader({
  title,
  actions,
  resource,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  resource: ResourceMode;
}) {
  // Never a wrapping row: wrapped, the rule would sit under the actions and leave the tabs and
  // their indicator above it with none. Wide (the page container ≥ 48 rem): one line over one rule,
  // the tab list the part that shrinks and scrolls, the actions fixed. Narrow: the tab line carries
  // the rule across the full width and the actions follow on their own line, so the focus order
  // (tabs, then actions) is also the visual one.
  return (
    <div
      className="flex flex-col gap-3 @3xl/page:flex-row @3xl/page:items-end @3xl/page:gap-6 @3xl/page:border-b @3xl/page:border-kumo-hairline"
      data-resource-header=""
    >
      {title !== undefined && <h1 className="sr-only">{title}</h1>}
      <div
        className="min-w-0 border-b border-kumo-hairline @3xl/page:min-w-40 @3xl/page:flex-1 @3xl/page:border-b-0"
        data-resource-tabs=""
      >
        <Tabs
          variant="underline"
          tabs={resource.tabs}
          value={resource.tab}
          onValueChange={(next) => resource.onTabChange(String(next))}
          className="w-full min-w-0"
          listClassName="border-b-0"
        />
      </div>
      {actions && (
        <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-2 @3xl/page:flex-nowrap @3xl/page:pb-2">
          {actions}
        </div>
      )}
    </div>
  );
}
