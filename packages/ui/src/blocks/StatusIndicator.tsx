import { cn, Text } from "@cloudflare/kumo";

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

export interface StatusIndicatorProps {
  /** The state's word ("Ready", "Failed", "Running"), from the screen's catalog; it always says the state, the colour only repeats it. */
  label: string;
  tone: StatusTone;
  /** `dot` (default) or a thin vertical `bar`, as the dashboard shows deployment and step status. */
  shape?: "dot" | "bar";
  /** Pulses the mark for work in progress (not under reduced motion). */
  active?: boolean;
  className?: string;
}

const TONE: Record<StatusTone, string> = {
  success: "bg-kumo-success",
  warning: "bg-kumo-warning",
  danger: "bg-kumo-danger",
  info: "bg-kumo-info",
  // Kumo has no inactive fill token: the mark takes the inactive text colour.
  neutral: "bg-current text-kumo-inactive",
};

/**
 * A light status mark for dense rows: a coloured dot or thin bar and the state's word, where a
 * `Badge` per row would be too heavy (deployments, steps, runs). The mark is decorative and
 * aligned with the first line of text; the word carries the meaning. Every word is a prop.
 */
export function StatusIndicator({
  label,
  tone,
  shape = "dot",
  active = false,
  className,
}: StatusIndicatorProps) {
  return (
    <span
      className={cn("inline-flex min-w-0 items-start gap-2", className)}
      data-status-tone={tone}
      data-active={active ? "" : undefined}
    >
      <span className="flex h-lh shrink-0 items-center" aria-hidden="true">
        <span
          className={cn(
            "block",
            shape === "dot" ? "size-2 rounded-full" : "h-3.5 w-1 rounded-sm",
            TONE[tone],
            active && "animate-pulse motion-reduce:animate-none",
          )}
        />
      </span>
      <Text as="span">{label}</Text>
    </span>
  );
}
