import type { ActorKind } from "@cloudhal/core-contracts";
import type { AuditDecision, AuditOutcome, AuditRow } from "./api.ts";

/** MCP tools Studio has labels for (`packages/mcp-server/src/tools.ts`); others show their raw name. */
export const KNOWN_TOOLS = [
  "list_sites",
  "get_site",
  "list_pages",
  "get_page",
  "create_page",
  "update_page",
  "delete_page",
  "list_entries",
  "get_entry",
  "create_entry",
  "update_entry",
  "delete_entry",
  "create_snapshot",
  "list_snapshots",
  "diff_snapshots",
  "preview_page",
  "publish",
  "rollback",
  "request_elevation",
  "get_mode",
  // RFC-0003 navigation menus
  "list_menus",
  "get_menu",
  "update_menu",
  "set_menu",
  "delete_menu",
  // RFC-0004 media
  "list_assets",
  "get_asset",
  "upload_asset",
  "fetch_asset_url",
  "update_asset",
  "retire_asset",
  "restore_asset",
  "delete_asset",
  // RFC-0007 reader comments
  "list_comments",
  "get_comment_thread",
  "comments_summary",
  "label_comments",
  "moderate_comments",
  "draft_comment_reply",
  "set_comment_thread",
  // RFC-0008 schedules
  "list_schedule",
  "get_schedule",
  "list_releases",
  "get_release",
  "propose_release",
  "schedule_release",
  "reschedule",
  "cancel_schedule",
  "set_embargo",
  "lift_embargo",
  "schedule_unpublish",
  "list_automations",
  "list_runs",
  "get_run",
  "begin_run",
  "end_run",
  "pause_automation",
] as const;
export type KnownTool = (typeof KNOWN_TOOLS)[number];

export function isKnownTool(tool: string): tool is KnownTool {
  return (KNOWN_TOOLS as readonly string[]).includes(tool);
}

/**
 * Things people do to agent keys that the audit log records next to tool calls (packages/api
 * `routes/agent-keys.ts`, `routes/approvals.ts`), with their label key under `tools`. Only a grant
 * that answers an agent's request carries a site, so `agent-key.elevate` is the one Activity shows.
 */
export const KEY_EVENTS = {
  "agent-key.mode": "agentKeyMode",
  "agent-key.elevate": "agentKeyElevate",
  "agent-key.elevation-end": "agentKeyElevationEnd",
  "agent-key.narrow": "agentKeyNarrow",
  "agent-key.revoke": "agentKeyRevoke",
} as const;
export type KeyEvent = keyof typeof KEY_EVENTS;

export function isKeyEvent(tool: string): tool is KeyEvent {
  return Object.hasOwn(KEY_EVENTS, tool);
}

/**
 * Membership events (RFC-0005 §10.1, `site_id` NULL): the deployment's own activity feed on the
 * Team page lists them, with their label key under `tools`.
 */
export const MEMBER_EVENTS = {
  "member.invite": "memberInvite",
  "member.invite-revoke": "memberInviteRevoke",
  "member.invite-accept": "memberInviteAccept",
  "member.role": "memberRole",
  "member.remove": "memberRemove",
  "member.transfer-ownership": "memberTransferOwnership",
  "member.password-reset": "memberPasswordReset",
  "member.password-reset-complete": "memberPasswordResetComplete",
} as const;
export type MemberEvent = keyof typeof MEMBER_EVENTS;

export function isMemberEvent(tool: string): tool is MemberEvent {
  return Object.hasOwn(MEMBER_EVENTS, tool);
}

/**
 * People's changes to media files over REST (RFC-0004 §6.3, `routes/assets.ts`), with their label
 * key under `tools`; the site's Activity lists them next to the agents' asset tools.
 */
export const ASSET_EVENTS = {
  "asset.upload": "assetUpload",
  "asset.update": "assetUpdate",
  "asset.retire": "assetRetire",
  "asset.restore": "assetRestore",
  "asset.delete": "assetDelete",
  "asset.purge": "assetPurge",
  "asset.lift-purge": "assetLiftPurge",
} as const;
export type AssetEvent = keyof typeof ASSET_EVENTS;

export function isAssetEvent(tool: string): tool is AssetEvent {
  return Object.hasOwn(ASSET_EVENTS, tool);
}

/** An elevation grant's audit reason ends with `requested by the agent (appr_…)` (ADR-0016). */
const REQUESTED_BY_AGENT = /requested by the agent \((appr_[A-Za-z0-9_-]+)\)\s*$/;

/** The approval id when an `agent-key.elevate` row granted an agent's own request. */
export function requestedByAgent(
  row: Pick<AuditRow, "tool" | "reason" | "input">,
): string | undefined {
  if (row.tool !== "agent-key.elevate") return undefined;
  const requestId = (row.input as { requestId?: unknown } | undefined)?.requestId;
  if (typeof requestId === "string") return requestId;
  // Rows from older servers only say it in the English reason.
  return REQUESTED_BY_AGENT.exec(row.reason ?? "")?.[1];
}

/** Badge variants (Kumo) per decision / outcome: green ran, amber waits for a human, red refused or failed. */
export const DECISION_VARIANT: Record<AuditDecision, "success" | "warning" | "error"> = {
  allow: "success",
  "approval-required": "warning",
  deny: "error",
};
export const OUTCOME_VARIANT: Record<AuditOutcome, "success" | "warning" | "error"> = {
  ok: "success",
  pending: "warning",
  error: "error",
};

export type KindFilter = "all" | ActorKind;
export type DecisionFilter = "all" | AuditDecision;

export interface ActivityFilter {
  kind: KindFilter;
  decision: DecisionFilter;
  /** Matches the tool name, its label, the actor name, the skill or the mode (case-insensitive). */
  search: string;
}

export const NO_FILTER: ActivityFilter = { kind: "all", decision: "all", search: "" };

export function isFiltered(f: ActivityFilter): boolean {
  return f.kind !== "all" || f.decision !== "all" || f.search.trim() !== "";
}

export function filterActivity(
  rows: readonly AuditRow[],
  f: ActivityFilter,
  label: (tool: string) => string = (tool) => tool,
): AuditRow[] {
  const q = f.search.trim().toLowerCase();
  return rows.filter(
    (r) =>
      (f.kind === "all" || r.actor.kind === f.kind) &&
      (f.decision === "all" || r.decision === f.decision) &&
      (!q ||
        [r.tool, label(r.tool), r.actor.name ?? "", r.actor.id, r.skill ?? "", r.mode ?? ""].some(
          (s) => s.toLowerCase().includes(q),
        )),
  );
}

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

/** "3 minutes ago" / "3 dakika önce"; anything under a minute reads as "now". */
export function relativeTime(iso: string, locale: string, now: number = Date.now()): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.trunc(seconds / size), unit);
  }
  return rtf.format(0, "second");
}

/** Full timestamp for tooltips and detail views. */
export function absoluteTime(iso: string, locale: string): string {
  return new Date(iso).toLocaleString(locale, { dateStyle: "medium", timeStyle: "medium" });
}

/** Pretty-printed tool input for the detail view (the audit log stores at most 4 kB of it). */
export function formatInput(input: unknown): string | undefined {
  if (input === undefined || input === null) return undefined;
  return JSON.stringify(input, null, 2);
}
