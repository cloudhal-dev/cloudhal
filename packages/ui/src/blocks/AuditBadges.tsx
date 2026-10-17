import { Badge } from "@cloudflare/kumo";
import {
  CheckCircle,
  GearSix,
  HandPalm,
  type Icon,
  Prohibit,
  Robot,
  User,
} from "@phosphor-icons/react";

export type AuditDecision = "allow" | "deny" | "approval-required";
export type AuditOutcome = "ok" | "error" | "pending";
export type AuditActorKind = "human" | "agent" | "system";

const DECISION: Record<AuditDecision, { variant: "success" | "warning" | "error"; icon: Icon }> = {
  allow: { variant: "success", icon: CheckCircle },
  "approval-required": { variant: "warning", icon: HandPalm },
  deny: { variant: "error", icon: Prohibit },
};

const OUTCOME: Record<AuditOutcome, { variant: "success" | "warning" | "error" }> = {
  ok: { variant: "success" },
  pending: { variant: "warning" },
  error: { variant: "error" },
};

const ACTOR: Record<AuditActorKind, { variant: "info" | "secondary" | "outline"; icon: Icon }> = {
  agent: { variant: "info", icon: Robot },
  human: { variant: "secondary", icon: User },
  system: { variant: "outline", icon: GearSix },
};

export interface DecisionBadgeProps {
  decision: AuditDecision;
  /** The words, from the screen's catalog (`activity.decisions.*` in Studio). */
  label: string;
}

/** Policy decision for one tool call: allowed (green), needs approval (amber), denied (red). */
export function DecisionBadge({ decision, label }: DecisionBadgeProps) {
  const d = DECISION[decision];
  // Kumo's Badge does not forward data attributes; the wrapper carries the machine-readable value.
  return (
    <span data-decision={decision} className="inline-flex">
      <Badge variant={d.variant} icon={<d.icon weight="fill" />}>
        {label}
      </Badge>
    </span>
  );
}

export interface OutcomeBadgeProps {
  outcome: AuditOutcome;
  /** The words, from the screen's catalog. */
  label: string;
}

/** What happened after the decision, as a status dot (the decision badge is the filled one). */
export function OutcomeBadge({ outcome, label }: OutcomeBadgeProps) {
  const o = OUTCOME[outcome];
  return (
    <span data-outcome={outcome} className="inline-flex">
      <Badge variant={o.variant} appearance="dot">
        {label}
      </Badge>
    </span>
  );
}

export interface ActorBadgeProps {
  kind: AuditActorKind;
  /** The words, from the screen's catalog. */
  label: string;
}

/** Who acted: agents are tinted blue so they stand out from people in a mixed log. */
export function ActorBadge({ kind, label }: ActorBadgeProps) {
  const a = ACTOR[kind];
  return (
    <span data-actor-kind={kind} className="inline-flex">
      <Badge variant={a.variant} icon={<a.icon />}>
        {label}
      </Badge>
    </span>
  );
}
