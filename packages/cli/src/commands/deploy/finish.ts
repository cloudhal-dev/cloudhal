/**
 * What every `cloudhal deploy` does around shipping the two Workers, built or from a release:
 * the secrets it sets, and after the deploy the state, the first push, the one-time cache purge,
 * the setup link and the result.
 */
import type {
  AnalyticsDeployment,
  CommentsDeployment,
  SchedulerTicker,
  SchedulesDeployment,
  WorkersPlan,
} from "../../cloudflare/config.ts";
import type { DeployContext } from "./context.ts";
import type { DeployResult } from "./options.ts";
import { commentsResult } from "./settings.ts";
import { afterDeploy, purgeIfSwitched } from "./ship.ts";
import {
  type DeploySecrets,
  type Jurisdiction,
  loadOrCreateSecrets,
  SITE_SECRET_KEYS,
  writeDeployState,
} from "./state.ts";
import { buildsSecrets, setupInstructions } from "./workers-builds.ts";

/** What this deploy sets on each Worker, and the values it knows (all of them, outside Workers Builds). */
export async function deploySecrets(ctx: DeployContext): Promise<{
  site: Partial<DeploySecrets>;
  admin: Partial<DeploySecrets>;
  known: Partial<DeploySecrets>;
}> {
  if (ctx.workersBuilds && !ctx.options.dryRun)
    return buildsSecrets(ctx.run, { cwd: ctx.options.projectDir, dir: ctx.dir, names: ctx.names });
  const all = await loadOrCreateSecrets(ctx.dir);
  const site = Object.fromEntries(SITE_SECRET_KEYS.map((k) => [k, all[k]]));
  return { site, admin: all, known: all };
}

export interface Shipped {
  readonly siteUrl: string | undefined;
  readonly adminUrl: string | undefined;
  readonly scheduler: SchedulerTicker;
}

/** State, first push, purge and the result, after both Workers are deployed. */
export async function finishDeploy(
  ctx: DeployContext,
  input: {
    shipped: Shipped;
    known: Partial<DeploySecrets>;
    analytics: AnalyticsDeployment | undefined;
    comments: CommentsDeployment;
    databaseCreated: Jurisdiction | undefined;
    plan: WorkersPlan;
    schedules: SchedulesDeployment;
    siteConfig: string;
    adminConfig: string;
  },
): Promise<DeployResult> {
  const { options, cfg, previous, base, names } = ctx;
  const { siteUrl, adminUrl, scheduler } = input.shipped;
  const { analytics, comments } = input;
  // where the database lives, when a deploy of this deployment name created it
  const jurisdiction =
    input.databaseCreated ?? (previous?.name === base.name ? previous.jurisdiction : undefined);
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
    plan: input.plan,
  });
  const pushed = await afterDeploy(ctx, { siteUrl, adminUrl });
  // Workers Builds knows no previous deploy, nor (after the first) the purge token: no purge
  const purgeToken = input.known.CLOUDHAL_PURGE_TOKEN;
  const { purged, analyticsChanged, commentsChanged } = purgeToken
    ? await purgeIfSwitched(ctx, { siteUrl, analytics, comments, purgeToken })
    : { purged: false, analyticsChanged: false, commentsChanged: false };

  // First deploy: the owner account can only be created through this one-time link.
  const setupToken = input.known.CLOUDHAL_SETUP_TOKEN;
  const first = pushed && adminUrl;
  const setupUrl =
    first && setupToken && !ctx.workersBuilds
      ? `${adminUrl.replace(/\/$/, "")}/login#setup=${setupToken}`
      : undefined;
  const instructions =
    first && ctx.workersBuilds ? setupInstructions(adminUrl, names.admin) : undefined;
  return {
    dryRun: false,
    names,
    siteConfig: input.siteConfig,
    adminConfig: input.adminConfig,
    siteUrl,
    adminUrl,
    pushed,
    ...(setupUrl ? { setupUrl } : {}),
    ...(instructions ? { setupInstructions: instructions } : {}),
    ...(cfg.domains?.site ? { customSiteUrl: `https://${cfg.domains.site}` } : {}),
    ...(cfg.domains?.studio ? { customStudioUrl: `https://${cfg.domains.studio}` } : {}),
    scheduler,
    schedules: input.schedules,
    analytics: analytics
      ? {
          enabled: true,
          dataset: analytics.dataset,
          cron: scheduler === "cron",
          purged: purged && analyticsChanged,
        }
      : { enabled: false, ...(purged && analyticsChanged ? { purged } : {}) },
    comments: commentsResult(comments, scheduler, purged && commentsChanged),
    ...(input.databaseCreated ? { databaseCreated: input.databaseCreated } : {}),
  };
}
