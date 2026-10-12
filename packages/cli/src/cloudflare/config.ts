/**
 * Wrangler configuration for a Cloudhal deployment (ADR-0012). Two Workers share one D1 database
 * and one R2 bucket:
 *
 * - the **site** Worker (the project's Astro build, SSR on demand, edge-cached), and
 * - the **admin** Worker (API, auth, MCP, Studio), which calls the site Worker over a service
 *   binding to purge its cache after publish/rollback.
 *
 * Resource ids are omitted on first deploy: wrangler provisions D1/R2 and writes the ids back.
 *
 * Site analytics (RFC-0006 §11), when `cloudhal.json` turns them on: the site Worker writes to a
 * Workers Analytics Engine dataset (`ANALYTICS`), the admin Worker reads it through the Analytics
 * SQL binding (`ANALYTICS_SQL`, no API token) and rolls finished days up on an hourly cron trigger.
 *
 * Reader comments (RFC-0007 §15.3–15.4), available unless `cloudhal.json` says otherwise: both
 * Workers get the secret `CLOUDHAL_COMMENTS_KEY` (through `--secrets-file`, never in a config), the
 * admin Worker `CLOUDHAL_COMMENTS_AVAILABLE` and the same hourly cron (retention, threads closed
 * by time, the purge backstop) even when analytics are off, and the site Worker, with
 * `comments.rateLimit`, a Workers Rate Limiting binding (`COMMENTS_RL`).
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const COMPATIBILITY_DATE = "2026-10-01";

/** The admin Worker's hourly job: analytics rollups (RFC-0006 §7.5) and comments (RFC-0007 §8.5). */
export const HOURLY_CRON = "17 * * * *";
/** @deprecated the trigger is shared with comments; use `HOURLY_CRON`. */
export const ANALYTICS_CRON = HOURLY_CRON;

/** What the generated configs need for reader comments (RFC-0007 §15.3–15.4). */
export interface CommentsDeployment {
  /** `cloudhal.json` `comments.available` (default true); `false` sets `CLOUDHAL_COMMENTS_AVAILABLE=false`. */
  readonly available: boolean;
  /** The hourly cron trigger; `false` when the account has no free cron slot (the job then runs on admin requests). */
  readonly cron: boolean;
  /** The submissions' Rate Limiting binding (`comments.rateLimit`, §6.5). */
  readonly rateLimit?: { readonly namespaceId: string; readonly limit: number };
}

/** The comment submissions' Rate Limiting binding name (RFC-0007 §6.5). */
export const COMMENTS_RATE_LIMIT_BINDING = "COMMENTS_RL";
/** Submissions per client per 60 s per Cloudflare location, unless cloudhal.json says otherwise. */
export const DEFAULT_COMMENTS_RATE_LIMIT = 10;

/** What the generated configs need for site analytics (RFC-0006 §8, §11). */
export interface AnalyticsDeployment {
  /** `<deployment>_events` (`datasetName`). */
  readonly dataset: string;
  /** `CLOUDHAL_ANALYTICS_DEFAULTS`: cloudhal.json's per-site defaults. */
  readonly defaults: Readonly<Record<string, unknown>>;
  /** Uncached live queries per UTC day (admin Worker). */
  readonly budget: number;
  /** The hourly cron trigger; `false` when the account has no free cron slot (§11). */
  readonly cron: boolean;
  /** Extra hostnames the site answers on (custom domains), `CLOUDHAL_SITE_HOSTS`. */
  readonly siteHosts?: readonly string[];
  /** The Workers Rate Limiting binding for the beacon (`analytics.rateLimit`, §5.5). */
  readonly rateLimit?: { readonly namespaceId: string; readonly limit: number };
}

/** The beacon's Rate Limiting binding name (RFC-0006 §5.5). */
export const ANALYTICS_RATE_LIMIT_BINDING = "ANALYTICS_RL";
/** Beacons per client per 60 s across isolates, unless cloudhal.json says otherwise. */
export const DEFAULT_BEACON_RATE_LIMIT = 120;

/**
 * A `namespace_id` for the deployment's beacon limiter: a positive integer derived from the dataset
 * name (FNV-1a, 9 digits, offset so it never collides with small hand-picked ids), stable across
 * deploys and different between deployments of one account. cloudhal.json can pin another.
 */
export function rateLimitNamespaceId(
  dataset: string,
  kind: "beacon" | "comments" = "beacon",
): string {
  let h = 0x811c9dc5;
  for (const ch of new TextEncoder().encode(`cloudhal-${kind}:${dataset}`)) {
    h ^= ch;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return String(1_000_000_000 + (h % 1_000_000_000));
}

export interface DeploymentNames {
  /** Base name, e.g. `newsroom` → Workers `newsroom-site` / `newsroom-admin`. */
  readonly name: string;
  readonly databaseName?: string;
  readonly databaseId?: string;
  readonly bucketName?: string;
}

export function workerNames(n: DeploymentNames) {
  return {
    site: `${n.name}-site`,
    admin: `${n.name}-admin`,
    database: n.databaseName ?? `${n.name}-db`,
    bucket: n.bucketName ?? `${n.name}-blobs`,
  };
}

const storageBindings = (n: DeploymentNames) => {
  const names = workerNames(n);
  return {
    d1_databases: [
      {
        binding: "DB",
        database_name: names.database,
        ...(n.databaseId ? { database_id: n.databaseId } : {}),
      },
    ],
    r2_buckets: [{ binding: "BLOBS", bucket_name: names.bucket }],
  };
};

/** Cloudflare Custom Domain routes (wrangler creates the DNS record and certificate). */
function customDomain(hostname: string | undefined) {
  return hostname ? { routes: [{ pattern: hostname, custom_domain: true }] } : {};
}

/** The site Worker's config, written to the project root (`wrangler.jsonc`) before `astro build`. */
export function siteWorkerConfig(
  n: DeploymentNames & {
    siteId: string;
    domain?: string;
    analytics?: AnalyticsDeployment;
    comments?: CommentsDeployment;
    /** Extra hostnames the site answers on (custom domains): analytics and comments check them. */
    siteHosts?: readonly string[];
  },
) {
  const a = n.analytics;
  const c = n.comments?.available ? n.comments : undefined;
  const hosts = [...new Set([...(n.siteHosts ?? []), ...(a?.siteHosts ?? [])])];
  const ratelimits = [
    // Optional cross-isolate beacon limit (RFC-0006 §5.5): one key per client (an HMAC, never the IP).
    ...(a?.rateLimit
      ? [
          {
            name: ANALYTICS_RATE_LIMIT_BINDING,
            namespace_id: a.rateLimit.namespaceId,
            simple: { limit: a.rateLimit.limit, period: 60 },
          },
        ]
      : []),
    // Optional cross-isolate comment submission limit (RFC-0007 §6.5), keyed the same way.
    ...(c?.rateLimit
      ? [
          {
            name: COMMENTS_RATE_LIMIT_BINDING,
            namespace_id: c.rateLimit.namespaceId,
            simple: { limit: c.rateLimit.limit, period: 60 },
          },
        ]
      : []),
  ];
  return {
    $schema: "node_modules/wrangler/config-schema.json",
    name: workerNames(n).site,
    main: "@cloudhal/astro-renderer/cloudflare-entry",
    compatibility_date: COMPATIBILITY_DATE,
    compatibility_flags: ["nodejs_compat"],
    ...storageBindings(n),
    // Analytics (RFC-0006 §4): one write binding; the dataset is created on its first write.
    ...(a ? { analytics_engine_datasets: [{ binding: "ANALYTICS", dataset: a.dataset }] } : {}),
    ...(ratelimits.length > 0 ? { ratelimits } : {}),
    vars: {
      CLOUDHAL_SITE_ID: n.siteId,
      ...(a
        ? {
            CLOUDHAL_ANALYTICS: "on",
            CLOUDHAL_ANALYTICS_DEFAULTS: JSON.stringify(a.defaults),
          }
        : {}),
      // RFC-0006 §5.2 / RFC-0007 §6.2 step 2: the same-origin checks accept these hosts too.
      ...((a || c) && hosts.length > 0 ? { CLOUDHAL_SITE_HOSTS: hosts.join(",") } : {}),
    },
    ...customDomain(n.domain),
    // Workers Cache: published pages are cached until a publish purges `cloudhal-site-<id>`.
    cache: { enabled: true },
    observability: { enabled: true },
  };
}

/** The admin Worker's config (API + auth + MCP + Studio assets). */
export function adminWorkerConfig(
  n: DeploymentNames & {
    studioDir: string;
    main: string;
    domain?: string;
    analytics?: AnalyticsDeployment;
    comments?: CommentsDeployment;
  },
) {
  const names = workerNames(n);
  const a = n.analytics;
  const c = n.comments;
  // One hourly trigger serves both jobs (RFC-0006 §7.5, RFC-0007 §15.3): comments need it even
  // when analytics are off. Without either the cron list is empty, so the trigger goes away.
  const cron = Boolean(a?.cron || (c?.available && c.cron));
  const vars = {
    ...(a
      ? {
          CLOUDHAL_ANALYTICS_DATASET: a.dataset,
          CLOUDHAL_ANALYTICS_BUDGET: String(a.budget),
          CLOUDHAL_ANALYTICS_DEFAULTS: JSON.stringify(a.defaults),
          ...(a.cron ? {} : { CLOUDHAL_ANALYTICS_CRON: "off" }),
        }
      : {}),
    ...(c
      ? {
          CLOUDHAL_COMMENTS_AVAILABLE: c.available ? "true" : "false",
          // no trigger: the hourly comments job runs on admin requests instead (at most hourly)
          ...(c.available && !c.cron ? { CLOUDHAL_COMMENTS_CRON: "off" } : {}),
        }
      : {}),
  };
  return {
    $schema: "node_modules/wrangler/config-schema.json",
    name: names.admin,
    main: n.main,
    compatibility_date: COMPATIBILITY_DATE,
    // Better Auth needs AsyncLocalStorage.
    compatibility_flags: ["nodejs_compat"],
    ...storageBindings(n),
    services: [{ binding: "SITE", service: names.site }],
    // Analytics (RFC-0006 §7.3): reads WAE through the binding, no API token; vars for the
    // dataset, the query budget and the defaults. Comments (RFC-0007): the availability switch.
    ...(a ? { analytics: { binding: "ANALYTICS_SQL" } } : {}),
    ...(Object.keys(vars).length > 0 ? { vars } : {}),
    triggers: { crons: cron ? [HOURLY_CRON] : [] },
    ...customDomain(n.domain),
    assets: {
      directory: n.studioDir,
      binding: "ASSETS",
      // The Worker serves the SPA shell for client routes and a 404 for missing build files; the
      // assets layer's own SPA fallback would answer index.html for a missing /assets/*.js too.
      not_found_handling: "none",
      run_worker_first: ["/api/*", "/mcp", "/mcp/*", "/.well-known/*"],
    },
    observability: { enabled: true },
  };
}

/** Writes a config as JSONC (plain JSON with a header comment). */
export async function writeWranglerConfig(
  file: string,
  config: object,
  header: string,
): Promise<void> {
  const body = `// ${header}\n// Generated by \`cloudhal deploy\`; resource ids are filled in by wrangler on first deploy.\n${JSON.stringify(config, null, 2)}\n`;
  await writeFile(file, body);
}

/** Reads ids wrangler wrote back into an existing config, so regenerating keeps them. */
export async function readExistingIds(file: string): Promise<{ databaseId?: string }> {
  try {
    const text = (await readFile(file, "utf8")).replace(/^\s*\/\/.*$/gm, "");
    const cfg = JSON.parse(text) as { d1_databases?: { database_id?: string }[] };
    const id = cfg.d1_databases?.[0]?.database_id;
    return id ? { databaseId: id } : {};
  } catch {
    return {};
  }
}

export const SITE_CONFIG_FILE = "wrangler.jsonc";
export const siteConfigPath = (projectDir: string) => path.join(projectDir, SITE_CONFIG_FILE);
