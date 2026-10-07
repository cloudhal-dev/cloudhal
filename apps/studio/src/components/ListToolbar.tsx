import { Toolbar } from "@cloudhal/ui";
import { MagnifyingGlass } from "@phosphor-icons/react";
import type { ReactNode } from "react";

/** Search row above every table: Toolbar on the left, the primary action on the right. */
export function ListToolbar({
  search,
  onSearch,
  placeholder,
  actions,
}: {
  search: string;
  onSearch: (v: string) => void;
  placeholder: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Toolbar size="sm" className="w-full max-w-md" aria-label={placeholder}>
        <Toolbar.Button icon={<MagnifyingGlass />} aria-label={placeholder} />
        <Toolbar.Input
          aria-label={placeholder}
          placeholder={placeholder}
          value={search}
          onChange={(e) => onSearch((e.target as HTMLInputElement).value)}
          className="flex-1"
        />
      </Toolbar>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
