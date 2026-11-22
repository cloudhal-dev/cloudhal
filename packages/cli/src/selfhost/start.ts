/**
 * RFC-0047 §5: `cloudhal selfhost start`, the image's entrypoint.
 *
 *   1. read the settings (secrets through `_FILE`) and refuse to start without one;
 *   2. refuse a volume of the Node image (`cloudhal.json` and no v2 marker);
 *   3. check the bundle's files against its manifest;
 *   4. write the workerd config (0600, in the run directory) and start workerd, passing SIGTERM
 *      and SIGINT on once, so its cluster handoff runs, and exiting with its code;
 *   5. once `/api/health` answers, create the installation's site under `CLOUDHAL_SITE_ID` unless
 *      it exists (every instance tries; the id makes it idempotent), and print the setup link.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { checkBundle } from "./bundle.ts";
import { type Env, readSettings, resolveSecretFiles, type SelfhostSettings } from "./settings.ts";
import { workerdConfig } from "./workerd-config.ts";

/** Written into the data directory at the first start of a v2 volume. */
export const V2_MARKER = ".selfhost";

export const NODE_VOLUME =
  "this volume holds a project of the Node self-host image (0.10.x or older), which the workerd image cannot open. Export it with the old image (`docker run --rm -v <volume>:/data ghcr.io/cloudhal-dev/cloudhal:0.10 cloudhal export --out /data/site.cloudhal`), start the new image on a new volume, then `cloudhal import` that archive.";

/** Step 2: throws on a Node-layout volume; marks a new one as v2. */
export async function claimDataDir(dataDir: string, version: string): Promise<void> {
  const marker = path.join(dataDir, V2_MARKER);
  if (!existsSync(marker) && existsSync(path.join(dataDir, "cloudhal.json")))
    throw new Error(NODE_VOLUME);
  await mkdir(marker, { recursive: true });
  await writeFile(path.join(marker, "first-version"), `${version}\n`, { flag: "a" }).catch(
    () => {},
  );
  await mkdir(path.join(dataDir, "do"), { recursive: true });
}

export interface FirstSiteInput {
  readonly settings: SelfhostSettings;
  readonly deployToken: string;
  readonly fetch?: typeof fetch;
  readonly log: (line: string) => void;
  /** Give up after this long (default 180 s). */
  readonly timeoutMs?: number;
  readonly sleep?: (ms: number) => Promise<void>;
}

const slugOf = (name: string) =>
  name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .split("-")
    .filter(Boolean)
    .join("-")
    .slice(0, 60) || "site";

/** Step 5: `true` when this call created the site. */
export async function ensureFirstSite(input: FirstSiteInput): Promise<boolean> {
  const { settings: s, log } = input;
  const get = input.fetch ?? fetch;
  const sleep = input.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const origin = `http://127.0.0.1:${s.ports.studio}`;
  const deadline = Date.now() + (input.timeoutMs ?? 180_000);
  for (;;) {
    const ok = await get(`${origin}/api/health`).then(
      (r) => r.ok,
      () => false,
    );
    if (ok) break;
    if (Date.now() > deadline) {
      log("selfhost: Studio did not answer /api/health in time; the first site was not created");
      return false;
    }
    await sleep(2000);
  }
  const auth = { authorization: `Bearer ${input.deployToken}` };
  const listed = await get(`${origin}/api/admin/sites`, { headers: auth });
  if (!listed.ok) throw new Error(`selfhost: listing the sites failed (${listed.status})`);
  const { sites } = (await listed.json()) as { sites: { id: string }[] };
  if (sites.some((x) => x.id === s.siteId)) return false;
  const res = await get(`${origin}/api/admin/sites`, {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({
      id: s.siteId,
      name: s.siteName,
      slug: slugOf(s.siteName),
      locale: "en",
    }),
  });
  if (res.status === 409) return false; // another instance was first
  if (res.status !== 201)
    throw new Error(`selfhost: creating the site failed (${res.status} ${await res.text()})`);
  const base = s.baseUrl ?? `http://localhost:${s.ports.studio}`;
  log(`selfhost: created the site ${s.siteName} (${s.siteId}); nothing is published yet`);
  log(`selfhost: create the Owner account at ${base}/login#setup=<CLOUDHAL_SETUP_TOKEN>`);
  return true;
}

export interface StartOptions {
  readonly bundleDir: string;
  /** Where the config is written (default `/tmp/cloudhal`). */
  readonly runDir?: string;
  /** The workerd binary (default `workerd` on PATH). */
  readonly workerd?: string;
  readonly env?: Env;
  readonly log?: (line: string) => void;
}

/** Steps 1–4, then 5 in the background; resolves to workerd's exit code. */
export async function startSelfhost(o: StartOptions): Promise<number> {
  const log = o.log ?? ((l) => console.log(l));
  const env = resolveSecretFiles(o.env ?? process.env);
  const settings = readSettings(env);
  const manifest = await checkBundle(o.bundleDir);
  await claimDataDir(settings.dataDir, manifest.version);
  const runDir = o.runDir ?? env.CLOUDHAL_RUN_DIR ?? "/tmp/cloudhal";
  await mkdir(runDir, { recursive: true, mode: 0o700 });
  const configFile = path.join(runDir, "workerd.capnp");
  const config = workerdConfig({ manifest, bundleDir: o.bundleDir, configDir: runDir, settings });
  await writeFile(configFile, config, { mode: 0o600 });
  log(
    `selfhost: Cloudhal ${manifest.version}, site ${settings.siteId}, store ${settings.s3.endpoint}`,
  );
  const child = spawn(o.workerd ?? "workerd", ["serve", "--experimental", configFile], {
    stdio: "inherit",
    env: env as NodeJS.ProcessEnv,
  });
  let forwarded = false;
  const forward = (sig: NodeJS.Signals) => () => {
    if (forwarded) return; // one SIGTERM: a second would cut workerd's handoff short
    forwarded = true;
    child.kill(sig);
  };
  process.on("SIGTERM", forward("SIGTERM"));
  process.on("SIGINT", forward("SIGINT"));
  ensureFirstSite({
    settings,
    deployToken: env.CLOUDHAL_DEPLOY_TOKEN as string,
    log,
  }).catch((e: Error) => log(e.message));
  return new Promise((resolve) => {
    child.on("error", (e) => {
      log(`selfhost: cannot start workerd (${e.message})`);
      resolve(1);
    });
    child.on("exit", (code, signal) => resolve(code ?? (signal === "SIGTERM" ? 0 : 1)));
  });
}
