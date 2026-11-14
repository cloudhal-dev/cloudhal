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
 *  11. the tick budget and the automations switch (RFC-0008 §8.2, §11.6): the admin Worker always
 *      gets `CLOUDHAL_TICK_BUDGET` (`free` unless `--plan paid` or `schedules.plan` says `paid`; the
 *      plan is remembered in `state.json`) and `CLOUDHAL_AUTOMATIONS` (`off` when
 *      `schedules.automations` is `false`). Cloudflare offers no cheap, reliable way to read an
 *      account's Workers plan with wrangler's login, so the owner says it once.
 *  12. the Studio build: running from the monorepo, the admin Worker gets `apps/studio/dist`, which
 *      only a build keeps current. When it is missing or older than the newest file in
 *      `apps/studio/src`, `apps/studio/index.html` or `packages/ui/src`, the deploy runs
 *      `pnpm --filter @cloudhal/studio build` first; `--no-build-studio` fails instead. A published
 *      install ships Studio prebuilt and is never checked.
 *  13. Workers Builds (`WORKERS_CI=1`, the Deploy to Cloudflare button): names from the committed
 *      `wrangler.jsonc`, the starter seeded when the checkout has none, secrets kept on the Workers
 *      and no setup link printed (`deploy/workers-builds.ts`, docs/guides/deploy-button.md).
 *
 *  14. `--release` (RFC-0046 §11b, `deploy/release/`): instead of building, installs the signed
 *      release of this CLI's version: the signed key and yank lists, the theme and config checks,
 *      the verified bundle and its attestation, then the same provisioning, secrets, guard and push.
 *
 * `--dry-run` runs everything up to wrangler's own `--dry-run` (bundles, configs) and skips
 * provisioning, deployment and push — no Cloudflare account needed.
 */

import path from "node:path";
import { prepareAdminWorker } from "../cloudflare/admin.ts";
import type { SchedulerTicker } from "../cloudflare/config.ts";
import { must } from "../cloudflare/wrangler.ts";
import { readProjectConfig } from "../config.ts";
import { deployAttached } from "./deploy/attach.ts";
import { deploySecrets, finishDeploy } from "./deploy/finish.ts";
import type { DeployOptions, DeployResult } from "./deploy/options.ts";
import {
  analyticsAndComments,
  buildSite,
  checkOptions,
  deploySettings,
  loadDeploy,
  provision,
  studioDirFor,
} from "./deploy/prepare.ts";
import { deployRelease } from "./deploy/release/index.ts";
import { downgradeGuard } from "./deploy/schedules-guard.ts";
import { attachedWorkers } from "./deploy/served-sites.ts";
import { commentsResult } from "./deploy/settings.ts";
import { shipWorkers } from "./deploy/ship.ts";
import { resolveSkillsDir } from "./mcp.ts";

export type { DeployOptions, DeployResult } from "./deploy/options.ts";
export { BUNDLE_LIFECYCLE_DAYS, BUNDLE_LIFECYCLE_RULE } from "./deploy/resources.ts";
export {
  CRON_REFUSED_MESSAGE,
  projectSchedulesLevel,
  type SchedulesStatus,
} from "./deploy/schedules-guard.ts";
export {
  commentsRateLimitDeployment,
  DEFAULT_QUERY_BUDGET,
  observabilityOf,
  rateLimitDeployment,
} from "./deploy/settings.ts";
export {
  type DeploySecrets,
  type DeployState,
  deployDir,
  type Jurisdiction,
  loadOrCreateSecrets,
  readDeployState,
  SECRET_KEYS,
} from "./deploy/state.ts";

export async function deploy(options: DeployOptions): Promise<DeployResult> {
  checkOptions(options);
  // RFC-0046 §11b: the signed release of this CLI's version instead of a build.
  if (options.release) return deployRelease(options);
  // RFC-0034 §4: a site Worker that joins another installation deploys only itself.
  if ((await readProjectConfig(options.projectDir)).installation) return deployAttached(options);
  const ctx = await loadDeploy(options);
  const { cfg, log, previous, names } = ctx;
  const { analytics, comments } = await analyticsAndComments(ctx);
  const studioDir = await studioDirFor(ctx);
  const { withIds, databaseCreated } = await provision(ctx);
  // 2. secrets (Workers Builds: kept on the Workers); 2b. RFC-0008: never deploy code that
  // ignores holds and gates over open releases
  const secrets = await deploySecrets(ctx);
  if (!options.dryRun && previous?.adminUrl && !ctx.workersBuilds)
    await downgradeGuard(
      options,
      { adminUrl: previous.adminUrl, token: secrets.known.CLOUDHAL_DEPLOY_TOKEN as string },
      log,
    );
  const settings = await deploySettings(ctx);
  const { plan, schedules, observability } = settings;
  const site = await buildSite(ctx, { withIds, analytics, comments, observability });

  // 4. admin Worker, bound to every site Worker attached to this installation (RFC-0034 §4)
  const skillsDir = await resolveSkillsDir(options.projectDir);
  const siteWorkers = await attachedWorkers(ctx);
  const prepareAdmin = (ticker: SchedulerTicker) =>
    prepareAdminWorker({
      projectDir: options.projectDir,
      dataDir: cfg.dataDir,
      names: withIds,
      siteId: cfg.siteId,
      ...(cfg.sites ? { siteIds: cfg.sites } : {}),
      siteWorkers,
      studioDir,
      skillsDir,
      blockTypes: site.blockTypes,
      themeSettings: site.themeSettings,
      themeDesign: site.themeDesign,
      domain: cfg.domains?.studio,
      analytics,
      comments,
      scheduler: ticker,
      schedules,
      mail: cfg.mail,
      ai: Boolean(cfg.ai),
      browser: cfg.render !== false,
      observability,
      placement: cfg.placement,
    });
  const admin = await prepareAdmin(settings.scheduler);

  if (options.dryRun) {
    await must(
      ctx.run,
      ["deploy", "--dry-run", "--outdir", path.join(ctx.dir, "out/site")],
      options.projectDir,
    );
    await must(
      ctx.run,
      ["deploy", "-c", admin.configPath, "--dry-run", "--outdir", path.join(ctx.dir, "out/admin")],
      admin.dir,
    );
    log("dry run complete: bundles in .cloudhal/deploy/out");
    return {
      dryRun: true,
      names,
      siteConfig: site.siteConfig,
      adminConfig: admin.configPath,
      scheduler: settings.scheduler,
      schedules,
      analytics: analytics
        ? { enabled: true, dataset: analytics.dataset, cron: settings.scheduler === "cron" }
        : { enabled: false },
      comments: commentsResult(comments, settings.scheduler),
    };
  }

  const shipped = await shipWorkers(ctx, {
    siteSecrets: secrets.site,
    adminSecrets: secrets.admin,
    admin,
    prepareAdmin,
    scheduler: settings.scheduler,
  });
  return finishDeploy(ctx, {
    shipped,
    known: secrets.known,
    analytics,
    comments,
    databaseCreated,
    plan,
    schedules,
    siteConfig: site.siteConfig,
    adminConfig: admin.configPath,
  });
}
