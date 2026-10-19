import { visibleSites } from "@cloudhal/agent-runtime";
import type { ContentEntry, Glossary, Page, Translation } from "@cloudhal/core-contracts";
import { nodeHash, type TranslationMember } from "@cloudhal/core-ts";
import { type Context, Hono } from "hono";
import type { Env } from "../context.ts";
import { apiError, badRequest, notFound } from "../errors.ts";
import { actorOf, requireSite, snapshotAfter } from "../governance.ts";
import { param } from "../params.ts";

type Localized = Page | ContentEntry;

async function nodeOf(c: Context<Env>, siteId: string, nodeId: string): Promise<Localized> {
  const store = c.get("store");
  const node = (await store.getPage(nodeId)) ?? (await store.getContentEntry(nodeId));
  if (!node || node.siteId !== siteId) throw notFound("page or entry not found");
  return node;
}

/** A group member with what Studio shows next to it: the title and, for pages, the path. */
export interface TranslationRow extends TranslationMember {
  /** The group's id: the original's. */
  group: string;
  title: string;
  path?: string;
  collection?: string;
  slug?: string;
}

/**
 * `/api/sites/:siteId/translations` (RFC-0033 §8): a node's language versions, the stale ones of
 * the site, and a person's review of a machine translation. Agents translate through MCP
 * (`save_translation`); only people review, and that is this route.
 */
export const translations: Hono<Env> = new Hono<Env>()
  .get("/", async (c) => {
    const store = c.get("store");
    const site = await requireSite(c);
    const locale = c.req.query("locale");
    // RFC-0034 §7: `scope=project` — every site of the project the person may open, untranslated
    // pages and articles included (as groups of one), with each site's languages.
    const project = c.req.query("scope") === "project";
    const all = project ? await store.listSites(site.projectId) : [site];
    const ids = project
      ? visibleSites(
          c.get("principal"),
          all.map((s) => s.id),
        )
      : [site.id];
    const sites = all.filter((s) => ids.includes(s.id));
    const nodes: Localized[] = [];
    for (const s of sites)
      nodes.push(...(await store.listPages(s.id)), ...(await store.listContentEntries(s.id)));
    const groups = [...new Set(nodes.flatMap((n) => (n.translation ? [n.translation.group] : [])))];
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const rows: TranslationRow[] = [];
    for (const g of groups)
      for (const m of (await store.translationGroup(site, g)).members)
        if (ids.includes(m.siteId) && (!locale || m.locale === locale)) {
          const n = byId.get(m.id);
          if (n) rows.push(row(m, n, g));
        }
    if (project) {
      const grouped = new Set(groups);
      for (const n of nodes)
        if (!n.translation && !grouped.has(n.id) && (!locale || n.locale === locale))
          rows.push(await single(n));
    }
    return c.json({
      items: rows,
      ...(project
        ? { sites: sites.map((s) => ({ id: s.id, name: s.name, locales: s.locales })) }
        : {}),
    });
  })
  .get("/:nodeId", async (c) => {
    const store = c.get("store");
    const site = await requireSite(c);
    const node = await nodeOf(c, site.id, param(c, "nodeId"));
    const group = await store.translationGroup(site, node.translation?.group ?? node.id);
    const items: TranslationRow[] = [];
    for (const m of group.members) {
      const n =
        m.siteId === site.id ? await nodeOf(c, site.id, m.id).catch(() => undefined) : undefined;
      items.push(n ? row(m, n, group.group) : { ...m, group: group.group, title: m.id });
    }
    return c.json({ group: group.group, items });
  })
  .post("/:nodeId/review", async (c) => {
    const store = c.get("store");
    const site = await requireSite(c);
    const actor = actorOf(c);
    if (actor.kind !== "human")
      throw apiError(403, "forbidden", "only a person reviews a translation");
    const { rev } = (await c.req.json()) as { rev?: number };
    const node = await nodeOf(c, site.id, param(c, "nodeId"));
    if (node.rev !== rev)
      throw apiError(409, "conflict", `at rev ${node.rev}, you sent ${rev}; reload`);
    const t = node.translation;
    if (!t || t.method === "original") throw badRequest("this is not a translation");
    const translation: Translation = {
      ...t,
      method: t.method === "machine" ? "machine-reviewed" : t.method,
      review: { by: actor, at: new Date().toISOString() },
    };
    const saved =
      "sections" in node
        ? await store.updatePage({ ...node, translation })
        : await store.updateContentEntry({ ...node, translation });
    await snapshotAfter(c, site.id, "review_translation");
    return c.json(saved);
  });

/** An untranslated original as a group of one (the project-wide coverage view). */
async function single(n: Localized): Promise<TranslationRow> {
  return {
    id: n.id,
    group: n.id,
    kind: "sections" in n ? "page" : "contentEntry",
    siteId: n.siteId,
    locale: n.locale,
    status: n.status,
    hash: await nodeHash(n),
    rev: n.rev,
    stale: false,
    sourceMissing: false,
    reviewed: false,
    title: n.title,
    ...("path" in n ? { path: n.path } : { collection: n.collection, slug: n.slug }),
  };
}

function row(m: TranslationMember, n: Localized, group: string): TranslationRow {
  return {
    ...m,
    group,
    title: n.title,
    ...("path" in n ? { path: n.path } : { collection: n.collection, slug: n.slug }),
  };
}

/**
 * `/api/sites/:siteId/glossary` (RFC-0033 §2): the site's translation glossary. Reading needs
 * content access; changing it is a site setting. Saves are CAS on `rev` (none: the first save).
 */
export const glossary: Hono<Env> = new Hono<Env>()
  .get("/", async (c) => {
    const site = await requireSite(c);
    const g = await c.get("store").glossary.get(site.id);
    return c.json(g ?? { siteId: site.id, entries: [] });
  })
  .put("/", async (c) => {
    const site = await requireSite(c);
    const body = (await c.req.json()) as Glossary | { entries: Glossary["entries"] };
    const input =
      "rev" in body && body.rev !== undefined
        ? { ...(body as Glossary), siteId: site.id }
        : { siteId: site.id, entries: body.entries };
    const saved = await c.get("store").glossary.save(input);
    await snapshotAfter(c, site.id, "glossary");
    return c.json(saved);
  });
