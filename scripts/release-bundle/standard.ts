/**
 * The manifest facts of the standard Cloudhal release (RFC-0046 §3): what a remote deployer needs
 * to know before it uploads the standard `cloudhal init` starter. They mirror the CLI that builds
 * the bundle: `packages/cli/src/cloudflare/config.ts` (COMPATIBILITY_DATE, the admin
 * `run_worker_first`, the SchedulerClock v1 and BuildRoom v2 Durable Objects, the minute cron) and
 * `packages/cli/src/commands/deploy/state.ts` (SECRET_KEYS, SITE_SECRET_KEYS).
 * `packages/cli/test/release-bundle.test.ts` fails when the CLI moves and this file does not.
 */

export interface AssetsConfig {
  readonly not_found_handling?: "none" | "404-page" | "single-page-application";
  readonly run_worker_first?: readonly string[];
}

export const SITE_CONFIG: AssetsConfig = { not_found_handling: "none" };
export const ADMIN_CONFIG: AssetsConfig = {
  not_found_handling: "none",
  run_worker_first: ["/api/*", "/mcp", "/mcp/*", "/.well-known/*"],
};
export const DEFAULT_RUNTIME = {
  compatibilityDate: "2026-10-01",
  compatibilityFlags: ["nodejs_compat"],
} as const;

/** The admin Worker's secrets (`SECRET_KEYS`). */
export const ADMIN_SECRETS = [
  "BETTER_AUTH_SECRET",
  "MCP_STATE_KEY",
  "CLOUDHAL_PREVIEW_SECRET",
  "CLOUDHAL_PURGE_TOKEN",
  "CLOUDHAL_DEPLOY_TOKEN",
  "CLOUDHAL_SETUP_TOKEN",
  "CLOUDHAL_COMMENTS_KEY",
] as const;
/** The site Worker's secrets (`SITE_SECRET_KEYS`). */
export const SITE_SECRETS = [
  "CLOUDHAL_PREVIEW_SECRET",
  "CLOUDHAL_COMMENTS_KEY",
  "CLOUDHAL_PURGE_TOKEN",
] as const;

export const DURABLE_OBJECTS = [
  { name: "SCHEDULER_CLOCK", className: "SchedulerClock", migration: "v1" },
  { name: "BUILD_ROOMS", className: "BuildRoom", migration: "v2" },
] as const;

export const ADMIN_CRON = "* * * * *";

const b = (name: string, type: string, required: boolean) => ({ name, type, required });

/** Every manifest field that does not depend on the build output or the release. */
export const STANDARD_MANIFEST_FIELDS: Readonly<Record<string, unknown>> = {
  contracts: { schemaVersion: 1 },
  levels: { schedules: 1, gates: 2 },
  durableObjects: { bindings: DURABLE_OBJECTS, lifecycleChange: false },
  skills: [],
  bindingTemplates: {
    site: {
      bindings: [
        b("DB", "d1", true),
        b("BLOBS", "r2_bucket", true),
        b("ANALYTICS", "analytics_engine", false),
        b("ANALYTICS_RL", "ratelimit", false),
        b("COMMENTS_RL", "ratelimit", false),
      ],
      vars: ["CLOUDHAL_SITE_ID", "CLOUDHAL_SITE_HOSTS"],
      secrets: SITE_SECRETS,
      cache: true,
    },
    admin: {
      bindings: [
        b("DB", "d1", true),
        b("BLOBS", "r2_bucket", true),
        b("SITE", "service", true),
        b("ASSETS", "assets", true),
        b("SCHEDULER_CLOCK", "durable_object_namespace", true),
        b("BUILD_ROOMS", "durable_object_namespace", true),
        b("ANALYTICS_SQL", "analytics_sql", false),
        b("EMAIL", "send_email", false),
        b("AI", "ai", false),
        b("BROWSER", "browser", false),
      ],
      vars: [
        "CLOUDHAL_SCHEDULER",
        "CLOUDHAL_TICK_BUDGET",
        "CLOUDHAL_AUTOMATIONS",
        "CLOUDHAL_COMMENTS_AVAILABLE",
        "CLOUDHAL_SITE_ID",
      ],
      secrets: ADMIN_SECRETS,
      cron: ADMIN_CRON,
    },
  },
  requiredScopes: ["account-settings.read", "workers-scripts.edit", "d1.write", "workers-r2.write"],
  optionalScopes: ["account-analytics.read", "workers-routes.write", "dns.write"],
  requiredCapabilities: ["account", "workers", "d1", "r2"],
  optionalCapabilities: ["analytics", "domains"],
  features: {
    adminSitesAcceptsSiteId: false,
    healthReportsVersion: false,
    mediaTransformVar: false,
  },
};

/** The starter `cloudhal init` copies when none is named. */
export const STANDARD_STARTER = "blog";
/** `toolchain.producer` of every bundle this builder writes. */
export const PRODUCER = "cloudhal-release-bundle";
