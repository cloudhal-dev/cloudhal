import { Badge, Button, cn, Popover, Text } from "@cloudflare/kumo";
import { Bell } from "@phosphor-icons/react";
import type { ReactNode } from "react";

export interface NotificationBellProps {
  /** Accessible name of the bell button, including the count when there is one ("Notifications, 2 new"). */
  label: string;
  /** Items waiting; the count badge on the bell is hidden at 0 and reads "9+" above 9. */
  count: number;
  /** Panel heading ("Notifications"). */
  title: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Right side of the panel header (a count `Badge`). */
  headerActions?: ReactNode;
  /** Bottom row of the panel (`border-t`): a ghost link to the notification settings. */
  footer?: ReactNode;
  /** `NotificationItem`s, or a `SectionEmpty` when there is nothing. */
  children: ReactNode;
}

/**
 * The top bar's notification bell (DESIGN.md §1 "Top bar", §2n): a ghost square `Button` with a
 * count `Badge` on its corner that opens a Kumo `Popover` panel — header (title, count), a
 * scrolling list of `NotificationItem`s divided by hairlines, and an optional footer row. The
 * panel is flush (no popover padding) so rows run edge to edge like a card's `divide-y` list.
 */
export function NotificationBell({
  label,
  count,
  title,
  open,
  onOpenChange,
  headerActions,
  footer,
  children,
}: NotificationBellProps) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <span className="relative inline-flex shrink-0">
        <Popover.Trigger
          render={
            <Button
              variant="ghost"
              size="sm"
              shape="square"
              aria-label={label}
              icon={<Bell size={16} />}
              data-notification-count={count}
            />
          }
        />
        {count > 0 && (
          <span aria-hidden className="pointer-events-none absolute -top-1.5 -right-1.5 flex">
            <Badge variant="primary" className="h-4 min-w-4 justify-center px-1 py-0 leading-4">
              {count > 9 ? "9+" : count}
            </Badge>
          </span>
        )}
      </span>
      <Popover.Content
        align="end"
        positionMethod="fixed"
        className="w-96 max-w-[calc(100vw-1rem)] gap-0 overflow-hidden p-0"
      >
        <div className="flex min-h-12 items-center justify-between gap-3 border-kumo-hairline border-b px-4 py-2.5">
          <Popover.Title>{title}</Popover.Title>
          {headerActions && <div className="flex items-center gap-2">{headerActions}</div>}
        </div>
        <div className="max-h-[min(32rem,70svh)] min-w-0 divide-y divide-kumo-hairline overflow-y-auto">
          {children}
        </div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-kumo-hairline border-t px-3 py-2">
            {footer}
          </div>
        )}
      </Popover.Content>
    </Popover>
  );
}

export type NotificationTone = "warning" | "info";

export interface NotificationItemProps {
  /** 16px Phosphor icon, aligned with the first line of the title. */
  icon: ReactNode;
  /** Icon colour: `warning` for something ending, `info` for something asked. */
  tone?: NotificationTone;
  /** One line: who and what ("Planner asks for Edits · 30 min"). */
  title: ReactNode;
  /** Right of the title: the item's time ("2 min ago"). */
  meta?: ReactNode;
  /** Badges and sentences under the title. */
  children?: ReactNode;
  /** The item's buttons and links, one row, wrapping on phones. */
  actions?: ReactNode;
  className?: string;
}

const TONE: Record<NotificationTone, string> = {
  warning: "text-kumo-warning",
  info: "text-kumo-info",
};

/** One row of the notification panel: tone icon, title + meta, body, actions. */
export function NotificationItem({
  icon,
  tone = "info",
  title,
  meta,
  children,
  actions,
  className,
}: NotificationItemProps) {
  return (
    <div className={cn("flex min-w-0 items-start gap-3 px-4 py-3", className)}>
      <span className={cn("flex h-lh shrink-0 items-center", TONE[tone])}>{icon}</span>
      <div className="grid min-w-0 flex-1 gap-2">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <Text bold as="span">
            {title}
          </Text>
          {meta && <span className="flex h-lh shrink-0 items-center">{meta}</span>}
        </div>
        {children}
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
