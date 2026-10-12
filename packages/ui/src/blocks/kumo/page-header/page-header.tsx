import { cn, SkeletonLine, Tabs, type TabsItem } from "@cloudflare/kumo";
import type { ReactNode } from "react";

// Copied with `kumo add PageHeader` and owned by Cloudhal. Changes from upstream, all marked
// "Cloudhal": breadcrumbs optional (Studio renders them in the top bar, see `PageLayout`), every row
// flush with the content edge (upstream indents title and tabs by `pl-3`), 14px description,
// optional icon, `actions` on the title row, controlled `tab`, loading title.

export const KUMO_PAGE_HEADER_VARIANTS = {
  spacing: {
    compact: {
      classes: "gap-1",
      description: "Compact spacing between header elements",
    },
    base: {
      classes: "gap-2",
      description: "Default spacing between header elements",
    },
    relaxed: {
      classes: "gap-4",
      description: "Relaxed spacing for more prominent headers",
    },
  },
} as const;

export const KUMO_PAGE_HEADER_DEFAULT_VARIANTS = {
  spacing: "base",
} as const;

export type KumoPageHeaderSpacing = keyof typeof KUMO_PAGE_HEADER_VARIANTS.spacing;

export interface KumoPageHeaderVariantsProps {
  spacing?: KumoPageHeaderSpacing;
}

export function pageHeaderVariants({
  spacing = KUMO_PAGE_HEADER_DEFAULT_VARIANTS.spacing,
}: KumoPageHeaderVariantsProps = {}) {
  return cn("flex flex-col", KUMO_PAGE_HEADER_VARIANTS.spacing[spacing].classes);
}

export interface PageHeaderProps extends KumoPageHeaderVariantsProps {
  /** Cloudhal: optional; Studio pages pass crumbs to `PageLayout`, which renders them in the top bar. */
  breadcrumbs?: ReactNode;
  /** Cloudhal: `undefined` while loading renders a skeleton when `loading` is set. */
  title?: ReactNode;
  description?: ReactNode;
  /** Cloudhal: 24px icon before the title (list pages). */
  icon?: ReactNode;
  /** Cloudhal: shows a skeleton in place of a title that has not loaded yet. */
  loading?: boolean;
  tabs?: TabsItem[];
  defaultTab?: string;
  /** Cloudhal addition: controlled tab (e.g. derived from the route) so other navigation keeps it in sync. */
  tab?: string;
  onValueChange?: (value: string) => void;
  className?: string;
  children?: React.ReactNode;
  /** Cloudhal addition: actions rendered on the title row (right-aligned). */
  actions?: ReactNode;
}

export function PageHeader({
  breadcrumbs,
  title,
  description,
  icon,
  loading = false,
  tabs,
  defaultTab,
  tab,
  onValueChange,
  spacing = "base",
  className,
  children,
  actions,
}: PageHeaderProps) {
  const showTitle = title !== undefined || loading;
  return (
    <div className={cn(pageHeaderVariants({ spacing }), className)}>
      {breadcrumbs && <div className="border-b border-kumo-line">{breadcrumbs}</div>}

      {(showTitle || description || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="flex min-w-0 flex-[1_1_20rem] flex-col gap-1.5">
            {showTitle && (
              <div className="flex min-w-0 items-center gap-2">
                {icon && <span className="flex shrink-0 items-center text-kumo-subtle">{icon}</span>}
                {title === undefined ? (
                  <div className="w-64 max-w-full py-2">
                    <SkeletonLine minWidth={60} maxWidth={100} />
                  </div>
                ) : (
                  <h1 className="min-w-0 truncate font-heading text-3xl font-semibold text-kumo-default">
                    {title}
                  </h1>
                )}
              </div>
            )}
            {description && (
              <div className="max-w-prose text-base text-pretty text-kumo-subtle">{description}</div>
            )}
          </div>
          {actions && <div className="flex max-w-full min-w-0 shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}

      {tabs && (
        <div className="flex w-full flex-wrap items-center justify-between gap-3 pt-2">
          <Tabs
            tabs={tabs}
            {...(tab !== undefined ? { value: tab } : { selectedValue: defaultTab })}
            onValueChange={(nextValue) => {
              const stringValue = String(nextValue);
              onValueChange?.(stringValue);
            }}
          />

          <div className="flex items-center gap-2">{children}</div>
        </div>
      )}
    </div>
  );
}
