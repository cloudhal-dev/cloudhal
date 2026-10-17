import { cn, Switch, Text, Tooltip } from "@cloudflare/kumo";
import { GlobeHemisphereWest } from "@phosphor-icons/react";

export interface TimezoneNoteProps {
  /** The note: "Times are in Istanbul time (UTC+3)", "Days are in UTC". */
  label: string;
  /** Both times, in a toggletip: "09:00 Istanbul · 08:00 your time, Berlin". */
  detail?: string | undefined;
  /**
   * The "Show in my time" switch, when the viewer's zone differs from the site's. Controlled;
   * the screen re-renders times in the viewer's zone while it is on.
   */
  toggle?: { label: string; checked: boolean; onCheckedChange: (checked: boolean) => void };
  className?: string;
}

/**
 * Which zone the times on screen are in (RFC-0008 §9.1, §15.1; generalises DESIGN.md §2v's
 * "Days are in UTC"): `GlobeHemisphereWest` and the zone in muted text, with both times in a
 * toggletip (a button, so it opens from the keyboard) and an optional "Show in my time" `Switch`.
 */
export function TimezoneNote({ label, detail, toggle, className }: TimezoneNoteProps) {
  const note = (
    <span className="inline-flex items-start gap-1.5">
      <span aria-hidden className="flex h-lh items-center text-kumo-subtle">
        <GlobeHemisphereWest size={16} />
      </span>
      <Text as="span" variant="secondary" size="sm">
        {label}
        {detail && <span className="sr-only">. {detail}</span>}
      </Text>
    </span>
  );
  return (
    <div
      className={cn("flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2", className)}
      data-timezone-note=""
    >
      {detail ? (
        <Tooltip
          content={detail}
          render={(props) => (
            <button
              {...props}
              type="button"
              className={cn(
                props.className,
                "inline-flex min-w-0 cursor-default rounded-md text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kumo-brand",
              )}
            />
          )}
        >
          {note}
        </Tooltip>
      ) : (
        note
      )}
      {toggle && (
        <Switch
          size="sm"
          label={toggle.label}
          checked={toggle.checked}
          onCheckedChange={(checked: boolean) => toggle.onCheckedChange(checked)}
        />
      )}
    </div>
  );
}
