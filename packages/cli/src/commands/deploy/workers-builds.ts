/**
 * `cloudhal deploy` inside Cloudflare Workers Builds (`WORKERS_CI=1`), which the Deploy to
 * Cloudflare button sets up (docs/guides/deploy-button.md). Every build starts from a fresh clone:
 * no local store, no `secrets.json`, no `state.json`. So:
 *
 * - names: the committed `wrangler.jsonc` is the button's — the Worker it connected (which
 *   Workers Builds requires the config to name) and the D1 database and R2 bucket it provisioned,
 *   possibly renamed by the person who clicked. The deployment takes those names; the admin Worker
 *   is `<base>-admin`, where `<base>` is the site Worker's name without `-site`.
 * - the site: when the local store lacks `cloudhal.json`'s `siteId`, the starter site is seeded
 *   under that id. Only the first deploy pushes it; afterwards the deployment is the source of
 *   truth, as always.
 * - secrets: they live only on the Workers. A secret either Worker already has is kept (wrangler
 *   keeps every secret a deploy does not set); a missing one is generated and set. The secrets
 *   both Workers share are set together, so they never differ. The deployment token, which only
 *   this deploy uses, is new on every build.
 * - the setup link is never printed (build logs are kept): the owner sets their own setup token
 *   on the admin Worker and opens the link themselves.
 */
import { chmod, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { openLocalStore } from "@cloudhal/core-ts/local";
import type { DeploymentNames, workerNames } from "../../cloudflare/config.ts";
import type { WranglerRunner } from "../../cloudflare/wrangler.ts";
import type { ProjectConfig } from "../../config.ts";
import { seedProjectSite } from "../../seed-site.ts";
import { type DeploySecrets, randomSecret, SECRET_KEYS, SITE_SECRET_KEYS } from "./state.ts";

/** Whether this deploy runs in Workers Builds (`WORKERS_CI=1`, set by Cloudflare). */
export const inWorkersBuilds = (flag: boolean | undefined): boolean =>
  flag ?? process.env.WORKERS_CI === "1";

/** A placeholder D1 id a template commits before the button provisions the real database. */
const PLACEHOLDER_ID = /^0{8}-0{4}-0{4}-0{4}-0{12}$/;

/** The committed `wrangler.jsonc`'s names, read before this deploy rewrites it. */
export async function committedNames(file: string): Promise<Omit<DeploymentNames, "search">> {
  let cfg: {
    name?: string;
    d1_databases?: { binding?: string; database_name?: string; database_id?: string }[];
    r2_buckets?: { binding?: string; bucket_name?: string }[];
  };
  try {
    cfg = JSON.parse((await readFile(file, "utf8")).replace(/^\s*\/\/.*$/gm, ""));
  } catch {
    throw new Error(
      `Workers Builds: ${path.basename(file)} is missing or not JSON; it must name the site Worker, its D1 database and R2 bucket (docs/guides/deploy-button.md)`,
    );
  }
  if (!cfg.name) throw new Error(`Workers Builds: ${path.basename(file)} has no "name"`);
  const db = cfg.d1_databases?.find((d) => d.binding === "DB");
  const bucket = cfg.r2_buckets?.find((b) => b.binding === "BLOBS");
  const base = cfg.name.replace(/-site$/, "") || cfg.name;
  return {
    name: base,
    ...(cfg.name !== `${base}-site` ? { siteName: cfg.name } : {}),
    ...(db?.database_name ? { databaseName: db.database_name } : {}),
    ...(db?.database_id && !PLACEHOLDER_ID.test(db.database_id)
      ? { databaseId: db.database_id }
      : {}),
    ...(bucket?.bucket_name ? { bucketName: bucket.bucket_name } : {}),
  };
}

/** Seeds the starter site under `cloudhal.json`'s `siteId` when this checkout has none. */
export async function seedIfMissing(
  projectDir: string,
  cfg: ProjectConfig,
  name: string,
  log: (line: string) => void,
): Promise<void> {
  const local = await openLocalStore(path.join(projectDir, cfg.dataDir));
  const site = await local.store.getSite(cfg.siteId);
  await local.close();
  if (site) return;
  await seedProjectSite(projectDir, { dataDir: cfg.dataDir, name, slug: name, siteId: cfg.siteId });
  log(
    `Workers Builds: seeded the starter site ${cfg.siteId}; it is pushed only if the deployment does not have it yet`,
  );
}

async function secretNames(run: WranglerRunner, worker: string, cwd: string): Promise<Set<string>> {
  const r = await run(["secret", "list", "--name", worker, "--format", "json"], {
    cwd,
    quiet: true,
  });
  if (r.code !== 0) {
    // A Worker that does not exist yet has no secrets; any other failure must stop the deploy,
    // or the secrets would be replaced and what they encrypt lost.
    if (/not found|10007/i.test(r.stderr + r.stdout)) return new Set();
    throw new Error(
      `Workers Builds: could not list the secrets of ${worker}:\n${(r.stderr || r.stdout).slice(-2000)}`,
    );
  }
  try {
    return new Set((JSON.parse(r.stdout) as { name: string }[]).map((s) => s.name));
  } catch {
    throw new Error(`Workers Builds: could not read the secret list of ${worker}`);
  }
}

export interface BuildsSecrets {
  /** What this deploy sets on each Worker; everything else the Workers keep. */
  readonly site: Partial<DeploySecrets>;
  readonly admin: Partial<DeploySecrets>;
  /** Every value this deploy knows (always the new deployment token). */
  readonly known: Partial<DeploySecrets> & { CLOUDHAL_DEPLOY_TOKEN: string };
}

/**
 * The secrets to set: the missing ones and a new deployment token, written to the checkout's
 * `secrets.json` (0600, gone with the build) for `cloudhal push`.
 */
export async function buildsSecrets(
  run: WranglerRunner,
  input: { cwd: string; dir: string; names: ReturnType<typeof workerNames> },
): Promise<BuildsSecrets> {
  const site = await secretNames(run, input.names.site, input.cwd);
  const admin = await secretNames(run, input.names.admin, input.cwd);
  const shared: readonly string[] = SITE_SECRET_KEYS;
  const known: Partial<DeploySecrets> & { CLOUDHAL_DEPLOY_TOKEN: string } = {
    CLOUDHAL_DEPLOY_TOKEN: randomSecret(),
  };
  for (const key of SECRET_KEYS) {
    const missing = shared.includes(key) ? !site.has(key) || !admin.has(key) : !admin.has(key);
    if (missing && !known[key]) known[key] = randomSecret();
  }
  const pick = (keys: readonly string[]) =>
    Object.fromEntries(Object.entries(known).filter(([k]) => keys.includes(k)));
  const file = path.join(input.dir, "secrets.json");
  await writeFile(file, `${JSON.stringify(known, null, 2)}\n`, { mode: 0o600 });
  await chmod(file, 0o600);
  return { site: pick(shared), admin: known, known };
}

/** What the owner does once, instead of a printed setup link. */
export function setupInstructions(adminUrl: string, adminWorker: string): string {
  const login = `${adminUrl.replace(/\/$/, "")}/login#setup=`;
  return [
    "Create the owner account (once). The setup link is not printed, because build logs are kept:",
    `  1. Cloudflare dashboard › Workers & Pages › ${adminWorker} › Settings › Variables and Secrets:`,
    "     edit CLOUDHAL_SETUP_TOKEN and set a random value of your own (32 characters or more),",
    `     or run \`npx wrangler secret put CLOUDHAL_SETUP_TOKEN --name ${adminWorker}\``,
    `  2. open ${login}<that value>`,
  ].join("\n");
}
