import { cn, RefreshButton, Toolbar } from "@cloudflare/kumo";
import { MagnifyingGlass } from "@phosphor-icons/react";
import type { ReactNode } from "react";

export interface ListToolbarRefresh {
  onRefresh: () => void;
  /** The icon button's accessible name ("Refresh"), from the screen's catalog. */
  label: string;
  /** Spins while a refetch runs. */
  loading?: boolean;
}

export interface ListToolbarProps {
  search: string;
  onSearch: (value: string) => void;
  /** The search field's placeholder and accessible name, from the screen's catalog. */
  placeholder: string;
  /** Filter controls (`Select`s, a segmented `Tabs`, "Clear filters"), right after the search. */
  filters?: ReactNode;
  /** The sort control, after the filters. */
  sort?: ReactNode;
  /** Other controls a list needs, between the filters and the sort. */
  actions?: ReactNode;
  /** The refresh icon button, always last. */
  refresh?: ListToolbarRefresh;
  className?: string;
}

/**
 * The toolbar above every list (DESIGN.md §2a), with fixed slots in a fixed order: the search
 * (it fills the free width), filters, other actions, sort, then refresh last as an icon button.
 * One component keeps every list's row the same. The search is a Kumo `Toolbar` at the default
 * size, so it lines up with `Select` filters and buttons on the same row. The page's primary
 * "Create …" action belongs in `PageLayout actions`, never here. Every word is a prop.
 */
export function ListToolbar({
  search,
  onSearch,
  placeholder,
  filters,
  sort,
  actions,
  refresh,
  className,
}: ListToolbarProps) {
  const controls = filters || actions || sort || refresh;
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)} data-list-toolbar="">
      <Toolbar className="min-w-48 flex-1 basis-64" aria-label={placeholder}>
        <Toolbar.Button icon={<MagnifyingGlass />} aria-label={placeholder} />
        <Toolbar.Input
          aria-label={placeholder}
          placeholder={placeholder}
          value={search}
          onChange={(e) => onSearch((e.target as HTMLInputElement).value)}
          className="flex-1"
        />
      </Toolbar>
      {controls && (
        <div className="flex max-w-full min-w-0 flex-wrap items-center justify-end gap-2">
          {filters}
          {actions}
          {sort}
          {refresh && (
            <RefreshButton
              variant="secondary"
              aria-label={refresh.label}
              loading={refresh.loading}
              onClick={refresh.onRefresh}
            />
          )}
        </div>
      )}
    </div>
  );
}
