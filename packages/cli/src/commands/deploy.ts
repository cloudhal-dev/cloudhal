/**
 * `cloudhal deploy` — puts the project on Cloudflare (ADR-0012):
 *
 *   1. D1 database + R2 bucket (created if missing; ids recorded in the wrangler configs)
 *   2. secrets generated once into `<dataDir>/deploy/secrets.json` (0600, never committed)
 *   3. site Worker: `astro build` for the cloudflare target, `wrangler deploy`
 *   4. admin Worker: generated entry + bundled skills + built Studio, `wrangler deploy`
 *   5. push: the local site (graph, snapshots, blobs) through the admin API — first deploy only;
 *      afterwards the deployment is the source of truth (use `cloudhal pull`).
 *
 * `--dry-run` runs everything up to wrangler's own `--dry-run` (bundles, configs) and skips
 * provisioning, deployment and push — no Cloudflare account needed.
 */
import { access, chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { openLocalStore } from "@cloudhal/core-ts/local";
import { assetDir } from "../assets.ts";
import { prepareAdminWorker } from "../cloudflare/admin.ts";
import { buildSiteWorker } from "../cloudflare/build.ts";
import {
  type DeploymentNames,
  readExistingIds,
  siteConfigPath,
  siteWorkerConfig,
  workerNames,
  writeWranglerConfig,
} from "../cloudflare/config.ts";
import { deployedUrls, must, type WranglerRunner, wranglerRunner } from "../cloudflare/wrangler.ts";
import { readProjectConfig } from "../config.ts";
import { resolveSkillsDir } from "./mcp.ts";
import { pushSite } from "./sync.ts";

export const SECRET_KEYS = [
  "BETTER_AUTH_SECRET",
  "MCP_STATE_KEY",
  "CLOUDHAL_PREVIEW_SECRET",
  "CLOUDHAL_PURGE_TOKEN",
  "CLOUDHAL_DEPLOY_TOKEN",
] as const;
export type DeploySecrets = Record<(typeof SECRET_KEYS)[number], string>;

export interface DeployState {
  name: string;
  adminUrl?: string;
  siteUrl?: string;
  deployedAt?: string;
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
) {
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
  if (!databaseId) {
    log(`creating D1 database ${names.database}`);
    await must(run, ["d1", "create", names.database], cwd);
    databaseId = await info();
    if (!databaseId) throw new Error(`could not read the id of D1 database ${names.database}`);
  }
  const bucket = await run(["r2", "bucket", "create", names.bucket], { cwd });
  if (bucket.code !== 0 && !/already exists|already own/i.test(bucket.stderr + bucket.stdout))
    throw new Error(`could not create R2 bucket ${names.bucket}:\n${bucket.stderr.slice(-2000)}`);
  return databaseId;
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
}

export async function deploy(options: DeployOptions): Promise<DeployResult> {
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
  const base: DeploymentNames = { name: options.name ?? previous?.name ?? site.slug };
  const names = workerNames(base);

  const studioDir = options.studioDir ?? (await assetDir("studio")) ?? "(no built Studio)";
  if (!(await exists(path.join(studioDir, "index.html"))))
    throw new Error(
      `built Studio not found at ${studioDir} (run \`pnpm --filter @cloudhal/studio build\`)`,
    );

  // 1. resources
  const existing = await readExistingIds(siteConfigPath(options.projectDir));
  let databaseId = existing.databaseId;
  if (!options.dryRun) databaseId = await ensureResources(run, options.projectDir, names, log);
  const withIds: DeploymentNames = { ...base, ...(databaseId ? { databaseId } : {}) };

  // 2. secrets
  const secrets = await loadOrCreateSecrets(dir);
  const siteSecretsFile = path.join(dir, "site-secrets.json");
  await writeFile(
    siteSecretsFile,
    JSON.stringify({
      CLOUDHAL_PREVIEW_SECRET: secrets.CLOUDHAL_PREVIEW_SECRET,
      CLOUDHAL_PURGE_TOKEN: secrets.CLOUDHAL_PURGE_TOKEN,
    }),
    { mode: 0o600 },
  );
  const adminSecretsFile = path.join(dir, "admin-secrets.json");
  await writeFile(adminSecretsFile, JSON.stringify(secrets), { mode: 0o600 });

  // 3. site Worker
  await writeWranglerConfig(
    siteConfigPath(options.projectDir),
    siteWorkerConfig({ ...withIds, siteId: cfg.siteId }),
    `Cloudhal site Worker for ${site.name}`,
  );
  log("building the site Worker");
  const siteConfig = await buildSiteWorker(options.projectDir, (l) => log(`  ${l}`));

  // 4. admin Worker
  const admin = await prepareAdminWorker({
    projectDir: options.projectDir,
    dataDir: cfg.dataDir,
    names: withIds,
    studioDir,
    skillsDir: await resolveSkillsDir(options.projectDir),
  });

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
    return { dryRun: true, names, siteConfig, adminConfig: admin.configPath };
  }

  log(`deploying ${names.site}`);
  const siteDeploy = await must(
    run,
    ["deploy", "--secrets-file", siteSecretsFile],
    options.projectDir,
  );
  const siteUrl = deployedUrls(siteDeploy.records)[0];
  log(`deploying ${names.admin}`);
  const adminDeploy = await must(
    run,
    ["deploy", "-c", admin.configPath, "--secrets-file", adminSecretsFile],
    admin.dir,
  );
  const adminUrl = deployedUrls(adminDeploy.records)[0];
  await writeDeployState(options.projectDir, cfg.dataDir, {
    name: base.name,
    ...(adminUrl ? { adminUrl } : {}),
    ...(siteUrl ? { siteUrl } : {}),
    deployedAt: new Date().toISOString(),
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
  }
  return {
    dryRun: false,
    names,
    siteConfig,
    adminConfig: admin.configPath,
    siteUrl,
    adminUrl,
    pushed,
  };
}
