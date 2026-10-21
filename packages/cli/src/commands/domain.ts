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

export type DomainTarget = "site" | "studio" | "redirects";

export interface DomainOptions {
  readonly projectDir: string;
  /**
   * Hostnames to set (others stay as they are). `redirects` replaces the list of hosts that
   * answer with a 301 to the site's domain (#49).
   */
  readonly set?: {
    readonly site?: string;
    readonly studio?: string;
    readonly redirects?: readonly string[];
  };
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
  const next: { site?: string; studio?: string; redirects?: readonly string[] } = {
    ...cfg.domains,
  };
  for (const target of options.remove ?? []) delete next[target];
  // redirects go to the site's domain: without it they have nowhere to go
  if (options.remove?.includes("site")) delete next.redirects;
  if (options.set?.site) next.site = checkHostname(options.set.site);
  if (options.set?.studio) next.studio = checkHostname(options.set.studio);
  if (options.set?.redirects)
    next.redirects = [...new Set(options.set.redirects.map(checkHostname))];
  if (next.site && next.site === next.studio)
    throw new Error("the site and Studio need different hostnames");
  checkRedirects(next);
  if (!next.redirects?.length) delete next.redirects;
  const any = next.site || next.studio || next.redirects;
  if (options.set || options.remove) {
    const { domains: _old, ...rest } = cfg;
    await writeProjectConfig(options.projectDir, { ...rest, ...(any ? { domains: next } : {}) });
  }
  if (next.site && options.set?.site) await makePrimary(options.projectDir, cfg, next.site);
  return any ? next : undefined;
}

/** Redirect hosts need a site domain to go to, and are neither it nor Studio's. */
function checkRedirects(d: { site?: string; studio?: string; redirects?: readonly string[] }) {
  if (!d.redirects?.length) return;
  if (!d.site)
    throw new Error("redirects need the site's own domain: cloudhal domain set <hostname>");
  for (const host of d.redirects)
    if (host === d.site || host === d.studio)
      throw new Error(`${host} is already the site's or Studio's domain; it cannot redirect`);
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
