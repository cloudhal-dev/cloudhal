/**
 * The phases of `cloudhal deploy` that change Cloudflare: both Workers (secrets through files that
 * exist only while wrangler runs), the first push and the site's domains, the one-time cache purge.
 */
import { chmod, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { openLocalStore } from "@cloudhal/core-ts/local";
import type { prepareAdminWorker } from "../../cloudflare/admin.ts";
import type {
  AnalyticsDeployment,
  CommentsDeployment,
  SchedulerTicker,
} from "../../cloudflare/config.ts";
import { deployedUrls, isCronLimitError, must, WranglerError } from "../../cloudflare/wrangler.ts";
import { pushSite, setPrimaryDomain } from "../sync.ts";
import type { DeployContext } from "./context.ts";
import { purgeSite, waitForHealth } from "./resources.ts";
import { CRON_REFUSED_MESSAGE } from "./schedules-guard.ts";
import type { DeploySecrets } from "./state.ts";

type PreparedAdmin = Awaited<ReturnType<typeof prepareAdminWorker>>;

/**
 * `wrangler deploy` for the site Worker, then the admin Worker. When Cloudflare refuses the cron
 * trigger (RFC-0008 §8.3: Workers Free allows 5 per account), the same Worker goes without it and
 * the SchedulerClock alarm ticks instead.
 */
export async function shipWorkers(
  ctx: DeployContext,
  input: {
    secrets: DeploySecrets;
    admin: PreparedAdmin;
    prepareAdmin: (ticker: SchedulerTicker) => Promise<PreparedAdmin>;
    scheduler: SchedulerTicker;
  },
): Promise<{
  siteUrl: string | undefined;
  adminUrl: string | undefined;
  scheduler: SchedulerTicker;
}> {
  const { options, run, names, log, dir } = ctx;
  const { secrets, admin } = input;
  let scheduler = input.scheduler;
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
      log(CRON_REFUSED_MESSAGE);
      scheduler = "alarm";
      await input.prepareAdmin(scheduler);
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
  return {
    siteUrl: deployedUrls(siteDeploy.records)[0],
    adminUrl: deployedUrls(adminDeploy.records)[0],
    scheduler,
  };
}

/**
 * 5. first deploy: push the local site, and make the site's hostname primary (the custom domain
 * when there is one). Returns whether the site was pushed.
 */
export async function afterDeploy(
  ctx: DeployContext,
  { siteUrl, adminUrl }: { siteUrl: string | undefined; adminUrl: string | undefined },
): Promise<boolean> {
  const { options, cfg, site, previous, log } = ctx;
  if (!adminUrl) return false;
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
  return result.pushed;
}

/**
 * Analytics switched on (or off): purge the site's cache once, so cached pages gain (or lose)
 * the script tag. The admin Worker ran migration 0014 on the health check; until it has, the Site
 * Worker counts analytics as off (fail closed). Comments availability likewise (RFC-0007): pages
 * cached before carry no `cloudhal-comments-<id>` tag, so a site turning comments on later could
 * not reach them.
 */
export async function purgeIfSwitched(
  ctx: DeployContext,
  input: {
    siteUrl: string | undefined;
    analytics: AnalyticsDeployment | undefined;
    comments: CommentsDeployment;
    purgeToken: string;
  },
): Promise<{ purged: boolean; analyticsChanged: boolean; commentsChanged: boolean }> {
  const { previous, options, log } = ctx;
  const { siteUrl, analytics, comments } = input;
  let purged = false;
  const analyticsChanged = (previous?.analytics ?? "off") !== (analytics ? "on" : "off");
  const commentsChanged = (previous?.comments ?? "off") !== (comments.available ? "on" : "off");
  if (siteUrl && (analyticsChanged || commentsChanged)) {
    purged = await purgeSite(siteUrl, input.purgeToken, options.fetch ?? fetch, log);
    const what = [
      ...(analyticsChanged ? [`analytics ${analytics ? "on" : "off"}`] : []),
      ...(commentsChanged ? [`comments ${comments.available ? "available" : "unavailable"}`] : []),
    ];
    if (purged) log(`${what.join(", ")}: purged the site cache`);
  }
  return { purged, analyticsChanged, commentsChanged };
}
