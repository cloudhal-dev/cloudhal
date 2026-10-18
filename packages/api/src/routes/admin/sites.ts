/**
 * RFC-0034 §2–3: the sites of a multi-site installation, for the operator (`cloudhal site …`).
 *
 * - `GET    /sites` → every site with its hostnames and any hostname it claims but does not hold
 * - `POST   /sites` ← {name, slug, locale?, projectId?, theme?} → the new site, seeded like
 *   `cloudhal init`; nothing is published
 * - `DELETE /sites/:siteId` ← {confirm: <slug>} → removes the site's rows and objects; refused for
 *   the last site of the installation
 */

import { deleteSiteData, listHosts, seedStarterSite } from "@cloudhal/core-ts";
import { Hono } from "hono";
import type { Env } from "../../context.ts";
import { badRequest } from "../../errors.ts";
import { param } from "../../params.ts";
import { type AdminDeps, NO_STORE, OPERATOR_ACTOR } from "./shared.ts";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LOCALE = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

interface CreateInput {
  name: string;
  slug: string;
  locale: string;
  projectId?: string;
  theme?: string;
}

/** The `POST /sites` body, checked (400 on anything off). */
function parseCreate(body: unknown): CreateInput {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const slug = typeof b.slug === "string" ? b.slug.trim() : "";
  const locale = b.locale ?? "en";
  if (!name || name.length > 200) throw badRequest("name is required (at most 200 characters)");
  if (slug.length > 100 || !SLUG.test(slug))
    throw badRequest("slug: lower-case letters, digits and hyphens");
  if (typeof locale !== "string" || !LOCALE.test(locale))
    throw badRequest("locale: a BCP 47 tag such as en or pt-BR");
  if (b.projectId !== undefined && typeof b.projectId !== "string")
    throw badRequest("projectId must be a string");
  if (b.theme !== undefined && (typeof b.theme !== "string" || !b.theme))
    throw badRequest("theme must be a theme name");
  return {
    name,
    slug,
    locale,
    ...(b.projectId ? { projectId: b.projectId as string } : {}),
    ...(b.theme ? { theme: b.theme as string } : {}),
  };
}

/** List, create and delete sites. */
export function sitesAdminRoutes(deps: AdminDeps): Hono<Env> {
  return new Hono<Env>()
    .get("/sites", async (c) => {
      const store = c.get("store");
      const [sites, hosts] = await Promise.all([store.listSites(), listHosts(deps.storage.sql)]);
      return c.json(
        {
          sites: sites.map((s) => {
            const held = hosts.filter((h) => h.siteId === s.id).map((h) => h.host);
            const claimed = [
              ...s.domains.map((d) => d.hostname.toLowerCase()),
              ...Object.values(s.localization?.domains ?? {}).flatMap((h) =>
                h ? [h.toLowerCase()] : [],
              ),
            ];
            return {
              id: s.id,
              name: s.name,
              slug: s.slug,
              projectId: s.projectId,
              defaultLocale: s.defaultLocale,
              locales: s.locales,
              theme: s.theme.name,
              published: s.publishedSnapshotId ?? null,
              hosts: held,
              conflicts: [...new Set(claimed)].filter((h) => !held.includes(h)),
            };
          }),
        },
        200,
        NO_STORE,
      );
    })
    .post("/sites", async (c) => {
      const store = c.get("store");
      const input = parseCreate(await c.req.json().catch(() => null));
      if (input.projectId && !(await store.getProject(input.projectId)))
        return c.json({ error: "not_found", message: "not found: project" }, 404, NO_STORE);
      if ((await store.listSites()).some((s) => s.slug === input.slug))
        return c.json(
          { error: "conflict", message: `a site with the slug ${input.slug} exists` },
          409,
          NO_STORE,
        );
      const site = await seedStarterSite(store, input);
      await c.get("audit")?.record({
        at: new Date().toISOString(),
        actor: OPERATOR_ACTOR,
        tool: "site.create",
        decision: "allow",
        outcome: "ok",
        input: { siteId: site.id, slug: input.slug, locale: input.locale, via: "deploy-token" },
        reason: `operator created the site ${input.name}`,
      });
      return c.json(
        { site: { id: site.id, name: input.name, slug: input.slug, projectId: site.projectId } },
        201,
        NO_STORE,
      );
    })
    .delete("/sites/:siteId", async (c) => {
      const store = c.get("store");
      const siteId = param(c, "siteId");
      const site = await store.getSite(siteId);
      if (!site) return c.json({ error: "not_found", message: "not found: site" }, 404, NO_STORE);
      const b = ((await c.req.json().catch(() => null)) ?? {}) as { confirm?: unknown };
      if (b.confirm !== site.slug)
        throw badRequest(`confirm with the site's slug (${site.slug}) to delete it`);
      if ((await store.listSites()).length <= 1)
        return c.json(
          { error: "conflict", message: "the last site of an installation cannot be deleted" },
          409,
          NO_STORE,
        );
      const result = await deleteSiteData(deps.storage, siteId);
      await c.get("audit")?.record({
        at: new Date().toISOString(),
        actor: OPERATOR_ACTOR,
        tool: "site.delete",
        decision: "allow",
        outcome: "ok",
        input: { siteId, slug: site.slug, ...result, via: "deploy-token" },
        reason: `operator deleted the site ${site.name}`,
      });
      return c.json({ deleted: siteId, ...result }, 200, NO_STORE);
    });
}
