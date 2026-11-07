import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseSearchConfig, type SearchConfig } from "./config-search.ts";

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

/**
 * `cloudhal.json` `mail` (RFC-0011): the sender of invites and reset links. Its domain must be
 * onboarded to Cloudflare Email Service; `cloudhal deploy` binds `send_email` locked to `from`.
 */
export interface MailConfig {
  /** A plain `local@domain` address. */
  readonly from: string;
  /** Display name (default: none). */
  readonly fromName?: string;
}

/**
 * `cloudhal.json` `observability` (RFC-0013): what both Workers send to Workers Logs and Traces. Logs are on
 * for every request unless sampled down; traces are opt-in (stored traces are billed from
 * 2026-12-01). Query strings are always redacted: preview links carry their token there.
 */
export interface ObservabilityConfig {
  /** Share of requests whose logs are kept, 0–1 (default 1). */
  readonly logs?: number;
  /** Workers Traces: `true` traces every request, a number samples that share (0–1). */
  readonly traces?: boolean | number;
}

/**
 * `cloudhal.json` `ai` (RFC-0016): `{}` binds Workers AI (`AI`) to the admin Worker, so each site's
 * owner can turn in-editor AI on in Studio. No keys: the binding bills to the account.
 */
export type AiConfig = Record<string, never>;

/** A plain `local@domain` address: no display name, no spaces or line breaks. */
const MAIL_ADDRESS = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

/** `cloudhal.json` at the project root. Kept tiny; everything else lives in the store. */
export interface ProjectConfig {
  /** The project's own site: what `dev`, `push`, `pull` and the other site commands work on. */
  readonly siteId: string;
  /**
   * RFC-0034 §4: every site the deployment's site Worker serves, picked by hostname. `siteId`
   * always comes first. Absent: the Worker serves `siteId` alone, on every host.
   */
  readonly sites?: readonly string[];
  /**
   * RFC-0034 §4: the folder of the installation this project's site Worker joins (relative to
   * this project): `cloudhal deploy` then deploys only a site Worker, on that installation's
   * database, bucket and secrets, and registers it there. Used for a theme of its own.
   */
  readonly installation?: string;
  /** Relative to the project root. */
  readonly dataDir: string;
  /**
   * Custom domains `cloudhal deploy` routes to the Workers (Cloudflare Custom Domains; the zone
   * must be in the same account). The workers.dev addresses keep working. `redirects` answer with
   * a 301 to `site` (#49), e.g. `www.example.com`.
   */
  readonly domains?: {
    readonly site?: string;
    readonly studio?: string;
    readonly redirects?: readonly string[];
  };
  /** Site analytics (RFC-0006); absent = off. */
  readonly analytics?: AnalyticsConfig;
  /** Reader comments (RFC-0007); absent = available, off per site. */
  readonly comments?: CommentsConfig;
  /** Schedules (RFC-0008); absent = automations on, the Free tick budget. */
  readonly schedules?: SchedulesConfig;
  /** Email delivery (RFC-0011); absent = invites and resets by link only. */
  readonly mail?: MailConfig;
  /** In-editor AI through Workers AI (RFC-0016); absent = no `AI` binding. */
  readonly ai?: AiConfig;
  /**
   * `false` (RFC-0021 §4): no Browser Rendering binding, so `render_page` is unavailable on the
   * deployment. Absent = bound (agents render pages to check them; billed per browser time).
   */
  readonly render?: false;
  /** Workers Logs sampling and opt-in Traces for both Workers; absent = every log, no traces. */
  readonly observability?: ObservabilityConfig;
  /**
   * `"smart"` (RFC-0013): Smart Placement for the admin Worker, which runs next to D1 instead of next to the
   * visitor (it makes several database round trips per request). Absent = default placement.
   */
  readonly placement?: "smart";
  /** The search provider (RFC-0029 §3, `config-search.ts`); absent = FTS5 alone. */
  readonly search?: SearchConfig;
}

export const CONFIG_FILE = "cloudhal.json";

/** The keys `ProjectConfig` owns; others (e.g. `media`, read by the starter) are kept on write. */
const OWN_KEYS = new Set([
  "siteId",
  "sites",
  "installation",
  "dataDir",
  "domains",
  "analytics",
  "comments",
  "schedules",
  "mail",
  "ai",
  "observability",
  "placement",
  "search",
]);

const VITALS = [0, 1, 2, 5, 10, 20];

/** `domains`, leniently: values of the wrong type are left out. */
function parseDomains(input: unknown): ProjectConfig["domains"] {
  if (!input || typeof input !== "object") return undefined;
  const d = input as Record<string, unknown>;
  const redirects = Array.isArray(d.redirects)
    ? d.redirects.filter((h): h is string => typeof h === "string" && h !== "")
    : [];
  const out = {
    ...(typeof d.site === "string" && d.site ? { site: d.site } : {}),
    ...(typeof d.studio === "string" && d.studio ? { studio: d.studio } : {}),
    ...(redirects.length > 0 ? { redirects } : {}),
  };
  return Object.keys(out).length > 0 ? out : undefined;
}

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

/**
 * `mail` (RFC-0011). Unlike the lenient blocks above, a `from` that is there but is not a plain
 * address is an error: mail silently off would hide a typo until the first invite.
 */
export function parseMailConfig(input: unknown): MailConfig | undefined {
  if (input === undefined || input === null) return undefined;
  if (typeof input !== "object" || Array.isArray(input))
    throw new Error(`${CONFIG_FILE}: mail must be an object like {"from": "studio@example.com"}`);
  const o = input as Record<string, unknown>;
  const from = typeof o.from === "string" ? o.from.trim() : "";
  if (!MAIL_ADDRESS.test(from) || from.length > 254)
    throw new Error(
      `${CONFIG_FILE}: mail.from must be a plain address like "studio@example.com" (no display name; use mail.fromName)`,
    );
  const name = typeof o.fromName === "string" ? o.fromName.replace(/[\r\n]+/g, " ").trim() : "";
  return { from, ...(name ? { fromName: name.slice(0, 100) } : {}) };
}

/** Leniently parsed, like `schedules`: rates outside 0–1 and values of the wrong type are left out. */
export function parseObservabilityConfig(input: unknown): ObservabilityConfig | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const o = input as Record<string, unknown>;
  const rate = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
  return {
    ...(rate(o.logs) ? { logs: o.logs as number } : {}),
    ...(typeof o.traces === "boolean" || rate(o.traces)
      ? { traces: o.traces as boolean | number }
      : {}),
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

const SITE_ID = /^site_[A-Za-z0-9]{6,32}$/;

/** A site id `sites` accepts (`site_` and 6 to 32 letters or digits). */
export function isSiteId(id: string): boolean {
  return SITE_ID.test(id);
}

/** `sites`: valid ids, each once, the project's site first; undefined unless it adds a site. */
export function parseSites(siteId: string, input: unknown): string[] | undefined {
  if (input === undefined) return undefined;
  if (!Array.isArray(input) || !input.every((s) => typeof s === "string" && SITE_ID.test(s)))
    throw new Error(`${CONFIG_FILE}: sites must be a list of site ids (site_…)`);
  const sites = [...new Set([siteId, ...(input as string[])])];
  return sites.length > 1 ? sites : undefined;
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
  const domains = parseDomains(cfg.domains);
  const analytics = parseAnalyticsConfig(cfg.analytics);
  const comments = parseCommentsConfig(cfg.comments);
  const schedules = parseSchedulesConfig(cfg.schedules);
  const mail = parseMailConfig(cfg.mail);
  // RFC-0016: `{}` or `true` binds Workers AI; anything else leaves it off.
  const ai = cfg.ai === (true as unknown) || (cfg.ai && typeof cfg.ai === "object");
  const observability = parseObservabilityConfig(cfg.observability);
  const search = parseSearchConfig(cfg.search);
  const sites = parseSites(cfg.siteId, cfg.sites);
  return {
    siteId: cfg.siteId,
    ...(sites ? { sites } : {}),
    ...(typeof cfg.installation === "string" && cfg.installation
      ? { installation: cfg.installation }
      : {}),
    dataDir: cfg.dataDir ?? ".cloudhal",
    ...(domains ? { domains } : {}),
    ...(analytics ? { analytics } : {}),
    ...(comments ? { comments } : {}),
    ...(schedules ? { schedules } : {}),
    ...(mail ? { mail } : {}),
    ...(ai ? { ai: {} } : {}),
    ...(cfg.render === false ? { render: false as const } : {}),
    ...(observability ? { observability } : {}),
    ...(cfg.placement === "smart" ? { placement: "smart" as const } : {}),
    ...(search ? { search } : {}),
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
