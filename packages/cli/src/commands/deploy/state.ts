/** Deploy secrets (generated once per project) and the last deploy's state under `.cloudhal/deploy`. */
import { access, chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SchedulerTicker, WorkersPlan } from "../../cloudflare/config.ts";

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
/** The secrets the site Worker has too, with the same values as the admin Worker's. */
export const SITE_SECRET_KEYS = [
  "CLOUDHAL_PREVIEW_SECRET",
  "CLOUDHAL_PURGE_TOKEN",
  "CLOUDHAL_COMMENTS_KEY",
] as const satisfies readonly (typeof SECRET_KEYS)[number][];

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
  /** The Workers plan the tick budget was sized for (`--plan`, RFC-0008 §8.2). */
  plan?: WorkersPlan;
}

/** D1 data location (RFC-0007 D7): `auto` (Cloudflare picks) or the EU jurisdiction. */
export type Jurisdiction = "auto" | "eu";

export async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export const deployDir = (projectDir: string, dataDir: string) =>
  path.join(projectDir, dataDir, "deploy");

export function randomSecret(): string {
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

export async function writeDeployState(projectDir: string, dataDir: string, state: DeployState) {
  await writeFile(
    path.join(deployDir(projectDir, dataDir), "state.json"),
    `${JSON.stringify(state, null, 2)}\n`,
  );
}
