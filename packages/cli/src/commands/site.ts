/**
 * `cloudhal site list | create | delete` (RFC-0034 §2–3): the sites of one installation — on the
 * project's SQLite, or with `--remote` on the deployment (deployment token: `/api/admin/sites`).
 * The project's own site (`cloudhal.json` `siteId`) is never deleted from here: its site Worker
 * serves it.
 */
import path from "node:path";
import { createEdition, deleteSiteData, listHosts, seedStarterSite } from "@cloudhal/core-ts";
import { openLocalStore } from "@cloudhal/core-ts/local";
import { readProjectConfig } from "../config.ts";
import { brief, deployment, type SyncOptions } from "./sync.ts";

export interface SiteCliOptions extends SyncOptions {
  /** Talk to the deployment instead of the local SQLite. */
  readonly remote?: boolean;
}

export interface SiteRow {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly projectId: string;
  readonly defaultLocale: string;
  readonly theme: string;
  readonly hosts: readonly string[];
  readonly conflicts: readonly string[];
}

/** What an edition copied and what it left out. */
export interface EditionSummary {
  readonly pages: number;
  readonly menus: number;
  readonly skipped: readonly { readonly what: string; readonly reason: string }[];
}

export interface CreateSiteInput {
  readonly name: string;
  readonly slug: string;
  readonly locale?: string;
  readonly projectId?: string;
  readonly theme?: string;
  /** RFC-0034 §6: start as a language edition of this site. */
  readonly from?: string;
}

async function remote<T>(options: SiteCliOptions, p: string, init: RequestInit = {}): Promise<T> {
  const { adminUrl, token, fetch: f } = await deployment(options);
  const res = await f(new URL(p, adminUrl), {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (res.status === 404 && p === "/api/admin/sites")
    throw new Error("the deployment has no site management yet (deploy this version first)");
  if (!res.ok) throw new Error(`the deployment answered ${res.status}: ${brief(text)}`);
  return JSON.parse(text) as T;
}

async function withLocal<T>(
  projectDir: string,
  fn: (l: Awaited<ReturnType<typeof openLocalStore>>) => Promise<T>,
): Promise<T> {
  const cfg = await readProjectConfig(projectDir);
  const local = await openLocalStore(path.join(projectDir, cfg.dataDir));
  try {
    return await fn(local);
  } finally {
    await local.close();
  }
}

/** `cloudhal site list`. */
export async function listSites(options: SiteCliOptions): Promise<SiteRow[]> {
  if (options.remote)
    return (await remote<{ sites: SiteRow[] }>(options, "/api/admin/sites")).sites;
  return withLocal(options.projectDir, async (l) => {
    const hosts = await listHosts(l.sql);
    return (await l.store.listSites()).map((s) => {
      const held = hosts.filter((h) => h.siteId === s.id).map((h) => h.host);
      return {
        id: s.id,
        name: s.name,
        slug: s.slug,
        projectId: s.projectId,
        defaultLocale: s.defaultLocale,
        theme: s.theme.name,
        hosts: held,
        conflicts: s.domains.map((d) => d.hostname).filter((h) => !held.includes(h)),
      };
    });
  });
}

/** `cloudhal site create`: a new site in this installation, seeded like `cloudhal init`. */
export async function createSite(
  options: SiteCliOptions,
  input: CreateSiteInput,
): Promise<{ id: string; projectId: string; edition?: EditionSummary }> {
  if (options.remote) {
    const r = await remote<{ site: { id: string; projectId: string }; edition?: EditionSummary }>(
      options,
      "/api/admin/sites",
      { method: "POST", body: JSON.stringify(input) },
    );
    return { ...r.site, ...(r.edition ? { edition: r.edition } : {}) };
  }
  return withLocal(options.projectDir, async (l) => {
    if ((await l.store.listSites()).some((s) => s.slug === input.slug))
      throw new Error(`a site with the slug ${input.slug} exists`);
    if (input.from) {
      const r = await createEdition(l.store, {
        fromSiteId: input.from,
        name: input.name,
        slug: input.slug,
        locale: input.locale ?? "en",
      });
      return { id: r.site.id, projectId: r.site.projectId, edition: r };
    }
    const site = await seedStarterSite(l.store, input);
    return { id: site.id, projectId: site.projectId };
  });
}

/** `cloudhal site delete <siteId> --confirm <slug>`. */
export async function deleteSite(
  options: SiteCliOptions,
  siteId: string,
  confirm: string,
): Promise<{ rows: number; objects: number }> {
  const cfg = await readProjectConfig(options.projectDir);
  if (siteId === cfg.siteId)
    throw new Error(
      `${siteId} is this project's site (cloudhal.json); its site Worker serves it, so it is not deleted from here`,
    );
  if (options.remote)
    return remote(options, `/api/admin/sites/${encodeURIComponent(siteId)}`, {
      method: "DELETE",
      body: JSON.stringify({ confirm }),
    });
  return withLocal(options.projectDir, async (l) => {
    const site = await l.store.getSite(siteId);
    if (!site) throw new Error(`no site ${siteId}`);
    if (confirm !== site.slug)
      throw new Error(`confirm with the site's slug (${site.slug}) to delete it`);
    return deleteSiteData(l, siteId);
  });
}
