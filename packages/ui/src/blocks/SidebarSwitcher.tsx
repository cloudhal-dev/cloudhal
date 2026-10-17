import { DropdownMenu } from "@cloudflare/kumo";
import { CaretUpDown, Check } from "@phosphor-icons/react";
import type { ComponentType, ReactNode } from "react";

export interface SwitcherItem {
  id: string;
  name: string;
  icon?: ComponentType<{ className?: string; weight?: "fill" | "regular" }>;
}

export interface SidebarSwitcherProps {
  /** The currently selected surface (account or site). */
  current: SwitcherItem;
  items: SwitcherItem[];
  onSelect: (item: SwitcherItem) => void;
  /** Extra rows after a separator (e.g. "All sites"). */
  extra?: ReactNode;
  ariaLabel: string;
}

/**
 * Surface switcher for `Sidebar.Header`, following Kumo's AccountSwitcher demo: the trigger is a
 * plain row that collapses with the sidebar (caret hides via the sidebar's data-state), the menu
 * matches the trigger width and marks the current item.
 */
export function SidebarSwitcher({
  current,
  items,
  onSelect,
  extra,
  ariaLabel,
}: SidebarSwitcherProps) {
  const CurrentIcon = current.icon;
  return (
    <DropdownMenu>
      <DropdownMenu.Trigger
        render={
          <button
            type="button"
            aria-label={ariaLabel}
            className="flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-start font-medium text-kumo-default text-sm outline-none transition-[padding] duration-(--sidebar-animation-duration) ease-(--sidebar-easing) hover:bg-kumo-tint focus-visible:ring-1 focus-visible:ring-kumo-line group-data-[state=collapsed]/sidebar:px-2"
          />
        }
      >
        {CurrentIcon && <CurrentIcon className="size-4 shrink-0 text-kumo-brand" weight="fill" />}
        <span className="flex min-w-0 flex-1 items-center overflow-hidden text-start">
          <span className="truncate">{current.name}</span>
        </span>
        <span className="w-4 shrink-0 overflow-hidden transition-[width] duration-(--sidebar-animation-duration) ease-(--sidebar-easing) group-data-[state=collapsed]/sidebar:w-0">
          <CaretUpDown className="size-4 text-kumo-subtle" />
        </span>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content className="w-(--anchor-width)">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <DropdownMenu.Item
              key={item.id}
              className="cursor-pointer gap-2"
              selected={item.id === current.id}
              onClick={() => onSelect(item)}
            >
              {Icon && <Icon className="size-4 text-kumo-brand" weight="fill" />}
              {item.name}
              {item.id === current.id && <Check className="ms-auto size-4" />}
            </DropdownMenu.Item>
          );
        })}
        {extra}
      </DropdownMenu.Content>
    </DropdownMenu>
  );
}
