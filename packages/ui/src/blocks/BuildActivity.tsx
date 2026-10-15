import { Badge, Text } from "@cloudflare/kumo";
import { CheckCircle, GearSix, type Icon, Robot, User, WarningCircle } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { SectionEmpty } from "./SectionEmpty.tsx";

/** One thing that happened to the page being built (RFC-0020 §6). */
export interface BuildActivityItem {
  id: string;
  /** `change`: applied; `rejected`: an agent's operations were refused (it will try again). */
  kind: "change" | "rejected";
  actor: { kind: "human" | "agent" | "system" | string; name: string };
  /** What did it: `patch_draft`, `update_page`, `studio`. */
  tool: string;
  at: string;
  /** One line: "2 sections changed", "3 operations". */
  summary: string;
  /** Repairs Cloudhal made, or the refused parts with their JSON Pointers. */
  details?: readonly string[];
}

export interface BuildActivityLabels {
  empty: string;
  emptyDescription?: string;
  applied: string;
  rejected: string;
}

export interface BuildActivityProps {
  items: readonly BuildActivityItem[];
  labels: BuildActivityLabels;
  emptyIcon?: ReactNode;
  /** Renders a time; screens pass a relative time. */
  renderTime?: ((iso: string) => ReactNode) | undefined;
}

const ACTOR_ICON: Record<string, Icon> = { human: User, agent: Robot, system: GearSix };

/**
 * The live feed of a build (RFC-0020 §6, DESIGN.md §2ac), newest first: who changed the page with
 * which tool, what changed, and Cloudhal's repairs or the refused parts the agent will fix. Render
 * it inside a `SectionCard`.
 */
export function BuildActivity({ items, labels, emptyIcon, renderTime }: BuildActivityProps) {
  if (items.length === 0)
    return (
      <SectionEmpty icon={emptyIcon} title={labels.empty} description={labels.emptyDescription} />
    );
  const time = renderTime ?? ((iso: string) => new Date(iso).toLocaleTimeString());
  return (
    <ol className="grid gap-4" aria-live="polite" data-testid="build-activity">
      {items.map((item) => {
        const ActorIcon = ACTOR_ICON[item.actor.kind] ?? GearSix;
        const failed = item.kind === "rejected";
        return (
          <li key={item.id} className="grid gap-1.5" data-kind={item.kind}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex h-lh items-center">
                <ActorIcon size={16} className="text-kumo-subtle" aria-hidden />
              </span>
              <Text bold as="span">
                {item.actor.name}
              </Text>
              <Text variant="mono-secondary" as="span">
                {item.tool}
              </Text>
              <Badge variant={failed ? "warning" : "success"} appearance="dot">
                {failed ? labels.rejected : labels.applied}
              </Badge>
              <span className="ml-auto">
                <Text variant="secondary" as="span">
                  {time(item.at)}
                </Text>
              </span>
            </div>
            <div className="flex items-start gap-2 pl-6">
              <span className="flex h-lh items-center">
                {failed ? (
                  <WarningCircle size={16} className="text-kumo-warning" aria-hidden />
                ) : (
                  <CheckCircle size={16} className="text-kumo-success" aria-hidden />
                )}
              </span>
              <div className="grid min-w-0 gap-1">
                <Text as="span">{item.summary}</Text>
                {item.details?.map((d) => (
                  <span key={d} className="break-words">
                    <Text variant="mono-secondary" as="span">
                      {d}
                    </Text>
                  </span>
                ))}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
