/**
 * Analytics settings (RFC-0006 §3.3, §8): deployment defaults from `cloudhal.json` and per-site
 * overrides stored in `analytics_settings` (outside the site graph, so a content rollback never
 * changes a privacy setting). This module holds the types and pure rules; the SQL accessors live in
 * `@cloudhal/analytics/sql`.
 */
import { AnalyticsSettingsError } from "./errors.ts";

export const VITALS_ONE_IN = [0, 1, 2, 5, 10, 20] as const;
export type VitalsOneIn = (typeof VITALS_ONE_IN)[number];
export type PlanHint = "free" | "paid";

/** Deployment defaults (`cloudhal.json` → `analytics`). */
export interface AnalyticsDefaults {
  readonly enabled: boolean;
  readonly uniqueVisitors: boolean;
  readonly vitalsOneIn: VitalsOneIn;
  readonly rollupRetentionDays?: number | null;
}

export const DEFAULT_ANALYTICS: AnalyticsDefaults = {
  enabled: false,
  uniqueVisitors: false,
  vitalsOneIn: 5,
  rollupRetentionDays: null,
};

/** A stored per-site row. */
export interface AnalyticsSettings {
  readonly siteId: string;
  readonly enabled: boolean;
  readonly uniqueVisitors: boolean;
  readonly vitalsOneIn: VitalsOneIn;
  /** `null` = keep daily rollups forever. */
  readonly rollupRetentionDays: number | null;
  readonly planHint: PlanHint | null;
  readonly rev: number;
  readonly updatedAt: string;
  readonly updatedBy: string;
}

/** What applies to a site now: its row, or the deployment defaults (`rev: 0`, `stored: false`). */
export interface EffectiveAnalyticsSettings {
  readonly siteId: string;
  readonly enabled: boolean;
  readonly uniqueVisitors: boolean;
  readonly vitalsOneIn: VitalsOneIn;
  readonly rollupRetentionDays: number | null;
  readonly planHint: PlanHint | null;
  readonly rev: number;
  readonly stored: boolean;
}

export interface AnalyticsSettingsPatch {
  readonly enabled?: boolean;
  readonly uniqueVisitors?: boolean;
  readonly vitalsOneIn?: number;
  readonly rollupRetentionDays?: number | null;
  readonly planHint?: PlanHint | null;
}

export function effectiveSettings(
  siteId: string,
  row: AnalyticsSettings | undefined,
  defaults: AnalyticsDefaults = DEFAULT_ANALYTICS,
): EffectiveAnalyticsSettings {
  if (row)
    return {
      siteId,
      enabled: row.enabled,
      uniqueVisitors: row.uniqueVisitors,
      vitalsOneIn: row.vitalsOneIn,
      rollupRetentionDays: row.rollupRetentionDays,
      planHint: row.planHint,
      rev: row.rev,
      stored: true,
    };
  return {
    siteId,
    enabled: defaults.enabled,
    uniqueVisitors: defaults.uniqueVisitors,
    vitalsOneIn: defaults.vitalsOneIn,
    rollupRetentionDays: defaults.rollupRetentionDays ?? null,
    planHint: null,
    rev: 0,
    stored: false,
  };
}

/** Checks a patch; throws `AnalyticsSettingsError` naming the first bad field. */
export function assertSettingsPatch(patch: AnalyticsSettingsPatch): void {
  if (patch.enabled !== undefined && typeof patch.enabled !== "boolean")
    throw new AnalyticsSettingsError("enabled must be a boolean");
  if (patch.uniqueVisitors !== undefined && typeof patch.uniqueVisitors !== "boolean")
    throw new AnalyticsSettingsError("uniqueVisitors must be a boolean");
  if (patch.vitalsOneIn !== undefined && !VITALS_ONE_IN.includes(patch.vitalsOneIn as VitalsOneIn))
    throw new AnalyticsSettingsError(`vitalsOneIn must be one of ${VITALS_ONE_IN.join(", ")}`);
  if (
    patch.rollupRetentionDays !== undefined &&
    patch.rollupRetentionDays !== null &&
    !(
      Number.isInteger(patch.rollupRetentionDays) &&
      patch.rollupRetentionDays >= 1 &&
      patch.rollupRetentionDays <= 36_500
    )
  )
    throw new AnalyticsSettingsError("rollupRetentionDays must be null or 1–36500 days");
  if (
    patch.planHint !== undefined &&
    patch.planHint !== null &&
    patch.planHint !== "free" &&
    patch.planHint !== "paid"
  )
    throw new AnalyticsSettingsError("planHint must be free, paid or null");
}

/** Parses the `CLOUDHAL_ANALYTICS_DEFAULTS` var / `cloudhal.json` block leniently (bad values → defaults). */
export function parseAnalyticsDefaults(input: unknown): AnalyticsDefaults {
  let v: unknown = input;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      v = undefined;
    }
  }
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  return {
    enabled: typeof o.enabled === "boolean" ? o.enabled : DEFAULT_ANALYTICS.enabled,
    uniqueVisitors:
      typeof o.uniqueVisitors === "boolean" ? o.uniqueVisitors : DEFAULT_ANALYTICS.uniqueVisitors,
    vitalsOneIn: VITALS_ONE_IN.includes(o.vitalsOneIn as VitalsOneIn)
      ? (o.vitalsOneIn as VitalsOneIn)
      : DEFAULT_ANALYTICS.vitalsOneIn,
    rollupRetentionDays:
      Number.isInteger(o.rollupRetentionDays) && (o.rollupRetentionDays as number) > 0
        ? (o.rollupRetentionDays as number)
        : null,
  };
}
