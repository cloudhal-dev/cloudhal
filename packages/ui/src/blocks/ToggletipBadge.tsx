import { Badge, type BadgeVariant, cn, Tooltip } from "@cloudflare/kumo";
import type { ReactNode } from "react";
import { useToggletip } from "./toggletip.ts";

export interface ToggletipBadgeProps {
  /** The badge's word, from the screen's catalog. */
  label: string;
  /** What the badge means, shown in the toggletip and read as part of the badge's name. */
  reason: string;
  /** The badge's tone (Kumo `Badge` variant); `secondary` for quiet states. */
  variant?: BadgeVariant;
  /** A 14 px Phosphor icon with `aria-hidden`; the word always says the state too. */
  icon?: ReactNode;
  className?: string;
}

/**
 * A badge that explains itself: a Kumo `Badge` inside a button whose `reason` opens in a Kumo
 * `Tooltip` on hover, on keyboard focus and on a press — Base UI tooltips never open on touch, so
 * the button toggles it (open, then closed by a second press, Escape or a press elsewhere; a
 * pressed-open toggletip stays when the pointer leaves). The reason wraps at 18 rem, and is repeated
 * for screen readers inside the badge, so it is part of the button's accessible name
 * ("Ended (collection rule). This entry…"). Every word is a prop; there is no fallback.
 */
export function ToggletipBadge({
  label,
  reason,
  variant = "secondary",
  icon,
  className,
}: ToggletipBadgeProps) {
  const { tooltip, onPress } = useToggletip();
  return (
    <Tooltip
      {...tooltip}
      content={<span className="block max-w-72">{reason}</span>}
      // A render function, so our classes are merged with the tooltip trigger's, not replaced.
      render={(props) => (
        <button
          {...props}
          type="button"
          onClick={(event) => {
            props.onClick?.(event);
            onPress();
          }}
          className={cn(
            props.className,
            "inline-flex shrink-0 cursor-default rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kumo-brand",
            className,
          )}
        />
      )}
    >
      <Badge variant={variant} icon={icon}>
        {label}
        <span className="sr-only">. {reason}</span>
      </Badge>
    </Tooltip>
  );
}
