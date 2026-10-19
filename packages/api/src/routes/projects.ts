/**
 * RFC-0034 §4, §7: projects and creating sites from Studio.
 *
 * - `GET  /api/projects` → the projects holding a site the person may open, each with those sites:
 *   language, primary host, publish state and pending approvals (the project overview and the
 *   grouped Sites list). A site-limited person sees only their sites.
 * - `POST /api/sites` ← {name, slug, locale?, projectId?, from?} → the new site (scope
 *   `site:create`: Owner and Administrators), seeded like `cloudhal init`, or with `from` a
 *   language edition of that site (`createEdition`, with what it left out); nothing is published.
 */
import { forSite, visibleSites } from "@cloudhal/agent-runtime";
import type { Site } from "@cloudhal/core-contracts";
import { listHosts, seedStarterSite } from "@cloudhal/core-ts";
import { Hono } from "hono";
import type { Env } from "../context.ts";
import { notFound } from "../errors.ts";
import { makeSite, parseCreate } from "./admin/sites.ts";

export interface ProjectSiteView {
  id: string;
  name: string;
  slug: string;
  defaultLocale: string;
  locales: string[];
  theme: string;
  host: string | null;
  published: boolean;
  pendingApprovals: number;
}

export interface ProjectView {
  id: string;
  name: string;
  slug: string;
  sites: ProjectSiteView[];
}

export const projects: Hono<Env> = new Hono<Env>().get("/", async (c) => {
  const store = c.get("store");
  const all = await store.listSites();
  const ids = visibleSites(
    c.get("principal"),
    all.map((s) => s.id),
  );
  const sites = all.filter((s) => ids.includes(s.id));
  const hosts = await listHosts(store.sql, ids);
  const approvals = c.get("approvals");
  const view = async (s: Site): Promise<ProjectSiteView> => {
    const own = hosts.filter((h) => h.siteId === s.id && !h.locale);
    return {
      id: s.id,
      name: s.name,
      slug: s.slug,
      defaultLocale: s.defaultLocale,
      locales: s.locales,
      theme: s.theme.name,
      host: (own.find((h) => h.primary) ?? own[0])?.host ?? null,
      published: Boolean(s.publishedSnapshotId),
      pendingApprovals: approvals
        ? (await approvals.list({ siteId: s.id, status: "pending", limit: 100 })).length
        : 0,
    };
  };
  const byProject = new Map<string, Site[]>();
  for (const s of sites) byProject.set(s.projectId, [...(byProject.get(s.projectId) ?? []), s]);
  const out: ProjectView[] = [];
  for (const [projectId, list] of byProject) {
    const project = await store.getProject(projectId);
    out.push({
      id: projectId,
      name: project?.name ?? list[0]?.name ?? projectId,
      slug: project?.slug ?? "",
      sites: await Promise.all(list.map(view)),
    });
  }
  return c.json({ items: out });
});

/** `POST /api/sites` (mounted on the sites router). */
export const createSiteRoute = new Hono<Env>().post("/", async (c) => {
  const store = c.get("store");
  const input = parseCreate(await c.req.json().catch(() => null));
  if (input.projectId && !(await store.getProject(input.projectId)))
    throw notFound("project not found");
  if ((await store.listSites()).some((s) => s.slug === input.slug))
    return c.json({ error: "conflict", message: `a site with the slug ${input.slug} exists` }, 409);
  const principal = c.get("principal");
  // RFC-0034 §6: an edition copies a site, so the person must be able to open that site.
  if (input.from && principal && !forSite(principal, input.from)) throw notFound("site not found");
  const made = input.from
    ? await makeSite(store, input)
    : {
        site: await seedStarterSite(store, {
          ...input,
          ...(principal ? { owner: principal.actor } : {}),
        }),
      };
  if (made instanceof Response) return made;
  const site = made.site;
  await c.get("audit")?.record({
    at: new Date().toISOString(),
    actor: principal?.actor ?? { kind: "system", id: "sys_studio0001" },
    tool: "site.create",
    decision: "allow",
    outcome: "ok",
    input: { siteId: site.id, slug: input.slug, locale: input.locale, from: input.from ?? null },
    reason: `created the site ${input.name}`,
  });
  return c.json(
    {
      site: await store.getSite(site.id),
      ...("edition" in made && made.edition ? { edition: made.edition } : {}),
    },
    201,
  );
});
