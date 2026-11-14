import { Badge, cn, Meter, Text, Tooltip } from "@cloudflare/kumo";
import { Info } from "@phosphor-icons/react";
import { useToggletip } from "./toggletip.ts";

export type UsageState = "normal" | "warning" | "danger";

/** The share of the limit at which a row warns, unless a screen passes its own. */
export const USAGE_WARN_AT = 0.8;

/** `normal` below `warnAt` of the limit, `warning` from there, `danger` at or above the limit. */
export function usageState(used: number, limit: number, warnAt = USAGE_WARN_AT): UsageState {
  if (limit <= 0) return used > 0 ? "danger" : "normal";
  if (used >= limit) return "danger";
  return used >= warnAt * limit ? "warning" : "normal";
}

export interface UsageMeterRowProps {
  /** What is measured ("Requests today"), from the screen's catalog. */
  label: string;
  used: number;
  limit: number;
  /** `used / limit` as the screen formats it (`formatNumber`), so digits follow the language. */
  valueText: string;
  /** An explanation next to the label, in a toggletip, and its button's accessible name. */
  info?: { text: string; label: string };
  /** The words for the warning and the limit state; shown as a badge and read with the value. */
  warningLabel?: string;
  dangerLabel?: string;
  /** The share of the limit that warns (default 0.8). */
  warnAt?: number;
  className?: string;
}

const BAR: Record<UsageState, string | undefined> = {
  normal: undefined,
  warning: "from-kumo-warning via-kumo-warning to-kumo-warning",
  danger: "from-kumo-danger via-kumo-danger to-kumo-danger",
};

/**
 * One row of a usage rail (the dashboard's Usage column): the label with an optional info
 * toggletip, `used / limit`, and a Kumo `Meter` that turns warning at 80 % and danger at the
 * limit, with the state's word as a badge, so it is never shown by colour alone. Kumo's
 * `Meter.label` is a plain string, so the visible row is this block's own. The meter keeps its
 * label for screen readers and reads `valueText` (and the state) as its value. Every word is a
 * prop.
 */
export function UsageMeterRow({
  label,
  used,
  limit,
  valueText,
  info,
  warningLabel,
  dangerLabel,
  warnAt = USAGE_WARN_AT,
  className,
}: UsageMeterRowProps) {
  const state = usageState(used, limit, warnAt);
  const word = state === "danger" ? dangerLabel : state === "warning" ? warningLabel : undefined;
  const max = Math.max(1, limit);
  return (
    <div className={cn("grid min-w-0 gap-2", className)} data-usage-state={state}>
      <div className="flex min-w-0 items-center justify-between gap-4">
        <span className="flex min-w-0 items-center gap-1">
          <span className="min-w-0 truncate" aria-hidden="true">
            <Text as="span" variant="secondary">
              {label}
            </Text>
          </span>
          {info && <InfoToggletip text={info.text} label={info.label} />}
        </span>
        <span className="flex shrink-0 items-center gap-2" aria-hidden="true">
          {word && <Badge variant={state === "danger" ? "error" : "warning"}>{word}</Badge>}
          <span className="tabular-nums">
            <Text as="span" bold>
              {valueText}
            </Text>
          </span>
        </span>
      </div>
      <Meter
        label={label}
        value={Math.min(Math.max(used, 0), max)}
        max={max}
        customValue={valueText}
        getAriaValueText={() => (word ? `${valueText}, ${word}` : valueText)}
        // Kumo's own label row stays for screen readers (it names the meter); the row above shows it.
        className="gap-0 [&>div:first-child]:sr-only"
        indicatorClassName={cn("motion-reduce:transition-none", BAR[state])}
      />
    </div>
  );
}

/** A 16 px info button whose text opens on hover, focus and press (a toggletip). */
function InfoToggletip({ text, label }: { text: string; label: string }) {
  const { tooltip, onPress } = useToggletip();
  return (
    <Tooltip
      {...tooltip}
      content={<span className="block max-w-72">{text}</span>}
      render={(props) => (
        <button
          {...props}
          type="button"
          aria-label={label}
          onClick={(event) => {
            props.onClick?.(event);
            onPress();
          }}
          className={cn(
            props.className,
            "inline-flex h-lh shrink-0 cursor-default items-center rounded-full text-kumo-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kumo-brand",
          )}
        />
      )}
    >
      <Info size={16} aria-hidden="true" />
    </Tooltip>
  );
}
