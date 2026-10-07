import type { Actor } from "@cloudhal/core-contracts";
import { ActorBadge, DecisionBadge, OutcomeBadge, Text } from "@cloudhal/ui";
import { useCallback } from "react";
import { useT } from "../i18n/index.tsx";
import { isKnownTool } from "../lib/activity.ts";
import type { AuditDecision, AuditOutcome } from "../lib/api.ts";

/** Human-readable label for an MCP tool name ("update_page" → "Updated page"); unknown tools pass through. */
export function useToolLabel() {
  const t = useT();
  return useCallback((tool: string) => (isKnownTool(tool) ? t(`tools.${tool}`) : tool), [t]);
}

export function Decision({ decision }: { decision: AuditDecision }) {
  const t = useT();
  return <DecisionBadge decision={decision} label={t(`activity.decisions.${decision}`)} />;
}

export function Outcome({ outcome }: { outcome: AuditOutcome | undefined }) {
  const t = useT();
  if (!outcome) {
    return (
      <Text variant="secondary" as="span">
        —
      </Text>
    );
  }
  return <OutcomeBadge outcome={outcome} label={t(`activity.outcomes.${outcome}`)} />;
}

/** Actor kind badge + display name (falls back to the id). */
export function ActorCell({ actor }: { actor: Actor }) {
  const t = useT();
  return (
    <div className="flex min-w-0 items-center gap-2">
      <ActorBadge kind={actor.kind} label={t(`activity.kinds.${actor.kind}`)} />
      <Text as="span" truncate>
        {actor.name ?? actor.id}
      </Text>
    </div>
  );
}

/** Tool label with the raw MCP name underneath, so both people and developers can scan it. */
export function ToolCell({ tool }: { tool: string }) {
  const label = useToolLabel();
  return (
    <div className="grid gap-0.5">
      <Text bold as="span">
        {label(tool)}
      </Text>
      <Text variant="mono-secondary" as="span">
        {tool}
      </Text>
    </div>
  );
}
