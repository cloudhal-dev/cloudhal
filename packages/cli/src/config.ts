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
  /**
   * Workers Rate Limiting binding for the beacon (RFC-0006 §5.5): `true` for the defaults, or
   * `{ limit, namespaceId }`. A cross-isolate limit on top of the per-isolate one; off when absent.
   */
  readonly rateLimit?: boolean | AnalyticsRateLimitConfig;
  /** Record `cloudhal dev` traffic locally (default off: it is the author's own). */
  readonly dev?: boolean;
}

/** `cloudhal.json` → `analytics.rateLimit` as an object. */
export interface AnalyticsRateLimitConfig {
  /** Beacons per client per 60 s across isolates (default 120; 1–10,000). */
  readonly limit?: number;
  /**
   * The binding's `namespace_id`: a positive integer, unique in the Cloudflare account. Default:
   * derived from the deployment name, so two deployments in one account do not share counters.
   */
  readonly namespaceId?: string;
}

/**
 * `cloudhal.json` → `comments` (RFC-0007 §4.5, §15.4): deployment defaults for reader comments.
 * Absent means available (`cloudhal init` writes `{ "available": true }`); comments still stay
 * **off for every site** until someone turns them on in Studio (owner decision D4), so a deploy
 * never surprises a site with a comment form.
 */
export interface CommentsConfig {
  /** `false` removes comments from the deployment: no endpoints, no module, no cron work. */
  readonly available?: boolean;
  /**
   * Workers Rate Limiting binding for submissions (RFC-0007 §6.5, `COMMENTS_RL`): `true` for the
   * defaults (10 a minute per client per Cloudflare location), or `{ limit, namespaceId }`. On top
   * of the per-isolate and D1 limits, which work without it; off when absent.
   */
  readonly rateLimit?: boolean | AnalyticsRateLimitConfig;
}

/**
 * `cloudhal.json` → `schedules` (RFC-0008 §8.2, §11.6): what `cloudhal deploy` writes for the
 * scheduler. Absent means automations on and the Workers Free tick budget (unless `--plan paid`
 * was deployed before: `state.json` remembers it).
 */
export interface SchedulesConfig {
  /** `false` turns automations off for the deployment (`CLOUDHAL_AUTOMATIONS=off`). */
  readonly automations?: boolean;
  /** The account's Workers plan, which sizes each tick (`CLOUDHAL_TICK_BUDGET`). */
  readonly plan?: "free" | "paid";
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
  /** Reader comments (RFC-0007); absent = available, off per site. */
  readonly comments?: CommentsConfig;
  /** Schedules (RFC-0008); absent = automations on, the Free tick budget. */
  readonly schedules?: SchedulesConfig;
}

export const CONFIG_FILE = "cloudhal.json";

/** The keys `ProjectConfig` owns; others (e.g. `media`, read by the starter) are kept on write. */
const OWN_KEYS = new Set(["siteId", "dataDir", "domains", "analytics", "comments", "schedules"]);

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
    ...rateLimitOf(o.rateLimit),
    ...bool("dev"),
  };
}

/** Leniently parsed, like `analytics`: values of the wrong type are left out. */
export function parseCommentsConfig(input: unknown): CommentsConfig | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const o = input as Record<string, unknown>;
  return {
    ...(typeof o.available === "boolean" ? { available: o.available } : {}),
    ...rateLimitOf(o.rateLimit),
  };
}

/** Leniently parsed, like `comments`: values of the wrong type are left out. */
export function parseSchedulesConfig(input: unknown): SchedulesConfig | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const o = input as Record<string, unknown>;
  return {
    ...(typeof o.automations === "boolean" ? { automations: o.automations } : {}),
    ...(o.plan === "free" || o.plan === "paid" ? { plan: o.plan } : {}),
  };
}

/** Whether the deployment offers reader comments: on unless `comments.available` is `false`. */
export function commentsAvailable(cfg: Pick<ProjectConfig, "comments">): boolean {
  return cfg.comments?.available !== false;
}

function rateLimitOf(v: unknown): { rateLimit?: boolean | AnalyticsRateLimitConfig } {
  if (typeof v === "boolean") return { rateLimit: v };
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const o = v as Record<string, unknown>;
  const limit =
    Number.isInteger(o.limit) && (o.limit as number) >= 1 && (o.limit as number) <= 10_000
      ? { limit: o.limit as number }
      : {};
  const id = typeof o.namespaceId === "number" ? String(o.namespaceId) : o.namespaceId;
  const namespaceId =
    typeof id === "string" && /^[1-9]\d{0,17}$/.test(id) ? { namespaceId: id } : {};
  return { rateLimit: { ...limit, ...namespaceId } };
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
  const comments = parseCommentsConfig(cfg.comments);
  const schedules = parseSchedulesConfig(cfg.schedules);
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
    ...(comments ? { comments } : {}),
    ...(schedules ? { schedules } : {}),
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
