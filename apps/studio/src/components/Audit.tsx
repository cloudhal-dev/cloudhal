import type { Actor } from "@cloudhal/core-contracts";
import { ActorBadge, Badge, DecisionBadge, OutcomeBadge, Text, Tooltip } from "@cloudhal/ui";
import { ArrowRight, Robot } from "@phosphor-icons/react";
import { useCallback } from "react";
import { useT } from "../i18n/index.tsx";
import {
  ASSET_EVENTS,
  isAssetEvent,
  isKeyEvent,
  isKnownTool,
  isMemberEvent,
  KEY_EVENTS,
  MEMBER_EVENTS,
  requestedByAgent,
} from "../lib/activity.ts";
import { isAutoApproved } from "../lib/agents.ts";
import type {
  AgentMode,
  AuditDecision,
  AuditElevation,
  AuditOutcome,
  AuditRow,
  Role,
} from "../lib/api.ts";
import { AutoApprovedBadge, ModeBadge } from "./AgentModes.tsx";
import { RoleBadge } from "./Roles.tsx";

/**
 * Human-readable label for an MCP tool name ("update_page" → "Update page") or a person's action
 * on an agent key ("agent-key.elevate" → "Elevate agent key"); unknown tools pass through.
 */
export function useToolLabel() {
  const t = useT();
  return useCallback(
    (tool: string) =>
      isKnownTool(tool)
        ? t(`tools.${tool}`)
        : isKeyEvent(tool)
          ? t(`tools.${KEY_EVENTS[tool]}`)
          : isMemberEvent(tool)
            ? t(`tools.${MEMBER_EVENTS[tool]}`)
            : isAssetEvent(tool)
              ? t(`tools.${ASSET_EVENTS[tool]}`)
              : tool,
    [t],
  );
}

export function Decision({ decision }: { decision: AuditDecision }) {
  const t = useT();
  return <DecisionBadge decision={decision} label={t(`activity.decisions.${decision}`)} />;
}

/** The decision, plus "Auto-approved" when an `auto`-mode publish went live without a person. */
export function DecisionCell({
  row,
  align = "start",
}: {
  row: Pick<AuditRow, "decision" | "reason">;
  align?: "start" | "end";
}) {
  return (
    <div
      className={
        align === "end"
          ? "flex flex-wrap items-center justify-end gap-1.5"
          : "flex flex-wrap items-center gap-1.5"
      }
    >
      <Decision decision={row.decision} />
      {isAutoApproved(row) && <AutoApprovedBadge row={row} />}
    </div>
  );
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

/**
 * Actor kind badge + display name (falls back to the id); for agents, the mode the call ran under
 * as a subtle badge (ADR-0015), with a timer marker when that mode was a time-boxed elevation
 * (ADR-0016).
 */
export function ActorCell({
  actor,
  mode,
  elevation,
  role,
}: {
  actor: Actor;
  mode?: AgentMode | undefined;
  elevation?: AuditElevation | undefined;
  /** A person's staff role (RFC-0005 §10.3: Approvals and Activity show it next to the name). */
  role?: Role | undefined;
}) {
  const t = useT();
  return (
    <div className="flex min-w-0 items-center gap-2">
      <ActorBadge kind={actor.kind} label={t(`activity.kinds.${actor.kind}`)} />
      <Text as="span" truncate>
        {actor.name ?? actor.id}
      </Text>
      {mode && actor.kind === "agent" && <ModeBadge mode={mode} subtle elevation={elevation} />}
      {role && actor.kind === "human" && <RoleBadge value={role} />}
    </div>
  );
}

/**
 * An `agent-key.elevate` event (ADR-0016): "Edits → Auto" with the timer marker, and "Requested by
 * the agent" when the person granted an agent's own request from Approvals. Nothing otherwise.
 */
export function ElevationGrant({
  row,
}: {
  row: Pick<AuditRow, "tool" | "reason" | "mode" | "elevation">;
}) {
  const t = useT();
  if (row.tool !== "agent-key.elevate" || !row.elevation || !row.mode) return null;
  const requested = requestedByAgent(row);
  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      data-elevation-grant={row.mode}
      data-requested={requested ? "true" : undefined}
    >
      <span className="flex items-center gap-1.5 whitespace-nowrap">
        <ModeBadge mode={row.elevation.from} subtle />
        <ArrowRight size={12} className="text-kumo-subtle" aria-hidden />
        <ModeBadge mode={row.mode} subtle elevation={row.elevation} />
      </span>
      {requested && (
        <span className="inline-flex">
          <Tooltip content={t("activity.requestedByAgentHint")}>
            <Badge variant="outline" icon={<Robot />}>
              {t("activity.requestedByAgent")}
            </Badge>
          </Tooltip>
        </span>
      )}
    </div>
  );
}

/**
 * Tool label with the raw MCP name underneath, so both people and developers can scan it. With the
 * audit `row`, an elevation grant also shows which mode it granted (`ElevationGrant`).
 */
export function ToolCell({
  tool,
  row,
}: {
  tool: string;
  row?: Pick<AuditRow, "tool" | "reason" | "mode" | "elevation"> | undefined;
}) {
  const label = useToolLabel();
  return (
    <div className="grid justify-items-start gap-0.5">
      <Text bold as="span">
        {label(tool)}
      </Text>
      <Text variant="mono-secondary" as="span">
        {tool}
      </Text>
      {row?.tool === "agent-key.elevate" && row.elevation && (
        <span className="pt-1">
          <ElevationGrant row={row} />
        </span>
      )}
    </div>
  );
}
