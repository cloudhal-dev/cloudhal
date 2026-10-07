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
] as const;
export type KnownTool = (typeof KNOWN_TOOLS)[number];

export function isKnownTool(tool: string): tool is KnownTool {
  return (KNOWN_TOOLS as readonly string[]).includes(tool);
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
  /** Matches the tool name, its label, the actor name or the skill (case-insensitive). */
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
        [r.tool, label(r.tool), r.actor.name ?? "", r.actor.id, r.skill ?? ""].some((s) =>
          s.toLowerCase().includes(q),
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
