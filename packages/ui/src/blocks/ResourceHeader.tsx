import { Tabs, type TabsItem } from "@cloudflare/kumo";
import type { ReactNode } from "react";

export interface ResourceMode {
  /** The resource's sub-views, in the dashboard's order: Overview, Metrics, Deployments, …, Settings. */
  tabs: TabsItem[];
  /** The current tab (from the route), so other navigation keeps it in sync. */
  tab: string;
  onTabChange: (value: string) => void;
  /** Kumo's scroll buttons for a tab bar wider than the page, from the screen's catalog. */
  tabLabels: { scrollStart: string; scrollEnd: string };
  /** An environment switcher shown after the breadcrumbs in the top bar (production, preview). */
  switcher?: ReactNode;
}

/**
 * The header of a resource page (`PageLayout resource`): Kumo's underline `Tabs` with the
 * page's actions on the right, the primary action last, over one hairline. The title is the page's
 * visually hidden `h1`, so the page keeps one heading without a large title. In the DOM the tabs
 * come before the actions, so focus moves: crumbs and switcher (top bar), the tab bar (one stop;
 * arrow keys move between tabs, Enter or Space opens one), then the actions, then the content.
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
  return (
    <div
      className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-kumo-line"
      data-resource-header=""
    >
      {title !== undefined && <h1 className="sr-only">{title}</h1>}
      <Tabs
        variant="underline"
        tabs={resource.tabs}
        value={resource.tab}
        onValueChange={(next) => resource.onTabChange(String(next))}
        labels={resource.tabLabels}
        className="max-w-full min-w-0"
      />
      {actions && (
        <div className="flex max-w-full min-w-0 shrink-0 flex-wrap items-center gap-2 pb-2">
          {actions}
        </div>
      )}
    </div>
  );
}
