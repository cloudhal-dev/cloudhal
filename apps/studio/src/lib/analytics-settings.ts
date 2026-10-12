/**
 * Site settings › Analytics (RFC-0006 §8, §10.3; DESIGN.md §2v): the form model behind
 * `components/AnalyticsSettings.tsx` — what the selects offer, what a save sends, how a form keeps
 * unsaved edits across "Load latest", and what the deployment can do (`features.analytics`).
 */
import type {
  AgentKeySummary,
  AnalyticsFeature,
  AnalyticsSettings,
  AnalyticsSettingsPatch,
  AnalyticsVitalsOneIn,
} from "./api.ts";
import { holds } from "./roles.ts";

/** The editable part of a site's analytics settings. */
export interface AnalyticsForm {
  enabled: boolean;
  uniqueVisitors: boolean;
  vitalsOneIn: AnalyticsVitalsOneIn;
  rollupRetentionDays: number | null;
  planHint: "free" | "paid" | null;
}

const FIELDS = [
  "enabled",
  "uniqueVisitors",
  "vitalsOneIn",
  "rollupRetentionDays",
  "planHint",
] as const satisfies readonly (keyof AnalyticsForm)[];

/** "Measure page speed": Off, then from the sparsest sample to every page view (RFC-0006 §10.3). */
export const VITALS_OPTIONS: readonly AnalyticsVitalsOneIn[] = [0, 20, 10, 5, 2, 1];

/** "Keep daily totals": Forever (`null`), 5, 2 or 1 year(s), in days (RFC-0006 §6.3). */
export const RETENTION_OPTIONS: readonly (number | null)[] = [null, 1825, 730, 365];

export const PLAN_OPTIONS = ["unknown", "free", "paid"] as const;
export type PlanOption = (typeof PLAN_OPTIONS)[number];

export function formOf(settings: AnalyticsSettings): AnalyticsForm {
  return {
    enabled: settings.enabled,
    uniqueVisitors: settings.uniqueVisitors,
    vitalsOneIn: settings.vitalsOneIn,
    rollupRetentionDays: settings.rollupRetentionDays,
    planHint: settings.planHint,
  };
}

/** Only the fields that differ from what is saved: the PUT sends these with `rev`. */
export function patchOf(saved: AnalyticsForm, form: AnalyticsForm): AnalyticsSettingsPatch {
  const patch: Record<string, unknown> = {};
  for (const field of FIELDS) if (form[field] !== saved[field]) patch[field] = form[field];
  return patch as AnalyticsSettingsPatch;
}

export function isDirty(saved: AnalyticsForm, form: AnalyticsForm): boolean {
  return Object.keys(patchOf(saved, form)).length > 0;
}

/**
 * The form after the server's copy moved from `base` to `latest` (our save, or "Load latest" after a
 * 409): fields the server changed take its value, the person's other unsaved edits stay
 * (DESIGN.md §2c).
 */
export function rebase(
  base: AnalyticsForm,
  form: AnalyticsForm,
  latest: AnalyticsForm,
): AnalyticsForm {
  const next: Record<string, unknown> = { ...form };
  for (const field of FIELDS) if (latest[field] !== base[field]) next[field] = latest[field];
  return next as unknown as AnalyticsForm;
}

/** `Select` values are strings: retention days, or `forever`. */
export const retentionValue = (days: number | null) => (days === null ? "forever" : String(days));
export function retentionFrom(value: string): number | null {
  if (value === "forever") return null;
  const days = Number(value);
  return Number.isInteger(days) && days > 0 ? days : null;
}

export const planValue = (hint: AnalyticsForm["planHint"]): PlanOption => hint ?? "unknown";
export const planFrom = (value: string): AnalyticsForm["planHint"] =>
  value === "free" || value === "paid" ? value : null;

export function vitalsFrom(value: string): AnalyticsVitalsOneIn {
  const n = Number(value);
  return (VITALS_OPTIONS as readonly number[]).includes(n) ? (n as AnalyticsVitalsOneIn) : 5;
}

/** Extra beacon requests the vitals sample adds, as a share of page views (1 in 5 → 20 %). */
export function vitalsCostPercent(oneIn: AnalyticsVitalsOneIn): number {
  return oneIn === 0 ? 0 : Math.round(100 / oneIn);
}

/**
 * What the deployment can do (`/api/instance` → `features.analytics`, RFC-0006 §8):
 * - `off`: it records nothing (no binding, `enabled: false`, or an older server);
 * - `cantRead`: it records into Workers Analytics Engine but cannot read it back yet
 *   (assumption A1) — Studio shows the daily totals it has;
 * - `ready`: recorded and readable.
 */
export type AnalyticsDeploymentState = "off" | "cantRead" | "ready";

export function deploymentState(feature: AnalyticsFeature | undefined): AnalyticsDeploymentState {
  if (!feature?.enabled || feature.store === "none") return "off";
  return feature.reader === "none" ? "cantRead" : "ready";
}

/** The notice as plain text for the clipboard: the heading, then the paragraphs. */
export function noticeText(heading: string, paragraphs: readonly string[]): string {
  return `${heading}\n\n${paragraphs.join(" ")}`;
}

// ---- agent keys: "Allow analytics" (RFC-0006 §9.1, open question 4) ---------------------------

/**
 * A key made before `analytics:read` existed (or customised without it): its agent cannot read
 * analytics. Keys are never widened on their own; a person adds the scope with one click.
 */
export function missesAnalytics(key: Pick<AgentKeySummary, "scopes">): boolean {
  return !holds(key.scopes, "analytics:read");
}
