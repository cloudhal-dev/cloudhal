import { Badge, type BadgeVariant, cn, Tooltip } from "@cloudflare/kumo";
import { type ReactNode, useRef, useState } from "react";

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

/** How Kumo's `Tooltip` (Base UI) says why it wants to open or close. */
type OpenChange = { reason?: string } | undefined;

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
  const [open, setOpen] = useState(false);
  /** Opened by a press: hover and focus no longer close it, only a press, Escape or outside. */
  const pinned = useRef(false);
  const onOpenChange = (next: boolean, details: OpenChange) => {
    // The trigger's own press is handled by `onClick` (the tooltip would only ever close on it).
    if (details?.reason === "trigger-press") return;
    if (!next && pinned.current && details?.reason === "trigger-hover") return;
    if (!next) pinned.current = false;
    setOpen(next);
  };
  return (
    <Tooltip
      open={open}
      onOpenChange={onOpenChange}
      content={<span className="block max-w-72">{reason}</span>}
      // A render function, so our classes are merged with the tooltip trigger's, not replaced.
      render={(props) => (
        <button
          {...props}
          type="button"
          onClick={(event) => {
            props.onClick?.(event);
            pinned.current = !(open && pinned.current);
            setOpen(pinned.current);
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
