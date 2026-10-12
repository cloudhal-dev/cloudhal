/**
 * `cloudhal deploy` — puts the project on Cloudflare (ADR-0012):
 *
 *   1. D1 database + R2 bucket (created if missing; ids recorded in the wrangler configs)
 *   2. secrets generated once into `<dataDir>/deploy/secrets.json` (0600, never committed)
 *   3. site Worker: `astro build` for the cloudflare target, `wrangler deploy`
 *   4. admin Worker: generated entry + bundled skills + built Studio, `wrangler deploy`
 *   5. push: the local site (graph, snapshots, blobs) through the admin API — first deploy only;
 *      afterwards the deployment is the source of truth (use `cloudhal pull`).
 *   6. analytics (RFC-0006 §11): with `analytics` on in cloudhal.json both configs get their
 *      bindings and vars (wrangler ≥ 4.145 is required); a project without the key is asked once in
 *      a terminal (non-interactive: off). When analytics switch on or off the site's cache is purged
 *      once, so pages gain or lose the script tag. `analytics.rateLimit` adds the beacon's Workers
 *      Rate Limiting binding (`ANALYTICS_RL`).
 *   7. reader comments (RFC-0007 §15.4): available unless `comments.available` is `false`, and
 *      still off for every site until someone turns them on in Studio. `CLOUDHAL_COMMENTS_KEY` is
 *      generated once with the other secrets and given to both Workers; the admin Worker gets
 *      `CLOUDHAL_COMMENTS_AVAILABLE`; `comments.rateLimit` adds `COMMENTS_RL`. When availability
 *      changes the site's cache is purged once (pages gain or lose the comments tag).
 *   8. data location (RFC-0007 D7): only when this deploy creates the D1 database, `--jurisdiction
 *      eu` (or the terminal question) creates it in the EU jurisdiction. It cannot change later;
 *      existing databases are never touched.
 *   9. the scheduler (RFC-0008 §8.2–§8.3, §16): the admin Worker gets the minute cron trigger
 *      (`* * * * *`, the slot the hourly jobs used), the `SchedulerClock` Durable Object binding and
 *      migration (always), and `CLOUDHAL_SCHEDULER`. When Cloudflare refuses the trigger (Workers
 *      Free allows 5 per account) it redeploys without it and with `CLOUDHAL_SCHEDULER=alarm`; the
 *      ticker is remembered in `state.json` (`--scheduler cron` tries the trigger again). A
 *      deployment last deployed with the legacy `CLOUDHAL_*_CRON=off` starts as `alarm`.
 *  10. the downgrade guard (RFC-0008 Compatibility): code whose schedules level is lower than the
 *      deployment's would ignore holds and time gates, so it is refused while the deployment has
 *      open releases or gated pages and entries, unless `--force-downgrade`.
 *
 * `--dry-run` runs everything up to wrangler's own `--dry-run` (bundles, configs) and skips
 * provisioning, deployment and push — no Cloudflare account needed.
 */
import { access, chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { datasetName } from "@cloudhal/analytics/wae";
import { openLocalStore } from "@cloudhal/core-ts/local";
import { SCHEDULES_ENGINE_LEVEL } from "@cloudhal/core-ts/releases";
import { assetDir } from "../assets.ts";
import { prepareAdminWorker } from "../cloudflare/admin.ts";
import { buildSiteWorker } from "../cloudflare/build.ts";
import {
  type AnalyticsDeployment,
  type CommentsDeployment,
  DEFAULT_BEACON_RATE_LIMIT,
  DEFAULT_COMMENTS_RATE_LIMIT,
  type DeploymentNames,
  rateLimitNamespaceId,
  readExistingIds,
  readExistingVars,
  type SchedulerTicker,
  siteConfigPath,
  siteWorkerConfig,
  workerNames,
  writeWranglerConfig,
} from "../cloudflare/config.ts";
import {
  deployedUrls,
  installedWranglerVersion,
  isCronLimitError,
  must,
  versionAtLeast,
  WRANGLER_FOR_ANALYTICS,
  WranglerError,
  type WranglerRunner,
  wranglerRunner,
} from "../cloudflare/wrangler.ts";
import {
  analyticsDefaultsOf,
  analyticsEnabled,
  commentsAvailable,
  type ProjectConfig,
  readProjectConfig,
  writeProjectConfig,
} from "../config.ts";
import { resolveSkillsDir } from "./mcp.ts";
import { pushSite, setPrimaryDomain } from "./sync.ts";

export const SECRET_KEYS = [
  "BETTER_AUTH_SECRET",
  "MCP_STATE_KEY",
  "CLOUDHAL_PREVIEW_SECRET",
  "CLOUDHAL_PURGE_TOKEN",
  "CLOUDHAL_DEPLOY_TOKEN",
  "CLOUDHAL_SETUP_TOKEN",
  // RFC-0007: proof-of-work MACs, email encryption and hashes, stored secrets; both Workers.
  "CLOUDHAL_COMMENTS_KEY",
] as const;
export type DeploySecrets = Record<(typeof SECRET_KEYS)[number], string>;

export interface DeployState {
  name: string;
  adminUrl?: string;
  siteUrl?: string;
  deployedAt?: string;
  /** The custom site domain this deploy routed, so removing it later restores workers.dev. */
  siteDomain?: string;
  /** Whether the last deploy had analytics on (a change purges the site's cache once). */
  analytics?: "on" | "off";
  /** Whether the last deploy had reader comments available (a change purges once too). */
  comments?: "on" | "off";
  /** Where a deploy of this project created the D1 database (absent: before RFC-0007). */
  jurisdiction?: Jurisdiction;
  /** What drives the scheduler (RFC-0008 §8.3): the cron trigger, or the Durable Object alarm. */
  scheduler?: SchedulerTicker;
}

/** D1 data location (RFC-0007 D7): `auto` (Cloudflare picks) or the EU jurisdiction. */
export type Jurisdiction = "auto" | "eu";

/** Default daily budget of uncached live analytics queries (RFC-0006 §7.7, open question 6). */
export const DEFAULT_QUERY_BUDGET = 8000;

/** `analytics.rateLimit` as the generated config needs it (RFC-0006 §5.5); `{}` when off. */
export function rateLimitDeployment(
  cfg: Pick<ProjectConfig, "analytics">,
  dataset: string,
): Pick<AnalyticsDeployment, "rateLimit"> {
  const r = cfg.analytics?.rateLimit;
  if (!r) return {};
  const o = r === true ? {} : r;
  return {
    rateLimit: {
      namespaceId: o.namespaceId ?? rateLimitNamespaceId(dataset),
      limit: o.limit ?? DEFAULT_BEACON_RATE_LIMIT,
    },
  };
}

/** `comments.rateLimit` as the generated config needs it (RFC-0007 §6.5); `{}` when off. */
export function commentsRateLimitDeployment(
  cfg: Pick<ProjectConfig, "comments">,
  name: string,
): Pick<CommentsDeployment, "rateLimit"> {
  const r = cfg.comments?.rateLimit;
  if (!r) return {};
  const o = r === true ? {} : r;
  return {
    rateLimit: {
      namespaceId: o.namespaceId ?? rateLimitNamespaceId(name, "comments"),
      limit: o.limit ?? DEFAULT_COMMENTS_RATE_LIMIT,
    },
  };
}

export interface DeployOptions {
  readonly projectDir: string;
  /** Base name for Workers and resources (default: the site slug). */
  readonly name?: string;
  readonly studioDir?: string;
  readonly dryRun?: boolean;
  readonly log?: (line: string) => void;
  /** Injected in tests. */
  readonly wrangler?: WranglerRunner;
  readonly fetch?: typeof fetch;
  /** How long to wait for a freshly deployed admin Worker to answer. Default 2 minutes. */
  readonly healthTimeoutMs?: number;
  /**
   * Asks a yes/no question in a terminal (the analytics upgrade prompt). Absent: non-interactive,
   * so a project without an `analytics` key keeps analytics off.
   */
  readonly prompt?: (question: string) => Promise<boolean>;
  /** The project's wrangler version (tests); read from its `package.json` otherwise. */
  readonly wranglerVersion?: string;
  /**
   * `--jurisdiction eu`: create the D1 database in the EU jurisdiction (RFC-0007 D7). Only used
   * when this deploy creates the database; a jurisdiction cannot be changed later.
   */
  readonly jurisdiction?: Jurisdiction;
  /**
   * Asks where a new D1 database should live (a terminal). Absent: non-interactive, so a new
   * database gets the automatic location unless `jurisdiction` says otherwise.
   */
  readonly askJurisdiction?: () => Promise<Jurisdiction>;
  /**
   * `--scheduler cron|alarm`: the ticker to deploy with (RFC-0008 §8.3). Default: what the last
   * deploy used, else `cron`; a refused cron trigger always falls back to `alarm`.
   */
  readonly scheduler?: SchedulerTicker;
  /**
   * `--force-downgrade`: deploy code with a lower schedules level than the deployment's even while
   * releases are open or gates are set (RFC-0008 Compatibility). Holds and gates stop working.
   */
  readonly forceDowngrade?: boolean;
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export const deployDir = (projectDir: string, dataDir: string) =>
  path.join(projectDir, dataDir, "deploy");

function randomSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Secrets are generated once per project and reused on every deploy. */
export async function loadOrCreateSecrets(dir: string): Promise<DeploySecrets> {
  const file = path.join(dir, "secrets.json");
  let current: Partial<DeploySecrets> = {};
  try {
    current = JSON.parse(await readFile(file, "utf8")) as Partial<DeploySecrets>;
  } catch {
    // first deploy
  }
  const secrets = { ...current } as DeploySecrets;
  let changed = false;
  for (const key of SECRET_KEYS)
    if (!secrets[key] || secrets[key].length < 32) {
      secrets[key] = randomSecret();
      changed = true;
    }
  if (changed) {
    await mkdir(dir, { recursive: true });
    await writeFile(file, `${JSON.stringify(secrets, null, 2)}\n`, { mode: 0o600 });
    await chmod(file, 0o600);
  }
  return secrets;
}

export async function readDeployState(
  projectDir: string,
  dataDir: string,
): Promise<DeployState | undefined> {
  try {
    return JSON.parse(
      await readFile(path.join(deployDir(projectDir, dataDir), "state.json"), "utf8"),
    ) as DeployState;
  } catch {
    return undefined;
  }
}

async function writeDeployState(projectDir: string, dataDir: string, state: DeployState) {
  await writeFile(
    path.join(deployDir(projectDir, dataDir), "state.json"),
    `${JSON.stringify(state, null, 2)}\n`,
  );
}

async function ensureResources(
  run: WranglerRunner,
  cwd: string,
  names: ReturnType<typeof workerNames>,
  log: (l: string) => void,
  where: () => Promise<Jurisdiction>,
): Promise<{ databaseId: string; created?: Jurisdiction }> {
  const info = async () => {
    const r = await run(["d1", "info", names.database, "--json"], { cwd, quiet: true });
    if (r.code !== 0) return undefined;
    try {
      return (JSON.parse(r.stdout) as { uuid?: string }).uuid;
    } catch {
      return undefined;
    }
  };
  let databaseId = await info();
  let made: Jurisdiction | undefined;
  if (!databaseId) {
    made = await where();
    log(
      made === "eu"
        ? `creating D1 database ${names.database} in the EU jurisdiction (this cannot be changed later)`
        : `creating D1 database ${names.database}`,
    );
    const created = await run(
      ["d1", "create", names.database, ...(made === "eu" ? ["--jurisdiction", "eu"] : [])],
      { cwd },
    );
    // A failed `d1 info` (e.g. a transient API error) must not stop a redeploy: the database is
    // already there, so read its id again.
    if (created.code !== 0 && !/already exists/i.test(created.stderr + created.stdout))
      throw new Error(
        `wrangler d1 create ${names.database} failed:\n${created.stderr.slice(-2000)}`,
      );
    databaseId = await info();
    if (!databaseId) throw new Error(`could not read the id of D1 database ${names.database}`);
  }
  const bucket = await run(["r2", "bucket", "create", names.bucket], { cwd });
  if (bucket.code !== 0 && !/already exists|already own/i.test(bucket.stderr + bucket.stdout))
    throw new Error(`could not create R2 bucket ${names.bucket}:\n${bucket.stderr.slice(-2000)}`);
  return { databaseId, ...(made ? { created: made } : {}) };
}

async function waitForHealth(
  adminUrl: string,
  f: typeof fetch,
  log: (line: string) => void,
  timeoutMs: number,
): Promise<void> {
  const url = new URL("/api/health", adminUrl);
  const deadline = Date.now() + timeoutMs;
  let announced = false;
  for (;;) {
    try {
      const res = await f(url);
      if (res.ok) return;
    } catch {
      // DNS/TLS not ready yet
    }
    if (Date.now() > deadline)
      throw new Error(
        `${adminUrl} did not answer within ${Math.round(timeoutMs / 1000)}s; run \`cloudhal push\` once it is up`,
      );
    if (!announced) {
      log(`waiting for ${new URL(adminUrl).hostname} to come online…`);
      announced = true;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
}

export interface DeployResult {
  dryRun: boolean;
  names: ReturnType<typeof workerNames>;
  siteConfig: string;
  adminConfig: string;
  siteUrl?: string | undefined;
  adminUrl?: string | undefined;
  pushed?: boolean;
  /** First deploy only: open it to create the owner account. */
  setupUrl?: string;
  /** Custom domains from cloudhal.json, routed by this deploy. */
  customSiteUrl?: string;
  customStudioUrl?: string;
  /** What drives the scheduler (RFC-0008 §8.3): the minute cron trigger, or the clock's alarm. */
  scheduler: SchedulerTicker;
  /** Site analytics as deployed (RFC-0006 §11). */
  analytics: {
    enabled: boolean;
    dataset?: string;
    /** The cron trigger is in place (false: the scheduler runs on the Durable Object alarm). */
    cron?: boolean;
    /** The site's cache was purged because analytics switched on or off. */
    purged?: boolean;
  };
  /** Reader comments as deployed (RFC-0007 §15.4); off per site until turned on in Studio. */
  comments: {
    available: boolean;
    /** The cron trigger is in place (false: the scheduler runs on the Durable Object alarm). */
    cron?: boolean;
    /** The `COMMENTS_RL` Rate Limiting binding was added. */
    rateLimit?: boolean;
    /** The site's cache was purged because availability changed. */
    purged?: boolean;
  };
  /** Set when this deploy created the D1 database: where it lives (RFC-0007 D7). */
  databaseCreated?: Jurisdiction;
}

/**
 * Whether this deploy records analytics: `cloudhal.json` decides; a project without the key is
 * asked once in a terminal and the answer is written back (RFC-0006 §11, open question 1).
 */
async function decideAnalytics(
  options: DeployOptions,
  cfg: ProjectConfig,
  siteName: string,
  log: (line: string) => void,
): Promise<ProjectConfig> {
  if (cfg.analytics !== undefined) return cfg;
  if (!options.prompt) {
    log(
      'analytics: off. Turn on cookie-less analytics with "analytics": { "enabled": true } in cloudhal.json, then deploy again.',
    );
    return cfg;
  }
  const yes = await options.prompt(`Turn on cookie-less analytics for ${siteName}? (Y/n) `);
  const next: ProjectConfig = { ...cfg, analytics: { enabled: yes } };
  await writeProjectConfig(options.projectDir, next);
  log(`analytics: ${yes ? "on" : "off"} (saved in cloudhal.json)`);
  return next;
}

/** Purges the site Worker's whole cache once (the script tag lives in cached HTML). */
async function purgeSite(
  siteUrl: string,
  token: string,
  f: typeof fetch,
  log: (line: string) => void,
): Promise<boolean> {
  try {
    const res = await f(new URL("/__cloudhal/purge", siteUrl), {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });
    if (res.ok) return true;
    log(`could not purge the site cache (${res.status}); pages pick up the change as they expire`);
  } catch (e) {
    log(`could not purge the site cache: ${e instanceof Error ? e.message : String(e)}`);
  }
  return false;
}

/**
 * Where a database this deploy creates should live (RFC-0007 D7): the flag, else the terminal
 * question, else (non-interactive) the automatic location, saying how to choose.
 */
function jurisdictionChooser(
  options: DeployOptions,
  log: (line: string) => void,
): () => Promise<Jurisdiction> {
  return async () => {
    if (options.jurisdiction) return options.jurisdiction;
    if (options.askJurisdiction) return options.askJurisdiction();
    log(
      "D1 database: automatic location (non-interactive). To keep the data in the EU, create it with `cloudhal deploy --jurisdiction eu` instead: a jurisdiction cannot be changed once the database exists.",
    );
    return "auto";
  };
}

/** The RFC's words when Cloudflare refuses the trigger (§16). */
export const CRON_REFUSED_MESSAGE =
  "Cloudflare refused the cron trigger: this account uses all its cron triggers (Workers Free allows 5). The scheduler runs on a Durable Object alarm instead.";

/**
 * The schedules level of the code this project deploys: `cloudhal.schedulesLevel` of the
 * `@cloudhal/core-ts` its admin Worker bundles (0 before RFC-0008), else the CLI's own.
 */
export async function projectSchedulesLevel(projectDir: string): Promise<number> {
  const require = createRequire(path.join(projectDir, "package.json"));
  const candidates: string[] = [];
  try {
    candidates.push(require.resolve("@cloudhal/core-ts/package.json"));
  } catch {
    // not a direct dependency of the project
  }
  try {
    const cf = require.resolve("@cloudhal/cloudflare/package.json");
    candidates.push(createRequire(cf).resolve("@cloudhal/core-ts/package.json"));
  } catch {
    // resolved through the CLI below
  }
  for (const file of candidates) {
    try {
      const pkg = JSON.parse(await readFile(file, "utf8")) as {
        cloudhal?: { schedulesLevel?: unknown };
      };
      const level = pkg.cloudhal?.schedulesLevel;
      return typeof level === "number" ? level : 0;
    } catch {
      // try the next
    }
  }
  return SCHEDULES_ENGINE_LEVEL;
}

export interface SchedulesStatus {
  engine?: { schedulesLevel?: number };
  sites?: { siteId: string; openReleases?: unknown[]; gatedNodes?: number }[];
}

/**
 * The downgrade guard (RFC-0008 Compatibility): older code ignores holds (an ordinary publish
 * would release held nodes) and older site Workers ignore gates. A deployment that answers no
 * schedules status predates schedules and has nothing to protect.
 */
async function downgradeGuard(
  options: DeployOptions,
  adminUrl: string,
  token: string,
  log: (line: string) => void,
): Promise<void> {
  let status: SchedulesStatus;
  try {
    const res = await (options.fetch ?? fetch)(new URL("/api/admin/schedules/status", adminUrl), {
      headers: { authorization: `Bearer ${token}` },
    });
    if (res.status === 404) return;
    if (!res.ok) {
      log(
        `could not read the deployment's schedules (${res.status}); the downgrade check is skipped`,
      );
      return;
    }
    status = (await res.json()) as SchedulesStatus;
  } catch (e) {
    log(
      `could not reach the deployment to check its schedules (${e instanceof Error ? e.message : String(e)}); the downgrade check is skipped`,
    );
    return;
  }
  const remote = status.engine?.schedulesLevel ?? 0;
  const local = await projectSchedulesLevel(options.projectDir);
  if (remote <= local) return;
  const open = (status.sites ?? []).reduce((n, s) => n + (s.openReleases?.length ?? 0), 0);
  const gated = (status.sites ?? []).reduce((n, s) => n + (s.gatedNodes ?? 0), 0);
  if (open + gated === 0) return;
  const what = `${open} open release(s) and ${gated} page(s) or entr(ies) with time gates`;
  if (options.forceDowngrade) {
    log(
      `--force-downgrade: deploying schedules level ${local} over level ${remote} with ${what}; held content and embargoes are no longer enforced`,
    );
    return;
  }
  throw new Error(
    `This deploy would downgrade the deployment's schedules (level ${remote} → ${local}) while it has ${what}. Older code ignores scheduled holds and time gates, so they could go live early. Upgrade the @cloudhal packages of this project, cancel the releases and remove the gates (\`cloudhal schedules status --remote\` lists them), or deploy with --force-downgrade.`,
  );
}

export async function deploy(options: DeployOptions): Promise<DeployResult> {
  const log = options.log ?? (() => {});
  if (options.jurisdiction !== undefined && !["auto", "eu"].includes(options.jurisdiction))
    throw new Error(`--jurisdiction must be eu (got "${String(options.jurisdiction)}")`);
  if (options.scheduler !== undefined && !["cron", "alarm"].includes(options.scheduler))
    throw new Error(`--scheduler must be cron or alarm (got "${String(options.scheduler)}")`);
  let cfg = await readProjectConfig(options.projectDir);
  const dir = deployDir(options.projectDir, cfg.dataDir);
  await mkdir(dir, { recursive: true });
  const run = options.wrangler ?? wranglerRunner(options.projectDir, log);

  const local = await openLocalStore(path.join(options.projectDir, cfg.dataDir));
  const site = await local.store.getSite(cfg.siteId);
  await local.close();
  if (!site) throw new Error(`site ${cfg.siteId} not found in the local store`);
  const previous = await readDeployState(options.projectDir, cfg.dataDir);
  const base: DeploymentNames = { name: options.name ?? previous?.name ?? site.slug };
  const names = workerNames(base);

  // 0. analytics: decided before anything is generated; the wrangler version gates the configs
  cfg = await decideAnalytics(options, cfg, site.name, log);
  let analytics: AnalyticsDeployment | undefined;
  if (analyticsEnabled(cfg)) {
    const version = options.wranglerVersion ?? (await installedWranglerVersion(options.projectDir));
    if (version && !versionAtLeast(version, WRANGLER_FOR_ANALYTICS))
      throw new Error(
        `Analytics needs wrangler 4.145 or newer (found ${version}). Run \`pnpm add -D wrangler@^4.148\`, or set \`analytics.enabled: false\` in cloudhal.json.`,
      );
    analytics = {
      dataset: datasetName(base.name),
      defaults: analyticsDefaultsOf(cfg),
      budget: cfg.analytics?.queryBudget ?? DEFAULT_QUERY_BUDGET,
      ...rateLimitDeployment(cfg, datasetName(base.name)),
    };
  }
  // 0b. reader comments (RFC-0007 §15.4): available by default, still off for every site
  const comments: CommentsDeployment = commentsAvailable(cfg)
    ? { available: true, ...commentsRateLimitDeployment(cfg, base.name) }
    : { available: false };
  if (comments.available && previous?.comments !== "on")
    log(
      "comments: available on this deployment, and off for every site until someone turns them on in Studio (Site settings › Comments)",
    );

  const studioDir = options.studioDir ?? (await assetDir("studio")) ?? "(no built Studio)";
  if (!(await exists(path.join(studioDir, "index.html"))))
    throw new Error(
      `built Studio not found at ${studioDir} (run \`pnpm --filter @cloudhal/studio build\`)`,
    );

  // 1. resources
  const existing = await readExistingIds(siteConfigPath(options.projectDir));
  let databaseId = existing.databaseId;
  let databaseCreated: Jurisdiction | undefined;
  if (!options.dryRun) {
    const r = await ensureResources(
      run,
      options.projectDir,
      names,
      log,
      jurisdictionChooser(options, log),
    );
    databaseId = r.databaseId;
    databaseCreated = r.created;
    if (!databaseCreated && options.jurisdiction === "eu")
      log(
        `D1 database ${names.database} already exists, so --jurisdiction changes nothing: a jurisdiction is chosen when the database is created and cannot be changed (to move, export the data, deploy under a new --name with --jurisdiction eu, and import)`,
      );
  }
  const withIds: DeploymentNames = { ...base, ...(databaseId ? { databaseId } : {}) };

  // 2. secrets
  const secrets = await loadOrCreateSecrets(dir);
  // 2b. RFC-0008: never deploy code that ignores holds and gates over open releases and gates
  if (!options.dryRun && previous?.adminUrl)
    await downgradeGuard(options, previous.adminUrl, secrets.CLOUDHAL_DEPLOY_TOKEN, log);
  // 2c. the scheduler's ticker: asked for, else the last deploy's, else cron (RFC-0008 §8.3). A
  // deployment last configured without a cron slot (`CLOUDHAL_*_CRON=off`) starts on the alarm.
  const legacy = await readExistingVars(path.join(dir, "admin", "wrangler.jsonc"));
  let scheduler: SchedulerTicker =
    options.scheduler ??
    previous?.scheduler ??
    (legacy.CLOUDHAL_ANALYTICS_CRON === "off" || legacy.CLOUDHAL_COMMENTS_CRON === "off"
      ? "alarm"
      : "cron");
  if (scheduler === "alarm" && !options.scheduler)
    log(
      "scheduler: Durable Object alarm (this account had no free cron slot); `cloudhal deploy --scheduler cron` tries the cron trigger again",
    );
  // 3. site Worker
  await writeWranglerConfig(
    siteConfigPath(options.projectDir),
    siteWorkerConfig({
      ...withIds,
      siteId: cfg.siteId,
      ...(cfg.domains?.site ? { domain: cfg.domains.site, siteHosts: [cfg.domains.site] } : {}),
      ...(analytics ? { analytics } : {}),
      comments,
    }),
    `Cloudhal site Worker for ${site.name}`,
  );
  log("building the site Worker");
  const siteConfig = await buildSiteWorker(options.projectDir, (l) => log(`  ${l}`));

  // 4. admin Worker
  const skillsDir = await resolveSkillsDir(options.projectDir);
  const prepareAdmin = (
    a: AnalyticsDeployment | undefined,
    c: CommentsDeployment,
    ticker: SchedulerTicker,
  ) =>
    prepareAdminWorker({
      projectDir: options.projectDir,
      dataDir: cfg.dataDir,
      names: withIds,
      siteId: cfg.siteId,
      studioDir,
      skillsDir,
      domain: cfg.domains?.studio,
      analytics: a,
      comments: c,
      scheduler: ticker,
    });
  const admin = await prepareAdmin(analytics, comments, scheduler);

  if (options.dryRun) {
    await must(
      run,
      ["deploy", "--dry-run", "--outdir", path.join(dir, "out/site")],
      options.projectDir,
    );
    await must(
      run,
      ["deploy", "-c", admin.configPath, "--dry-run", "--outdir", path.join(dir, "out/admin")],
      admin.dir,
    );
    log("dry run complete: bundles in .cloudhal/deploy/out");
    return {
      dryRun: true,
      names,
      siteConfig,
      adminConfig: admin.configPath,
      scheduler,
      analytics: analytics
        ? { enabled: true, dataset: analytics.dataset, cron: scheduler === "cron" }
        : { enabled: false },
      comments: commentsResult(comments, scheduler),
    };
  }

  // Secrets go to wrangler through files that exist only while it runs (0600, then removed).
  const siteSecretsFile = path.join(dir, "site-secrets.json");
  const adminSecretsFile = path.join(dir, "admin-secrets.json");
  const writeSecret = async (file: string, value: object) => {
    await writeFile(file, JSON.stringify(value), { mode: 0o600 });
    await chmod(file, 0o600);
  };
  let siteDeploy: Awaited<ReturnType<typeof must>>;
  let adminDeploy: Awaited<ReturnType<typeof must>>;
  try {
    await writeSecret(siteSecretsFile, {
      CLOUDHAL_PREVIEW_SECRET: secrets.CLOUDHAL_PREVIEW_SECRET,
      CLOUDHAL_PURGE_TOKEN: secrets.CLOUDHAL_PURGE_TOKEN,
      // RFC-0007: the same value as the admin Worker's (proof of work, emails, stored secrets)
      CLOUDHAL_COMMENTS_KEY: secrets.CLOUDHAL_COMMENTS_KEY,
    });
    await writeSecret(adminSecretsFile, secrets);
    log(`deploying ${names.site}`);
    siteDeploy = await must(run, ["deploy", "--secrets-file", siteSecretsFile], options.projectDir);
    log(`deploying ${names.admin}`);
    const adminArgs = ["deploy", "-c", admin.configPath, "--secrets-file", adminSecretsFile];
    adminDeploy = await run(adminArgs, { cwd: admin.dir });
    if (
      adminDeploy.code !== 0 &&
      scheduler === "cron" &&
      isCronLimitError(adminDeploy.stderr + adminDeploy.stdout)
    ) {
      // RFC-0008 §8.3: no free cron slot (Workers Free allows 5 per account). The same Worker
      // goes without the trigger and the SchedulerClock alarm ticks instead.
      log(CRON_REFUSED_MESSAGE);
      scheduler = "alarm";
      await prepareAdmin(analytics, comments, scheduler);
      adminDeploy = await run(adminArgs, { cwd: admin.dir });
    }
    if (adminDeploy.code !== 0)
      throw new WranglerError(
        `wrangler ${adminArgs.join(" ")} failed:\n${(adminDeploy.stderr || adminDeploy.stdout).slice(-3000)}`,
      );
  } finally {
    await rm(siteSecretsFile, { force: true });
    await rm(adminSecretsFile, { force: true });
  }
  const siteUrl = deployedUrls(siteDeploy.records)[0];
  const adminUrl = deployedUrls(adminDeploy.records)[0];
  // where the database lives, when a deploy of this deployment name created it
  const jurisdiction =
    databaseCreated ?? (previous?.name === base.name ? previous.jurisdiction : undefined);
  await writeDeployState(options.projectDir, cfg.dataDir, {
    name: base.name,
    ...(adminUrl ? { adminUrl } : {}),
    ...(siteUrl ? { siteUrl } : {}),
    deployedAt: new Date().toISOString(),
    ...(cfg.domains?.site ? { siteDomain: cfg.domains.site } : {}),
    analytics: analytics ? "on" : "off",
    comments: comments.available ? "on" : "off",
    ...(jurisdiction ? { jurisdiction } : {}),
    scheduler,
  });

  // 5. first deploy: push the local site
  let pushed = false;
  if (adminUrl) {
    // A brand-new workers.dev hostname can take a while to answer; wait instead of failing.
    await waitForHealth(adminUrl, options.fetch ?? fetch, log, options.healthTimeoutMs ?? 120_000);
    if (siteUrl && !(site.domains ?? []).length) {
      // Preview links need the public hostname of the site.
      const l = await openLocalStore(path.join(options.projectDir, cfg.dataDir));
      const current = await l.store.getSite(cfg.siteId);
      if (current)
        await l.store.updateSite({
          ...current,
          domains: [{ hostname: new URL(siteUrl).hostname, primary: true }],
        });
      await l.close();
    }
    const result = await pushSite({
      projectDir: options.projectDir,
      ifAbsent: true,
      log,
      ...(options.fetch ? { fetch: options.fetch } : {}),
    });
    pushed = result.pushed;
    // A custom domain becomes the site's primary hostname (the workers.dev one stays secondary).
    if (cfg.domains?.site) {
      await setPrimaryDomain({
        projectDir: options.projectDir,
        hostname: cfg.domains.site,
        ...(options.fetch ? { fetch: options.fetch } : {}),
      });
      log(
        `site domain: https://${cfg.domains.site} (Cloudflare issues the certificate on first use)`,
      );
    } else if (previous?.siteDomain && siteUrl) {
      // The custom domain was removed from cloudhal.json: workers.dev is primary again.
      await setPrimaryDomain({
        projectDir: options.projectDir,
        hostname: new URL(siteUrl).hostname,
        ...(options.fetch ? { fetch: options.fetch } : {}),
      });
      log(
        `site domain ${previous.siteDomain} removed from cloudhal.json; if Cloudflare still lists it under the Worker's Domains & Routes, remove it there`,
      );
    }
  }
  // Analytics switched on (or off): purge the site's cache once, so cached pages gain (or lose)
  // the script tag. The admin Worker ran migration 0014 on the health check above; until it has,
  // the Site Worker counts analytics as off (fail closed).
  // Comments availability likewise (RFC-0007): pages cached before carry no
  // `cloudhal-comments-<id>` tag, so a site turning comments on later could not reach them.
  let purged = false;
  const analyticsChanged = (previous?.analytics ?? "off") !== (analytics ? "on" : "off");
  const commentsChanged = (previous?.comments ?? "off") !== (comments.available ? "on" : "off");
  if (siteUrl && (analyticsChanged || commentsChanged)) {
    purged = await purgeSite(siteUrl, secrets.CLOUDHAL_PURGE_TOKEN, options.fetch ?? fetch, log);
    const what = [
      ...(analyticsChanged ? [`analytics ${analytics ? "on" : "off"}`] : []),
      ...(commentsChanged ? [`comments ${comments.available ? "available" : "unavailable"}`] : []),
    ];
    if (purged) log(`${what.join(", ")}: purged the site cache`);
  }

  // First deploy: the owner account can only be created through this one-time link.
  const setupUrl =
    pushed && adminUrl
      ? `${adminUrl.replace(/\/$/, "")}/login?setup=${secrets.CLOUDHAL_SETUP_TOKEN}`
      : undefined;
  return {
    dryRun: false,
    names,
    siteConfig,
    adminConfig: admin.configPath,
    siteUrl,
    adminUrl,
    pushed,
    ...(setupUrl ? { setupUrl } : {}),
    ...(cfg.domains?.site ? { customSiteUrl: `https://${cfg.domains.site}` } : {}),
    ...(cfg.domains?.studio ? { customStudioUrl: `https://${cfg.domains.studio}` } : {}),
    scheduler,
    analytics: analytics
      ? {
          enabled: true,
          dataset: analytics.dataset,
          cron: scheduler === "cron",
          purged: purged && analyticsChanged,
        }
      : { enabled: false, ...(purged && analyticsChanged ? { purged } : {}) },
    comments: commentsResult(comments, scheduler, purged && commentsChanged),
    ...(databaseCreated ? { databaseCreated } : {}),
  };
}

function commentsResult(
  c: CommentsDeployment,
  scheduler: SchedulerTicker,
  purged?: boolean,
): DeployResult["comments"] {
  return {
    available: c.available,
    ...(c.available ? { cron: scheduler === "cron" } : {}),
    ...(c.rateLimit ? { rateLimit: true } : {}),
    ...(purged ? { purged } : {}),
  };
}
