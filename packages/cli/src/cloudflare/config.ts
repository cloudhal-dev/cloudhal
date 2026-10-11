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
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const COMPATIBILITY_DATE = "2026-10-01";

/** The admin Worker's hourly analytics job (RFC-0006 §7.5). */
export const ANALYTICS_CRON = "17 * * * *";

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
  n: DeploymentNames & { siteId: string; domain?: string; analytics?: AnalyticsDeployment },
) {
  const a = n.analytics;
  return {
    $schema: "node_modules/wrangler/config-schema.json",
    name: workerNames(n).site,
    main: "@cloudhal/astro-renderer/cloudflare-entry",
    compatibility_date: COMPATIBILITY_DATE,
    compatibility_flags: ["nodejs_compat"],
    ...storageBindings(n),
    // Analytics (RFC-0006 §4): one write binding; the dataset is created on its first write.
    ...(a ? { analytics_engine_datasets: [{ binding: "ANALYTICS", dataset: a.dataset }] } : {}),
    vars: {
      CLOUDHAL_SITE_ID: n.siteId,
      ...(a
        ? {
            CLOUDHAL_ANALYTICS: "on",
            CLOUDHAL_ANALYTICS_DEFAULTS: JSON.stringify(a.defaults),
            ...(a.siteHosts?.length ? { CLOUDHAL_SITE_HOSTS: a.siteHosts.join(",") } : {}),
          }
        : {}),
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
  },
) {
  const names = workerNames(n);
  const a = n.analytics;
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
    // dataset, the query budget and the defaults; the hourly rollup job. Without analytics the
    // cron list is empty, so turning analytics off also removes the trigger.
    ...(a
      ? {
          analytics: { binding: "ANALYTICS_SQL" },
          vars: {
            CLOUDHAL_ANALYTICS_DATASET: a.dataset,
            CLOUDHAL_ANALYTICS_BUDGET: String(a.budget),
            CLOUDHAL_ANALYTICS_DEFAULTS: JSON.stringify(a.defaults),
            ...(a.cron ? {} : { CLOUDHAL_ANALYTICS_CRON: "off" }),
          },
        }
      : {}),
    triggers: { crons: a?.cron ? [ANALYTICS_CRON] : [] },
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
