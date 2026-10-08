/**
 * `cloudhal push` / `cloudhal pull`: move the site between the local project and its Cloudflare
 * deployment through the admin Worker (`/api/admin/sites/:id/bundle`, deployment token).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { exportSite, importSite, type SiteBundle, withPrimaryDomain } from "@cloudhal/core-ts";
import { openLocalStore } from "@cloudhal/core-ts/local";
import { readProjectConfig } from "../config.ts";

export interface SyncOptions {
  readonly projectDir: string;
  /** Overwrite diverged content on the receiving side. */
  readonly replace?: boolean;
  /** Admin Worker URL; default from `<dataDir>/deploy/state.json`. */
  readonly adminUrl?: string;
  readonly log?: (line: string) => void;
  /** Injected in tests. */
  readonly fetch?: typeof fetch;
}

/** Error bodies may be HTML pages (e.g. a not-yet-live workers.dev host); keep messages short. */
export function brief(body: string): string {
  const text = body
    .replace(/<style[\s\S]*?<\/style>|<svg[\s\S]*?<\/svg>|<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 300 ? `${text.slice(0, 300)}…` : text;
}

/** The deployment's admin Worker and its operator token (from `cloudhal deploy`'s state). */
export async function deployment(options: SyncOptions) {
  const cfg = await readProjectConfig(options.projectDir);
  const dir = path.join(options.projectDir, cfg.dataDir, "deploy");
  let adminUrl = options.adminUrl;
  if (!adminUrl) {
    try {
      adminUrl = (
        JSON.parse(await readFile(path.join(dir, "state.json"), "utf8")) as { adminUrl?: string }
      ).adminUrl;
    } catch {
      // not deployed
    }
  }
  if (!adminUrl)
    throw new Error("no deployment found: run `cloudhal deploy` first (or pass --admin-url)");
  const secrets = JSON.parse(await readFile(path.join(dir, "secrets.json"), "utf8")) as {
    CLOUDHAL_DEPLOY_TOKEN?: string;
  };
  if (!secrets.CLOUDHAL_DEPLOY_TOKEN)
    throw new Error("deployment token missing in .cloudhal/deploy/secrets.json");
  return { cfg, adminUrl, token: secrets.CLOUDHAL_DEPLOY_TOKEN, fetch: options.fetch ?? fetch };
}

async function target(options: SyncOptions) {
  const { cfg, adminUrl, token, fetch: f } = await deployment(options);
  const url = new URL(`/api/admin/sites/${cfg.siteId}/bundle`, adminUrl);
  return { cfg, url, token, fetch: f };
}

export async function pushSite(
  options: SyncOptions & { ifAbsent?: boolean },
): Promise<{ pushed: boolean; message: string }> {
  const log = options.log ?? (() => {});
  const { cfg, url, token, fetch: f } = await target(options);
  const auth = { authorization: `Bearer ${token}` };
  if (options.ifAbsent) {
    const probe = await f(url, { headers: auth });
    if (probe.status === 200) {
      log(
        "the deployment already has this site; leaving it as the source of truth (use `cloudhal pull`)",
      );
      return { pushed: false, message: "already deployed" };
    }
  }
  const local = await openLocalStore(path.join(options.projectDir, cfg.dataDir));
  const bundle = await exportSite(local, cfg.siteId);
  await local.close();
  url.searchParams.set("mode", options.replace ? "replace" : "bootstrap");
  const res = await f(url, {
    method: "PUT",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify(bundle),
  });
  const body = await res.text();
  if (res.status === 409)
    throw new Error(
      `the deployment has diverged from your local copy: ${brief(body)}\nRun \`cloudhal pull\` first, or \`cloudhal push --replace\` to overwrite.`,
    );
  if (!res.ok) throw new Error(`push failed (${res.status}): ${brief(body)}`);
  log(`pushed: ${body}`);
  return { pushed: true, message: body };
}

/**
 * Makes `hostname` the deployed site's primary domain (preview links, canonical URLs) and mirrors
 * it in the local store. Used by `cloudhal deploy` once a custom domain is routed.
 */
export async function setPrimaryDomain(
  options: SyncOptions & { hostname: string },
): Promise<{ changed: boolean }> {
  const { cfg, url, token, fetch: f } = await target(options);
  const res = await f(new URL(`/api/admin/sites/${cfg.siteId}/domains`, url), {
    method: "PUT",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ primary: options.hostname }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`setting the site's domain failed (${res.status}): ${brief(body)}`);
  const local = await openLocalStore(path.join(options.projectDir, cfg.dataDir));
  try {
    const site = await local.store.getSite(cfg.siteId);
    if (site && site.domains.find((d) => d.primary)?.hostname !== options.hostname)
      await local.store.updateSite({
        ...site,
        domains: withPrimaryDomain(site.domains, options.hostname),
      });
  } finally {
    await local.close();
  }
  return { changed: (JSON.parse(body) as { changed?: boolean }).changed === true };
}

export async function pullSite(options: SyncOptions): Promise<{ message: string }> {
  const log = options.log ?? (() => {});
  const { cfg, url, token, fetch: f } = await target(options);
  const res = await f(url, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`pull failed (${res.status}): ${brief(await res.text())}`);
  const bundle = (await res.json()) as SiteBundle;
  const local = await openLocalStore(path.join(options.projectDir, cfg.dataDir));
  try {
    const result = await importSite(local, bundle, {
      mode: options.replace ? "replace" : "bootstrap",
      log,
    });
    const message = JSON.stringify(result);
    log(`pulled: ${message}`);
    return { message };
  } finally {
    await local.close();
  }
}
