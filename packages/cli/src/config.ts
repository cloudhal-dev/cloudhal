import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * `cloudhal.json` → `analytics` (RFC-0006 §8): deployment defaults for site analytics. Absent means
 * off (existing projects are asked on their next interactive deploy); present, `enabled` defaults
 * to `true`, as the Site Worker reads it.
 */
export interface AnalyticsConfig {
  readonly enabled?: boolean;
  /** Default for sites without a settings row: daily-salted unique visitors (opt-in). */
  readonly uniqueVisitors?: boolean;
  /** Vitals sampling, one page view in N: 0 (off), 1, 2, 5, 10 or 20. */
  readonly vitalsOneIn?: number;
  /** Uncached live (WAE) queries per UTC day (default 8000). */
  readonly queryBudget?: number;
  /** Days of raw events kept in SQLite locally and on Node (default 90). */
  readonly rawRetentionDays?: number;
  /** Workers Rate Limiting binding (not wired yet; per-isolate limits apply). */
  readonly rateLimit?: boolean;
  /** Record `cloudhal dev` traffic locally (default off: it is the author's own). */
  readonly dev?: boolean;
}

/** `cloudhal.json` at the project root. Kept tiny; everything else lives in the store. */
export interface ProjectConfig {
  readonly siteId: string;
  /** Relative to the project root. */
  readonly dataDir: string;
  /**
   * Custom domains `cloudhal deploy` routes to the Workers (Cloudflare Custom Domains; the zone
   * must be in the same account). The workers.dev addresses keep working.
   */
  readonly domains?: { readonly site?: string; readonly studio?: string };
  /** Site analytics (RFC-0006); absent = off. */
  readonly analytics?: AnalyticsConfig;
}

export const CONFIG_FILE = "cloudhal.json";

/** The keys `ProjectConfig` owns; others (e.g. `media`, read by the starter) are kept on write. */
const OWN_KEYS = new Set(["siteId", "dataDir", "domains", "analytics"]);

const VITALS = [0, 1, 2, 5, 10, 20];

/** Leniently parsed, like `domains`: values of the wrong type are left out. */
export function parseAnalyticsConfig(input: unknown): AnalyticsConfig | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const o = input as Record<string, unknown>;
  const bool = (k: string) => (typeof o[k] === "boolean" ? { [k]: o[k] as boolean } : {});
  const int = (k: string, ok: (n: number) => boolean) =>
    Number.isInteger(o[k]) && ok(o[k] as number) ? { [k]: o[k] as number } : {};
  return {
    ...bool("enabled"),
    ...bool("uniqueVisitors"),
    ...int("vitalsOneIn", (n) => VITALS.includes(n)),
    ...int("queryBudget", (n) => n >= 0),
    ...int("rawRetentionDays", (n) => n >= 1),
    ...bool("rateLimit"),
    ...bool("dev"),
  };
}

/** Whether the deployment records analytics: the block is there and not switched off. */
export function analyticsEnabled(cfg: Pick<ProjectConfig, "analytics">): boolean {
  return cfg.analytics !== undefined && cfg.analytics.enabled !== false;
}

/**
 * The defaults the Workers read (`CLOUDHAL_ANALYTICS_DEFAULTS`), `parseAnalyticsDefaults` shape:
 * only what applies per site.
 */
export function analyticsDefaultsOf(cfg: Pick<ProjectConfig, "analytics">): {
  enabled: boolean;
  uniqueVisitors: boolean;
  vitalsOneIn: number;
} {
  return {
    enabled: analyticsEnabled(cfg),
    uniqueVisitors: cfg.analytics?.uniqueVisitors ?? false,
    vitalsOneIn: cfg.analytics?.vitalsOneIn ?? 5,
  };
}

export async function readProjectConfig(projectDir: string): Promise<ProjectConfig> {
  const file = path.join(projectDir, CONFIG_FILE);
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    throw new Error(`${CONFIG_FILE} not found in ${projectDir}. Run \`cloudhal init\` first.`);
  }
  const cfg = JSON.parse(raw) as Partial<ProjectConfig>;
  if (typeof cfg.siteId !== "string") throw new Error(`${CONFIG_FILE}: missing siteId`);
  const domains = cfg.domains && typeof cfg.domains === "object" ? cfg.domains : undefined;
  const analytics = parseAnalyticsConfig(cfg.analytics);
  return {
    siteId: cfg.siteId,
    dataDir: cfg.dataDir ?? ".cloudhal",
    ...(domains && (domains.site || domains.studio)
      ? {
          domains: {
            ...(typeof domains.site === "string" ? { site: domains.site } : {}),
            ...(typeof domains.studio === "string" ? { studio: domains.studio } : {}),
          },
        }
      : {}),
    ...(analytics ? { analytics } : {}),
  };
}

export async function writeProjectConfig(projectDir: string, cfg: ProjectConfig): Promise<void> {
  const file = path.join(projectDir, CONFIG_FILE);
  // Keys this type does not own (e.g. the starter's `media`) stay as they were.
  let kept: Record<string, unknown> = {};
  try {
    const raw = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
    kept = Object.fromEntries(Object.entries(raw).filter(([k]) => !OWN_KEYS.has(k)));
  } catch {
    // a new project
  }
  await writeFile(file, `${JSON.stringify({ ...cfg, ...kept }, null, 2)}\n`);
}
