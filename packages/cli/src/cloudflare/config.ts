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
 * SQL binding (`ANALYTICS_SQL`, no API token) and rolls finished days up hourly.
 *
 * Reader comments (RFC-0007 §15.3–15.4), available unless `cloudhal.json` says otherwise: both
 * Workers get the secret `CLOUDHAL_COMMENTS_KEY` (through `--secrets-file`, never in a config), the
 * admin Worker `CLOUDHAL_COMMENTS_AVAILABLE`, and the site Worker, with `comments.rateLimit`, a
 * Workers Rate Limiting binding (`COMMENTS_RL`).
 *
 * The scheduler (RFC-0008 §8.2–§8.3, §16): the admin Worker always has the minute cron trigger
 * (`* * * * *`, the one slot the hourly jobs used) — or, when Cloudflare refused it, none and
 * `CLOUDHAL_SCHEDULER=alarm` — and always declares the SQLite-backed `SchedulerClock` Durable Object
 * (`SCHEDULER_CLOCK`) with its migration, so switching tickers never needs a migration. The hourly
 * jobs (analytics rollup, comments) run behind watermarks on that tick. `CLOUDHAL_TICK_BUDGET` sizes
 * each tick for the account's Workers plan and `CLOUDHAL_AUTOMATIONS` is the deployment's
 * automations switch (§8.2, §11.6); both are always written, so a deploy never drops them.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const COMPATIBILITY_DATE = "2026-10-01";

/**
 * The admin Worker's one cron trigger (RFC-0008 §8.2): the scheduler's minute tick. It replaces the
 * hourly `17 * * * *` in the same slot; the hourly jobs run behind watermarks on it.
 */
export const MINUTE_CRON = "* * * * *";

/** What drives the scheduler on Cloudflare: the cron trigger, or the Durable Object alarm. */
export type SchedulerTicker = "cron" | "alarm";

/**
 * The Workers plan a tick is sized for (RFC-0008 §8.2, `CLOUDHAL_TICK_BUDGET`): `free` — 40
 * statements and one release a tick — or `paid` — 900 statements and up to 50 releases.
 */
export type WorkersPlan = "free" | "paid";

/** What the generated admin config needs for schedules (RFC-0008 §8.2, §11.6). */
export interface SchedulesDeployment {
  /** `false` writes `CLOUDHAL_AUTOMATIONS=off`: automations stop; releases and gates go on. */
  readonly automations: boolean;
  /** The tick budget (`CLOUDHAL_TICK_BUDGET`). */
  readonly plan: WorkersPlan;
}

/** A deployment that says nothing: automations on, the Workers Free budget (the safe one). */
export const DEFAULT_SCHEDULES_DEPLOYMENT: SchedulesDeployment = {
  automations: true,
  plan: "free",
};

/** The scheduler's Durable Object (RFC-0008 §8.3): binding, class and its migration tag. */
export const SCHEDULER_CLOCK_BINDING = "SCHEDULER_CLOCK";
export const SCHEDULER_CLOCK_CLASS = "SchedulerClock";
export const SCHEDULER_CLOCK_MIGRATION = "v1";

/** Build rooms (RFC-0020 §6): one Durable Object per page for Studio's Build view. */
export const BUILD_ROOMS_BINDING = "BUILD_ROOMS";
export const BUILD_ROOMS_CLASS = "BuildRoom";
export const BUILD_ROOMS_MIGRATION = "v2";

/** What the generated configs need for reader comments (RFC-0007 §15.3–15.4). */
export interface CommentsDeployment {
  /** `cloudhal.json` `comments.available` (default true); `false` sets `CLOUDHAL_COMMENTS_AVAILABLE=false`. */
  readonly available: boolean;
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
    /** Logs sampling and opt-in traces (default: every log, no traces). */
    observability?: ObservabilityDeployment;
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
    observability: observabilitySettings(n.observability),
  };
}

/** What the generated configs need for Workers Logs and Traces (`cloudhal.json` `observability`). */
export interface ObservabilityDeployment {
  /** Share of requests whose logs are kept (1 = all). */
  readonly logs: number;
  /** Share of requests traced; `false` = no traces. */
  readonly traces: number | false;
}

/** Every log, no traces: what a deployment that says nothing gets. */
export const DEFAULT_OBSERVABILITY: ObservabilityDeployment = { logs: 1, traces: false };

/**
 * The `observability` block of both Workers (https://developers.cloudflare.com/workers/observability/
 * logs/workers-logs/, …/traces/). Query strings are redacted from logs and traces: preview links
 * carry their signed token there (`?cloudhal-preview=…`), and logs are readable by every account
 * member with Workers access.
 */
export function observabilitySettings(o: ObservabilityDeployment = DEFAULT_OBSERVABILITY) {
  return {
    enabled: true,
    ...(o.logs < 1 ? { head_sampling_rate: o.logs } : {}),
    redact_query_string: true,
    ...(o.traces === false
      ? {}
      : {
          traces: {
            enabled: true,
            ...(o.traces < 1 ? { head_sampling_rate: o.traces } : {}),
          },
        }),
  };
}

/** The admin Worker's Email Service binding (RFC-0011). */
export const MAIL_BINDING = "EMAIL";

/** What the generated admin config needs for email delivery (RFC-0011). */
export interface MailDeployment {
  readonly from: string;
  readonly fromName?: string;
}

/** The admin Worker's config (API + auth + MCP + Studio assets). */
export function adminWorkerConfig(
  n: DeploymentNames & {
    studioDir: string;
    main: string;
    /** The site the site Worker serves (`CLOUDHAL_SITE_ID`). */
    siteId?: string;
    domain?: string;
    analytics?: AnalyticsDeployment;
    comments?: CommentsDeployment;
    /** The scheduler's ticker (default `cron`; `alarm` when Cloudflare refused the trigger). */
    scheduler?: SchedulerTicker;
    /** The tick budget and the automations switch (default: `free`, automations on). */
    schedules?: SchedulesDeployment;
    /** Email delivery: a `send_email` binding locked to this one sender (RFC-0011). */
    mail?: MailDeployment;
    /** In-editor AI (RFC-0016): the Workers AI binding. */
    ai?: boolean;
    /** Browser Rendering for `render_page` (RFC-0021 §4; `cloudhal deploy` binds it by default). */
    browser?: boolean;
    /** Logs sampling and opt-in traces (default: every log, no traces). */
    observability?: ObservabilityDeployment;
    /** Smart Placement: run next to D1 rather than next to the person (default: off). */
    placement?: "smart";
  },
) {
  const names = workerNames(n);
  const a = n.analytics;
  const c = n.comments;
  const scheduler: SchedulerTicker = n.scheduler ?? "cron";
  const s = n.schedules ?? DEFAULT_SCHEDULES_DEPLOYMENT;
  const vars = {
    // RFC-0008 §11.1: the feed check fetches this site's feed through `SITE` (it serves no other).
    ...(n.siteId ? { CLOUDHAL_SITE_ID: n.siteId } : {}),
    ...(a
      ? {
          CLOUDHAL_ANALYTICS_DATASET: a.dataset,
          CLOUDHAL_ANALYTICS_BUDGET: String(a.budget),
          CLOUDHAL_ANALYTICS_DEFAULTS: JSON.stringify(a.defaults),
        }
      : {}),
    ...(c ? { CLOUDHAL_COMMENTS_AVAILABLE: c.available ? "true" : "false" } : {}),
    // RFC-0008 §8.3: which ticker runs `runDue` (the legacy `*_CRON=off` vars are not written again).
    CLOUDHAL_SCHEDULER: scheduler,
    // §8.2: the statements and releases one tick may spend; §11.6: the deployment's kill switch.
    CLOUDHAL_TICK_BUDGET: s.plan,
    CLOUDHAL_AUTOMATIONS: s.automations ? "on" : "off",
    ...(n.mail
      ? {
          CLOUDHAL_MAIL_FROM: n.mail.from,
          ...(n.mail.fromName ? { CLOUDHAL_MAIL_FROM_NAME: n.mail.fromName } : {}),
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
    // RFC-0011: the Worker can send only as the configured address.
    ...(n.mail
      ? { send_email: [{ name: MAIL_BINDING, allowed_sender_addresses: [n.mail.from] }] }
      : {}),
    // RFC-0016: Workers AI for in-editor commands; billed per use, nothing runs until a site's
    // owner turns AI on.
    ...(n.ai ? { ai: { binding: "AI" } } : {}),
    // RFC-0021 §4: render_page opens previews in Browser Rendering (agents only, rate-limited).
    ...(n.browser ? { browser: { binding: "BROWSER" } } : {}),
    vars,
    // The SQLite-backed clock is always declared (Workers Free allows SQLite classes only), so
    // switching between the cron trigger and the alarm never needs a migration (§8.3).
    durable_objects: {
      bindings: [
        { name: SCHEDULER_CLOCK_BINDING, class_name: SCHEDULER_CLOCK_CLASS },
        { name: BUILD_ROOMS_BINDING, class_name: BUILD_ROOMS_CLASS },
      ],
    },
    // Migrations only ever append: v1 is the clock, v2 the build rooms (RFC-0020 §6).
    migrations: [
      { tag: SCHEDULER_CLOCK_MIGRATION, new_sqlite_classes: [SCHEDULER_CLOCK_CLASS] },
      { tag: BUILD_ROOMS_MIGRATION, new_sqlite_classes: [BUILD_ROOMS_CLASS] },
    ],
    triggers: { crons: scheduler === "cron" ? [MINUTE_CRON] : [] },
    ...customDomain(n.domain),
    // Every API call makes several D1 round trips; Smart Placement may run the Worker near the
    // database (fetch handler only: the cron and the clock's alarm are unaffected).
    ...(n.placement === "smart" ? { placement: { mode: "smart" } } : {}),
    assets: {
      directory: n.studioDir,
      binding: "ASSETS",
      // The Worker serves the SPA shell for client routes and a 404 for missing build files; the
      // assets layer's own SPA fallback would answer index.html for a missing /assets/*.js too.
      not_found_handling: "none",
      run_worker_first: ["/api/*", "/mcp", "/mcp/*", "/.well-known/*"],
    },
    observability: observabilitySettings(n.observability),
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

/**
 * The vars of an existing generated config (`{}` when there is none): what the last deploy set,
 * e.g. the legacy `CLOUDHAL_*_CRON=off` of a deployment without a cron slot (RFC-0008 §16).
 */
export async function readExistingVars(file: string): Promise<Record<string, string>> {
  try {
    const text = (await readFile(file, "utf8")).replace(/^\s*\/\/.*$/gm, "");
    const cfg = JSON.parse(text) as { vars?: Record<string, unknown> };
    return Object.fromEntries(
      Object.entries(cfg.vars ?? {}).filter((e): e is [string, string] => typeof e[1] === "string"),
    );
  } catch {
    return {};
  }
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
