/**
 * `cloudhal deploy` in a project with `cloudhal.json` `installation` (RFC-0034 §4): a site Worker
 * for another theme that joins an existing installation instead of creating one.
 *
 * - It binds the installation's D1 database, R2 bucket and analytics dataset (its names derive
 *   from the installation's deployment name) and takes the installation's preview, purge, comments
 *   and deployment secrets, so previews, purges and comments work across both Workers.
 * - Only the site Worker is deployed (`<installation>-site-<slug>`); the installation's Studio
 *   stays where it is. The served sites must exist on the installation and use this theme.
 * - It registers itself (`PUT /api/admin/site-workers/:name`). The installation's next
 *   `cloudhal deploy` binds it to the admin Worker, which from then on sends these sites' purges
 *   here; until then they go to the installation's own site Worker.
 */
import { chmod, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { readExistingIds, SITE_CONFIG_FILE, workerNames } from "../../cloudflare/config.ts";
import { deployedUrls, must } from "../../cloudflare/wrangler.ts";
import { readProjectConfig } from "../../config.ts";
import { pushSite } from "../sync.ts";
import type { DeployContext } from "./context.ts";
import type { DeployOptions, DeployResult } from "./options.ts";
import { analyticsAndComments, buildSite, deploySettings, loadDeploy } from "./prepare.ts";
import { deployDir, loadOrCreateSecrets, readDeployState, writeDeployState } from "./state.ts";

/** The secrets an attached site Worker shares with its installation. */
const SHARED = [
  "CLOUDHAL_PREVIEW_SECRET",
  "CLOUDHAL_PURGE_TOKEN",
  "CLOUDHAL_COMMENTS_KEY",
  "CLOUDHAL_DEPLOY_TOKEN",
] as const;

async function installationOf(projectDir: string, folder: string) {
  const dir = path.resolve(projectDir, folder);
  const cfg = await readProjectConfig(dir).catch(() => {
    throw new Error(`cloudhal.json installation: no Cloudhal project in ${dir}`);
  });
  const state = await readDeployState(dir, cfg.dataDir);
  if (!state?.adminUrl)
    throw new Error(
      `cloudhal.json installation: ${dir} is not deployed yet (run \`cloudhal deploy\` there first)`,
    );
  const secrets = JSON.parse(
    await readFile(path.join(deployDir(dir, cfg.dataDir), "secrets.json"), "utf8"),
  ) as Record<string, string>;
  const { databaseId } = await readExistingIds(path.join(dir, SITE_CONFIG_FILE));
  if (!databaseId) throw new Error(`cloudhal.json installation: no D1 database id in ${dir}`);
  return { dir, cfg, state: { ...state, adminUrl: state.adminUrl }, secrets, databaseId };
}

export async function deployAttached(options: DeployOptions): Promise<DeployResult> {
  const own = await readProjectConfig(options.projectDir);
  const inst = await installationOf(options.projectDir, own.installation as string);
  const loaded = await loadDeploy({ ...options, name: inst.state.name });
  const base = { ...loaded.base, siteName: `${inst.state.name}-site-${loaded.site.slug}` };
  const previous = {
    ...(loaded.previous ?? inst.state),
    name: inst.state.name,
    adminUrl: inst.state.adminUrl,
  };
  const ctx: DeployContext = { ...loaded, base, names: workerNames(base), previous };
  const { cfg, log, names } = ctx;
  log(`joining the installation ${inst.state.name} (${inst.dir}) as ${names.site}`);

  // The installation's secrets, kept here too so remote commands (push, pull) reach it.
  const secrets = await loadOrCreateSecrets(ctx.dir);
  for (const key of SHARED) if (inst.secrets[key]) secrets[key] = inst.secrets[key];
  const secretsFile = path.join(ctx.dir, "secrets.json");
  await writeFile(secretsFile, `${JSON.stringify(secrets, null, 2)}\n`, { mode: 0o600 });
  await chmod(secretsFile, 0o600);

  const { analytics, comments } = await analyticsAndComments(ctx);
  const { observability, scheduler, schedules, plan } = await deploySettings(ctx);
  const withIds = { ...base, databaseId: inst.databaseId };
  const site = await buildSite(ctx, { withIds, analytics, comments, observability });
  const result = {
    names,
    siteConfig: site.siteConfig,
    adminConfig: "",
    scheduler,
    schedules,
    analytics: analytics ? { enabled: true, dataset: analytics.dataset } : { enabled: false },
    comments: { available: comments.available },
  };
  if (options.dryRun) {
    await must(
      ctx.run,
      ["deploy", "--dry-run", "--outdir", path.join(ctx.dir, "out/site")],
      options.projectDir,
    );
    log("dry run complete: the site Worker's bundle is in .cloudhal/deploy/out");
    return { dryRun: true, ...result };
  }

  const siteSecrets = path.join(ctx.dir, "site-secrets.json");
  let siteUrl: string | undefined;
  try {
    await writeFile(
      siteSecrets,
      JSON.stringify({
        CLOUDHAL_PREVIEW_SECRET: secrets.CLOUDHAL_PREVIEW_SECRET,
        CLOUDHAL_PURGE_TOKEN: secrets.CLOUDHAL_PURGE_TOKEN,
        CLOUDHAL_COMMENTS_KEY: secrets.CLOUDHAL_COMMENTS_KEY,
      }),
      { mode: 0o600 },
    );
    log(`deploying ${names.site}`);
    const deployed = await must(
      ctx.run,
      ["deploy", "--secrets-file", siteSecrets],
      options.projectDir,
    );
    siteUrl = deployedUrls(deployed.records)[0];
  } finally {
    await rm(siteSecrets, { force: true });
  }
  await writeDeployState(options.projectDir, cfg.dataDir, {
    name: inst.state.name,
    adminUrl: inst.state.adminUrl,
    ...(siteUrl ? { siteUrl } : {}),
    deployedAt: new Date().toISOString(),
    analytics: analytics ? "on" : "off",
    comments: comments.available ? "on" : "off",
    scheduler,
    plan,
  });
  // This project's own site joins the installation if it is not there yet.
  const { pushed } = await pushSite({
    projectDir: options.projectDir,
    adminUrl: inst.state.adminUrl,
    ifAbsent: true,
    ...(options.fetch ? { fetch: options.fetch } : {}),
    log,
  });
  await register(ctx, {
    adminUrl: inst.state.adminUrl,
    token: secrets.CLOUDHAL_DEPLOY_TOKEN,
    siteUrl,
  });
  log(
    `run \`cloudhal deploy\` in ${inst.dir} once, so the installation's Studio sends these sites' cache purges to ${names.site}`,
  );
  return {
    dryRun: false,
    ...result,
    ...(siteUrl ? { siteUrl } : {}),
    adminUrl: inst.state.adminUrl,
    pushed,
  };
}

async function register(
  ctx: DeployContext,
  input: { adminUrl: string; token: string; siteUrl: string | undefined },
): Promise<void> {
  const { cfg, site, names, options, log } = ctx;
  const f = options.fetch ?? fetch;
  const res = await f(new URL(`/api/admin/site-workers/${names.site}`, input.adminUrl), {
    method: "PUT",
    headers: { authorization: `Bearer ${input.token}`, "content-type": "application/json" },
    body: JSON.stringify({
      url: input.siteUrl ?? `https://${names.site}.workers.dev`,
      theme: site.theme.name,
      siteIds: cfg.sites ?? [cfg.siteId],
    }),
  });
  if (!res.ok)
    throw new Error(
      `registering ${names.site} failed: ${res.status} ${(await res.text()).slice(0, 300)}`,
    );
  log(`registered ${names.site} with the installation`);
}
