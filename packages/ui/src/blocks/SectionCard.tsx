import { cn, LayerCard, Text } from "@cloudflare/kumo";
import type { ReactNode } from "react";

export interface SectionCardProps {
  /** Anchor for `TableOfContents` / deep links; also labels the card. */
  id?: string;
  title: ReactNode;
  /** 16px Phosphor icon before the title. */
  icon?: ReactNode;
  /** Muted text under the header, above the body. */
  description?: ReactNode;
  /** Right side of the header: a count/state `Badge`, a ghost "View all" `LinkButton`, small actions. */
  actions?: ReactNode;
  /** Footer row (`border-t`), right-aligned: the section's own Save/Discard. */
  footer?: ReactNode;
  /** No body padding — for a `Table`, `divide-y` rows or an `Empty` that fills the card. */
  flush?: boolean;
  /** Heading level inside the page outline. */
  as?: "h2" | "h3";
  className?: string;
  children?: ReactNode;
}

/**
 * The one card anatomy (DESIGN.md §1 "Sections"): Kumo `LayerCard` with a `Secondary` header row
 * (title, optional icon, actions on the right) and a `Primary` body. Never nest one in another.
 */
export function SectionCard({
  id,
  title,
  icon,
  description,
  actions,
  footer,
  flush = false,
  as = "h2",
  className,
  children,
}: SectionCardProps) {
  const titleId = id ? `${id}-title` : undefined;
  return (
    <LayerCard id={id} className={cn("min-w-0 scroll-mt-20", className)} aria-labelledby={titleId}>
      <LayerCard.Secondary className="flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-2 px-5 py-2.5">
        <span id={titleId} className="flex min-w-0 items-center gap-2">
          {icon && <span className="flex shrink-0 items-center text-kumo-subtle">{icon}</span>}
          <Text variant="heading" as={as} truncate>
            {title}
          </Text>
        </span>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </LayerCard.Secondary>
      <LayerCard.Primary className="min-w-0 p-0">
        {description && (
          <div className={cn("px-5 pt-4", (flush || children === undefined) && "pb-3")}>
            <Text variant="secondary">{description}</Text>
          </div>
        )}
        {flush ? (
          <div
            className={cn(
              "min-w-0 overflow-x-auto",
              description && "border-kumo-hairline border-t",
            )}
          >
            {children}
          </div>
        ) : (
          children !== undefined && (
            <div className="grid min-w-0 gap-5 px-5 pt-4 pb-5">{children}</div>
          )
        )}
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-kumo-hairline border-t px-5 py-3">
            {footer}
          </div>
        )}
      </LayerCard.Primary>
    </LayerCard>
  );
}
