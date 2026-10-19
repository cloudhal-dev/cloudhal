/**
 * RFC-0034 §4–5: the sites a multi-site deployment serves (`cloudhal.json` `sites`). Before the
 * site Worker is built, the deployment is asked for those sites (`GET /api/admin/sites`): each
 * must exist there and be designed for the deployed theme (invariant 6), and every hostname they
 * hold becomes a Custom Domain route. On the first deploy there is no deployment to ask yet: the
 * other sites' routes follow on the next deploy, once they exist.
 */

import { listSites } from "../site.ts";
import { deployment } from "../sync.ts";
import type { DeployContext } from "./context.ts";

export interface ServedSites {
  /** The site ids for `CLOUDHAL_SITE_IDS`; undefined for a single-site deployment. */
  readonly siteIds?: readonly string[];
  /** Hostnames of the served sites besides `domains.site` (workers.dev hosts excluded). */
  readonly hosts: readonly string[];
}

export async function servedSites(ctx: DeployContext): Promise<ServedSites> {
  const { cfg, site, previous, options, log } = ctx;
  if (!cfg.sites) return { hosts: [] };
  if (!previous?.adminUrl) {
    log(
      `sites: serving ${cfg.sites.length} sites by hostname; deploy again after \`cloudhal site create --remote\` to route the others' domains`,
    );
    return { siteIds: cfg.sites, hosts: [] };
  }
  const remote = await listSites({
    projectDir: options.projectDir,
    remote: true,
    adminUrl: previous.adminUrl,
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
  const missing = cfg.sites.filter((id) => id !== cfg.siteId && !remote.some((s) => s.id === id));
  if (missing.length > 0)
    throw new Error(
      `cloudhal.json sites: ${missing.join(", ")} not found on the deployment (create them with \`cloudhal site create --remote\`)`,
    );
  const theme = site.theme.name;
  const other = remote.filter((s) => cfg.sites?.includes(s.id) && s.theme !== theme);
  if (other.length > 0)
    throw new Error(
      `cloudhal.json sites: ${other.map((s) => `${s.slug} (${s.theme})`).join(", ")} use another theme than this Worker's ${theme}; serve them from a site Worker with that theme`,
    );
  const hosts = remote
    .filter((s) => cfg.sites?.includes(s.id))
    .flatMap((s) => s.hosts)
    .filter((h) => !h.endsWith(".workers.dev") && h !== cfg.domains?.site);
  return { siteIds: cfg.sites, hosts: [...new Set(hosts)] };
}

/** A site Worker another project attached to this installation (`/api/admin/site-workers`). */
export interface AttachedWorker {
  readonly name: string;
  readonly url: string;
  readonly theme: string;
  readonly siteIds: readonly string[];
}

/**
 * The site Workers attached to this installation, so the admin Worker gets a service binding to
 * each and routes their sites' purges there (RFC-0034 §4). None before the first deploy, or when
 * the deployment predates the registry.
 */
export async function attachedWorkers(ctx: DeployContext): Promise<AttachedWorker[]> {
  const { previous, options, log } = ctx;
  if (!previous?.adminUrl) return [];
  try {
    const { token, fetch: f } = await deployment({
      projectDir: options.projectDir,
      adminUrl: previous.adminUrl,
      ...(options.fetch ? { fetch: options.fetch } : {}),
    });
    const res = await f(new URL("/api/admin/site-workers", previous.adminUrl), {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    const workers = ((await res.json()) as { workers: AttachedWorker[] }).workers;
    for (const w of workers)
      log(`site Worker ${w.name} (${w.theme}) serves ${w.siteIds.length} site(s): binding it`);
    return workers;
  } catch {
    return [];
  }
}
