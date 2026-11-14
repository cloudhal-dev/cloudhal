import { useRef, useState } from "react";

/** How Kumo's `Tooltip` (Base UI) says why it wants to open or close. */
type OpenChange = { reason?: string } | undefined;

/**
 * A Kumo `Tooltip` that also works as a toggletip: it opens on hover and keyboard focus, and a
 * press toggles it (Base UI tooltips never open on touch). A pressed-open tip stays when the
 * pointer leaves; a second press, Escape or a press elsewhere closes it. Spread `tooltip` on the
 * `Tooltip` and call `onPress` from the trigger's own `onClick`.
 */
export function useToggletip(): {
  tooltip: { open: boolean; onOpenChange: (next: boolean, details: OpenChange) => void };
  onPress: () => void;
} {
  const [open, setOpen] = useState(false);
  /** Opened by a press: hover and focus no longer close it, only a press, Escape or outside. */
  const pinned = useRef(false);
  const onOpenChange = (next: boolean, details: OpenChange) => {
    // The trigger's own press is handled by `onPress` (the tooltip would only ever close on it).
    if (details?.reason === "trigger-press") return;
    if (!next && pinned.current && details?.reason === "trigger-hover") return;
    if (!next) pinned.current = false;
    setOpen(next);
  };
  const onPress = () => {
    pinned.current = !(open && pinned.current);
    setOpen(pinned.current);
  };
  return { tooltip: { open, onOpenChange }, onPress };
}
