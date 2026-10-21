/**
 * `cloudhal domain` — the custom domains `cloudhal deploy` routes to this project's Workers
 * (Cloudflare Custom Domains: the zone must be in the same Cloudflare account; wrangler creates
 * the DNS record and certificate). Kept in cloudhal.json so the setting travels with the project.
 * The site's own hostname also becomes its primary domain in the local store, so `cloudhal build`
 * writes it into canonical links, the sitemap and feeds before any deploy (#48); `deploy` does the
 * same on the deployment.
 */
import path from "node:path";
import { isHostname, normalizeHostname, withPrimaryDomain } from "@cloudhal/core-ts";
import { openLocalStore } from "@cloudhal/core-ts/local";
import { type ProjectConfig, readProjectConfig, writeProjectConfig } from "../config.ts";

export type DomainTarget = "site" | "studio";

export interface DomainOptions {
  readonly projectDir: string;
  /** Hostnames to set (others stay as they are). */
  readonly set?: { readonly site?: string; readonly studio?: string };
  /** Domains to forget. */
  readonly remove?: readonly DomainTarget[];
}

/** A hostname as typed → normalised, or an error that says why it cannot be used. */
export function checkHostname(input: string): string {
  const host = normalizeHostname(input);
  if (!isHostname(host)) throw new Error(`"${input}" is not a hostname (e.g. news.example.com)`);
  if (host.endsWith(".workers.dev"))
    throw new Error("workers.dev addresses are assigned by Cloudflare; set your own domain here");
  return host;
}

export async function domain(options: DomainOptions): Promise<ProjectConfig["domains"]> {
  const cfg = await readProjectConfig(options.projectDir);
  const next: { site?: string; studio?: string } = { ...cfg.domains };
  for (const target of options.remove ?? []) delete next[target];
  if (options.set?.site) next.site = checkHostname(options.set.site);
  if (options.set?.studio) next.studio = checkHostname(options.set.studio);
  if (next.site && next.site === next.studio)
    throw new Error("the site and Studio need different hostnames");
  if (options.set || options.remove) {
    const { domains: _old, ...rest } = cfg;
    await writeProjectConfig(options.projectDir, {
      ...rest,
      ...(next.site || next.studio ? { domains: next } : {}),
    });
  }
  if (next.site && options.set?.site) await makePrimary(options.projectDir, cfg, next.site);
  return next.site || next.studio ? next : undefined;
}

/** `hostname` becomes the local site's primary domain (other domains stay, as secondary). */
async function makePrimary(projectDir: string, cfg: ProjectConfig, hostname: string) {
  const local = await openLocalStore(path.join(projectDir, cfg.dataDir));
  try {
    const site = await local.store.getSite(cfg.siteId);
    if (site && site.domains.find((d) => d.primary)?.hostname !== hostname)
      await local.store.updateSite({ ...site, domains: withPrimaryDomain(site.domains, hostname) });
  } finally {
    await local.close();
  }
}
