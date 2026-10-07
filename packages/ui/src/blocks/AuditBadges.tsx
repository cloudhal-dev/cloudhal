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

const DECISION: Record<
  AuditDecision,
  { variant: "success" | "warning" | "error"; icon: Icon; label: string }
> = {
  allow: { variant: "success", icon: CheckCircle, label: "Allowed" },
  "approval-required": { variant: "warning", icon: HandPalm, label: "Needs approval" },
  deny: { variant: "error", icon: Prohibit, label: "Denied" },
};

const OUTCOME: Record<AuditOutcome, { variant: "success" | "warning" | "error"; label: string }> = {
  ok: { variant: "success", label: "Succeeded" },
  pending: { variant: "warning", label: "Pending" },
  error: { variant: "error", label: "Failed" },
};

const ACTOR: Record<
  AuditActorKind,
  { variant: "info" | "secondary" | "outline"; icon: Icon; label: string }
> = {
  agent: { variant: "info", icon: Robot, label: "Agent" },
  human: { variant: "secondary", icon: User, label: "Human" },
  system: { variant: "outline", icon: GearSix, label: "System" },
};

export interface DecisionBadgeProps {
  decision: AuditDecision;
  /** Localised label; defaults to English. */
  label?: string | undefined;
}

/** Policy decision for one tool call: allowed (green), needs approval (amber), denied (red). */
export function DecisionBadge({ decision, label }: DecisionBadgeProps) {
  const d = DECISION[decision];
  // Kumo's Badge does not forward data attributes; the wrapper carries the machine-readable value.
  return (
    <span data-decision={decision} className="inline-flex">
      <Badge variant={d.variant} icon={<d.icon weight="fill" />}>
        {label ?? d.label}
      </Badge>
    </span>
  );
}

export interface OutcomeBadgeProps {
  outcome: AuditOutcome;
  label?: string | undefined;
}

/** What happened after the decision, as a status dot (the decision badge is the filled one). */
export function OutcomeBadge({ outcome, label }: OutcomeBadgeProps) {
  const o = OUTCOME[outcome];
  return (
    <span data-outcome={outcome} className="inline-flex">
      <Badge variant={o.variant} appearance="dot">
        {label ?? o.label}
      </Badge>
    </span>
  );
}

export interface ActorBadgeProps {
  kind: AuditActorKind;
  label?: string | undefined;
}

/** Who acted: agents are tinted blue so they stand out from people in a mixed log. */
export function ActorBadge({ kind, label }: ActorBadgeProps) {
  const a = ACTOR[kind];
  return (
    <span data-actor-kind={kind} className="inline-flex">
      <Badge variant={a.variant} icon={<a.icon />}>
        {label ?? a.label}
      </Badge>
    </span>
  );
}
