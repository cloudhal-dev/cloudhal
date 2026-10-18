/**
 * The phases of `cloudhal deploy` before anything is uploaded: the project and its site, analytics
 * and comments, the Studio build, Cloudflare resources, the scheduler and plan, the site Worker.
 */

import { mkdir } from "node:fs/promises";
import path from "node:path";
import { datasetName } from "@cloudhal/analytics/wae";
import { openLocalStore } from "@cloudhal/core-ts/local";
import { assetDir, monorepoRoot } from "../../assets.ts";
import {
  blockTypesFile,
  loadBlockRegistry,
  loadThemeDesign,
  loadThemeSettings,
  themeSettingsFile,
} from "../../blocks.ts";
import { buildSiteWorker } from "../../cloudflare/build.ts";
import {
  type AnalyticsDeployment,
  type CommentsDeployment,
  DEFAULT_SCHEDULES_DEPLOYMENT,
  type DeploymentNames,
  type ObservabilityDeployment,
  readExistingIds,
  readExistingVars,
  type SchedulerTicker,
  type SchedulesDeployment,
  siteConfigPath,
  siteWorkerConfig,
  type WorkersPlan,
  workerNames,
  writeWranglerConfig,
} from "../../cloudflare/config.ts";
import { searchDeploymentOf } from "../../cloudflare/search.ts";
import {
  installedWranglerVersion,
  versionAtLeast,
  WRANGLER_FOR_ANALYTICS,
  wranglerRunner,
} from "../../cloudflare/wrangler.ts";
import {
  analyticsDefaultsOf,
  analyticsEnabled,
  commentsAvailable,
  readProjectConfig,
} from "../../config.ts";
import {
  ensureStudioBuild,
  MONOREPO_STUDIO_DIST,
  STUDIO_BUILD_COMMAND,
} from "../../studio-build.ts";
import type { DeployContext } from "./context.ts";
import type { DeployOptions } from "./options.ts";
import { ensureResources } from "./resources.ts";
import {
  commentsRateLimitDeployment,
  DEFAULT_QUERY_BUDGET,
  decideAnalytics,
  jurisdictionChooser,
  observabilityOf,
  rateLimitDeployment,
} from "./settings.ts";
import { deployDir, exists, type Jurisdiction, readDeployState } from "./state.ts";

export function checkOptions(options: DeployOptions): void {
  if (options.jurisdiction !== undefined && !["auto", "eu"].includes(options.jurisdiction))
    throw new Error(`--jurisdiction must be eu (got "${String(options.jurisdiction)}")`);
  if (options.scheduler !== undefined && !["cron", "alarm"].includes(options.scheduler))
    throw new Error(`--scheduler must be cron or alarm (got "${String(options.scheduler)}")`);
  if (options.plan !== undefined && !["free", "paid"].includes(options.plan))
    throw new Error(`--plan must be free or paid (got "${String(options.plan)}")`);
}

/** The project, its site, the last deploy, the names; analytics decided before anything is generated. */
export async function loadDeploy(options: DeployOptions): Promise<DeployContext> {
  const log = options.log ?? (() => {});
  const cfg = await readProjectConfig(options.projectDir);
  const dir = deployDir(options.projectDir, cfg.dataDir);
  await mkdir(dir, { recursive: true });
  const run = options.wrangler ?? wranglerRunner(options.projectDir, log);

  const local = await openLocalStore(path.join(options.projectDir, cfg.dataDir));
  const site = await local.store.getSite(cfg.siteId);
  await local.close();
  if (!site) throw new Error(`site ${cfg.siteId} not found in the local store`);
  const previous = await readDeployState(options.projectDir, cfg.dataDir);
  const name = options.name ?? previous?.name ?? site.slug;
  // RFC-0029 §3: the search provider's instance and bucket, bound by both Workers.
  const search = searchDeploymentOf(cfg.search, name);
  const base: DeploymentNames = { name, ...(search ? { search } : {}) };
  if (search)
    log(
      `search: Cloudflare AI Search instance ${search.instance} over R2 bucket ${search.bucket} (the instance must exist, read that bucket and declare the text metadata fields locale and kind); ${search.dailyLimit} semantic searches per site a day, then FTS5 alone`,
    );
  const names = workerNames(base);
  // 0. analytics: decided before anything is generated; the wrangler version gates the configs
  const decided = await decideAnalytics(options, cfg, site.name, log);
  return { options, log, cfg: decided, dir, run, site, previous, base, names };
}

/** 0. analytics bindings (wrangler ≥ 4.145); 0b. reader comments (RFC-0007 §15.4). */
export async function analyticsAndComments(
  ctx: DeployContext,
): Promise<{ analytics: AnalyticsDeployment | undefined; comments: CommentsDeployment }> {
  const { options, cfg, base, previous, log } = ctx;
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
  // available by default, still off for every site
  const comments: CommentsDeployment = commentsAvailable(cfg)
    ? { available: true, ...commentsRateLimitDeployment(cfg, base.name) }
    : { available: false };
  if (comments.available && previous?.comments !== "on")
    log(
      "comments: available on this deployment, and off for every site until someone turns them on in Studio (Site settings › Comments)",
    );
  return { analytics, comments };
}

/**
 * The built Studio. From the monorepo, `apps/studio/dist` is only as new as its last build: build
 * it (or, with --no-build-studio, refuse) when it is missing or Studio sources changed since. A
 * published install ships Studio prebuilt and is never checked.
 */
export async function studioDirFor(ctx: DeployContext): Promise<string> {
  const { options, log } = ctx;
  const repoRoot = await monorepoRoot();
  const studioDir =
    options.studioDir ??
    (await assetDir("studio")) ??
    (repoRoot ? path.join(repoRoot, MONOREPO_STUDIO_DIST) : "(no built Studio)");
  await ensureStudioBuild({
    studioDir,
    repoRoot,
    build: options.buildStudio !== false,
    log,
    ...(options.studioBuilder ? { builder: options.studioBuilder } : {}),
  });
  if (!(await exists(path.join(studioDir, "index.html"))))
    throw new Error(`built Studio not found at ${studioDir} (run \`${STUDIO_BUILD_COMMAND}\`)`);
  return studioDir;
}

/** 1. resources: D1, R2, KV (skipped on a dry run); the database id goes into the configs. */
export async function provision(
  ctx: DeployContext,
): Promise<{ withIds: DeploymentNames; databaseCreated: Jurisdiction | undefined }> {
  const { options, names, log, base } = ctx;
  const existing = await readExistingIds(siteConfigPath(options.projectDir));
  let databaseId = existing.databaseId;
  let databaseCreated: Jurisdiction | undefined;
  if (!options.dryRun) {
    const r = await ensureResources(ctx.run, {
      cwd: options.projectDir,
      names,
      log,
      where: jurisdictionChooser(options, log),
    });
    databaseId = r.databaseId;
    databaseCreated = r.created;
    if (!databaseCreated && options.jurisdiction === "eu")
      log(
        `D1 database ${names.database} already exists, so --jurisdiction changes nothing: a jurisdiction is chosen when the database is created and cannot be changed (to move, export the data, deploy under a new --name with --jurisdiction eu, and import)`,
      );
  }
  return { withIds: { ...base, ...(databaseId ? { databaseId } : {}) }, databaseCreated };
}

export interface DeploySettings {
  scheduler: SchedulerTicker;
  plan: WorkersPlan;
  schedules: SchedulesDeployment;
  observability: ObservabilityDeployment;
}

/**
 * 2c. the scheduler's ticker: asked for, else the last deploy's, else cron (RFC-0008 §8.3). A
 * deployment last configured without a cron slot (`CLOUDHAL_*_CRON=off`) starts on the alarm.
 * 2d. the tick budget and the automations switch (RFC-0008 §8.2, §11.6), and what this deploy
 * turns on, said once.
 */
export async function deploySettings(ctx: DeployContext): Promise<DeploySettings> {
  const { options, cfg, previous, log } = ctx;
  const legacy = await readExistingVars(path.join(ctx.dir, "admin", "wrangler.jsonc"));
  const scheduler: SchedulerTicker =
    options.scheduler ??
    previous?.scheduler ??
    (legacy.CLOUDHAL_ANALYTICS_CRON === "off" || legacy.CLOUDHAL_COMMENTS_CRON === "off"
      ? "alarm"
      : "cron");
  if (scheduler === "alarm" && !options.scheduler)
    log(
      "scheduler: Durable Object alarm (this account had no free cron slot); `cloudhal deploy --scheduler cron` tries the cron trigger again",
    );
  const plan: WorkersPlan =
    options.plan ?? cfg.schedules?.plan ?? previous?.plan ?? DEFAULT_SCHEDULES_DEPLOYMENT.plan;
  const schedules: SchedulesDeployment = {
    automations: cfg.schedules?.automations !== false,
    plan,
  };
  if (plan === "free" && !options.plan && !cfg.schedules?.plan)
    log(
      "scheduler: Workers Free tick budget (40 statements, 1 release a tick). On Workers Paid, deploy once with `--plan paid` (remembered) or set `schedules.plan` in cloudhal.json",
    );
  // Workers Logs sampling and opt-in Traces for both Workers; Smart Placement for the admin Worker.
  const observability: ObservabilityDeployment = observabilityOf(cfg);
  logFeatures(ctx, { plan, observability, schedules });
  return { scheduler, plan, schedules, observability };
}

function logFeatures(
  { cfg, log }: DeployContext,
  { plan, observability, schedules }: Omit<DeploySettings, "scheduler">,
): void {
  if (observability.traces !== false)
    log(
      `observability: Workers Traces on for ${Math.round(observability.traces * 100)}% of requests (stored traces count toward Cloudflare Observability usage from 2026-12-01)`,
    );
  if (cfg.placement === "smart")
    log(
      "placement: Smart Placement on for the admin Worker; compare its request duration in the Workers dashboard before and after (docs/guides/cloudflare-hardening.md)",
    );
  // RFC-0011: email delivery through the Email Service binding, locked to `mail.from`.
  if (cfg.mail)
    log(
      plan === "paid"
        ? `mail: invites and reset links are sent from ${cfg.mail.from} (its domain must be onboarded to Cloudflare Email Service)`
        : `mail: invites and reset links are sent from ${cfg.mail.from}. On Workers Free, Email Service delivers only to verified destination addresses of this account; any recipient needs Workers Paid`,
    );
  // RFC-0016: Workers AI for in-editor commands; each site's owner turns it on in Studio.
  if (cfg.ai)
    log(
      "ai: Workers AI is bound to the admin Worker; turn AI on per site in Studio › Settings › AI (billed per use, 10,000 free neurons a day)",
    );
  // RFC-0021 §4: agents check pages with render_page in Browser Rendering.
  log(
    cfg.render === false
      ? "render: off (cloudhal.json `render: false`); agents check pages with preview_page only"
      : "render: Browser Rendering is bound for render_page (agents only, 10 a minute per key, 200 a day per site; browser time is billed past the plan's allowance; `render: false` in cloudhal.json turns it off)",
  );
  if (!schedules.automations)
    log(
      "automations: off for this deployment (cloudhal.json `schedules.automations`); releases and time gates go on",
    );
}

/**
 * 3. the site Worker: its config, the theme's block types (RFC-0015 §6), design settings
 * (RFC-0017 §1) and DESIGN.md (RFC-0021 §1) checked before anything is built, then the build.
 */
export async function buildSite(
  ctx: DeployContext,
  input: {
    withIds: DeploymentNames;
    analytics: AnalyticsDeployment | undefined;
    comments: CommentsDeployment;
    observability: ObservabilityDeployment;
  },
) {
  const { options, cfg, site, log } = ctx;
  await writeWranglerConfig(
    siteConfigPath(options.projectDir),
    siteWorkerConfig({
      ...input.withIds,
      siteId: cfg.siteId,
      ...(cfg.domains?.site ? { domain: cfg.domains.site, siteHosts: [cfg.domains.site] } : {}),
      ...(input.analytics ? { analytics: input.analytics } : {}),
      comments: input.comments,
      observability: input.observability,
    }),
    `Cloudhal site Worker for ${site.name}`,
  );
  await loadBlockRegistry(options.projectDir);
  await loadThemeSettings(options.projectDir);
  const blockTypes = await blockTypesFile(options.projectDir);
  const themeSettings = await themeSettingsFile(options.projectDir);
  const themeDesign = await loadThemeDesign(options.projectDir);
  log("building the site Worker");
  const siteConfig = await buildSiteWorker(options.projectDir, (l) => log(`  ${l}`));
  return { siteConfig, blockTypes, themeSettings, themeDesign };
}
