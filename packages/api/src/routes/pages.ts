import { previewCollections, renderPagePreview } from "@cloudhal/astro-renderer/preview";
import type { Page, Site } from "@cloudhal/core-contracts";
import { type Context, Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { patchBody } from "../body.ts";
import { BUILD_VIEWER_LIMIT, type BuildChange } from "../build.ts";
import type { Env } from "../context.ts";
import { pageDraft } from "../drafts.ts";
import { badRequest, notFound } from "../errors.ts";
import { writerOf } from "../governance.ts";
import { param } from "../params.ts";
import { type DraftPreview, previewResponse } from "../preview.ts";

async function requireSite(c: Context<Env>) {
  const site = await c.get("store").getSite(param(c, "siteId"));
  if (!site) throw notFound("site not found");
  return site;
}

async function loadPage(c: Context<Env>) {
  const site = await requireSite(c);
  const page = await c.get("store").getPage(param(c, "pageId"));
  if (!page || page.siteId !== site.id) throw notFound("page not found");
  return { site, page };
}

/** A page as the site renders it, with the entries its content lists show. */
async function pagePreview(c: Context<Env>, site: Site, page: Page): Promise<string> {
  const store = c.get("store");
  const collections = previewCollections(page.sections);
  const entries = Object.fromEntries(
    await Promise.all(
      collections.map(async (col) => [col, await store.listContentEntries(site.id, col)]),
    ),
  );
  return renderPagePreview(site, page, entries, { blocks: store.blocks }).html;
}

/** Who did it, as a viewer may see it: never an email or a key. */
const who = (a: { kind: string; id: string; name?: string | undefined }) => ({
  kind: a.kind,
  name: a.name ?? a.id,
});

/**
 * Ids of sections added or changed between two versions of a page, in the new order. The store's
 * own block index (`blocks`, `profile`; RFC-0014) is not a change anyone made.
 */
function changedSections(before: Page | undefined, after: Page): string[] {
  const key = (s: Page["sections"][number]) => {
    const {
      blocks: _b,
      profile: _p,
      ...rest
    } = s as typeof s & {
      blocks?: unknown;
      profile?: unknown;
    };
    return JSON.stringify(rest);
  };
  const old = new Map((before?.sections ?? []).map((s) => [s.id, key(s)]));
  return after.sections.filter((s) => old.get(s.id) !== key(s)).map((s) => s.id);
}

/**
 * Studio's Build view (RFC-0020 §6): a snapshot of the page's preview, then every change to it
 * (AG-UI-shaped `STATE_SNAPSHOT`, `STATE_DELTA`, and `CUSTOM` `validation_failed` when an agent's
 * operations are refused), as server-sent events. Previews are rendered per viewer from the
 * version that changed; a keep-alive comment every 25 seconds holds proxies open.
 */
async function buildEvents(c: Context<Env>) {
  const { site, page } = await loadPage(c);
  const hub = c.get("build");
  if (hub.viewers(page.id) >= BUILD_VIEWER_LIMIT)
    return c.json({ error: "too_many_viewers", message: "too many viewers on this page" }, 429);
  return streamSSE(c, async (stream) => {
    const queue: BuildChange[] = [];
    let wake: (() => void) | undefined;
    const off = hub.subscribe(page.id, (change) => {
      queue.push(change);
      wake?.();
    });
    stream.onAbort(() => {
      off();
      wake?.();
    });
    let last: Page = page;
    let seq = 0;
    const send = (data: unknown) =>
      stream.writeSSE({ data: JSON.stringify(data), id: String(++seq) });
    try {
      await send({
        type: "STATE_SNAPSHOT",
        snapshot: { rev: page.rev, title: page.title, html: await pagePreview(c, site, page) },
      });
      while (!stream.aborted) {
        if (queue.length === 0) {
          await Promise.race([
            new Promise<void>((resolve) => {
              wake = resolve;
            }),
            stream.sleep(25_000),
          ]);
          wake = undefined;
          if (stream.aborted) break;
          if (queue.length === 0) {
            await stream.write(": keep-alive\n\n");
            continue;
          }
        }
        const change = queue.shift() as BuildChange;
        if (change.kind === "changed") {
          await send({
            type: "STATE_DELTA",
            rev: change.page.rev,
            title: change.page.title,
            html: await pagePreview(c, site, change.page),
            delta: change.ops ?? [],
            repairs: change.repairs ?? [],
            changed: changedSections(last, change.page),
            tool: change.tool,
            actor: who(change.actor),
            at: change.at,
          });
          last = change.page;
        } else
          await send({
            type: "CUSTOM",
            name: "validation_failed",
            value: {
              issues: change.issues,
              tool: change.tool,
              actor: who(change.actor),
              at: change.at,
            },
          });
      }
    } finally {
      off();
    }
  });
}

export const pages: Hono<Env> = new Hono<Env>()
  .get("/", async (c) => {
    await requireSite(c);
    return c.json(await c.get("store").listPages(param(c, "siteId")));
  })
  .post("/", async (c) => {
    const site = await requireSite(c);
    const input = (await c.req.json()) as Omit<
      Page,
      "id" | "rev" | "createdAt" | "updatedAt" | "schemaVersion"
    >;
    const result = await c
      .get("store")
      .createPage(site, { ...input, siteId: site.id }, { writer: writerOf(c) });
    return c.json(result, 201);
  })
  .get("/:pageId/preview", async (c) => {
    const { site, page } = await loadPage(c);
    return previewResponse(c, await pagePreview(c, site, page));
  })
  // The editor's unsaved title, SEO and sections (RFC-0014 phase 1c): writes nothing.
  .post("/:pageId/preview", async (c) => {
    const { site, page } = await loadPage(c);
    const draft = pageDraft(page, await c.req.json().catch(() => ({})));
    return c.json({ html: await pagePreview(c, site, draft) } satisfies DraftPreview);
  })
  .get("/:pageId/build/events", buildEvents)
  .get("/:pageId", async (c) => {
    const page = await c.get("store").getPage(param(c, "pageId"));
    if (!page || page.siteId !== param(c, "siteId")) throw notFound("page not found");
    return c.json(page);
  })
  .put("/:pageId", async (c) => {
    const body = (await c.req.json()) as Page;
    if (body.id !== param(c, "pageId") || body.siteId !== param(c, "siteId"))
      throw badRequest("ids must match the URL");
    const saved = await c.get("store").updatePage(body, { writer: writerOf(c) });
    c.get("build").pageChanged({
      siteId: saved.siteId,
      page: saved,
      tool: "studio",
      actor: c.get("actor") ?? { kind: "system", id: "sys_studio" },
    });
    return c.json(saved);
  })
  // RFC-0014 §4: operations on a markdown rich-text section's blocks.
  .patch("/:pageId/sections/:sectionId/body", (c) =>
    patchBody(c, { pageId: param(c, "pageId"), sectionId: param(c, "sectionId") }),
  )
  .delete("/:pageId", async (c) => {
    const store = c.get("store");
    const site = await requireSite(c);
    const page = await store.getPage(param(c, "pageId"));
    if (!page || page.siteId !== site.id) throw notFound("page not found");
    const rev = Number(c.req.query("rev"));
    if (!Number.isInteger(rev)) throw badRequest("query parameter rev is required");
    const updated = await store.deletePage(site, { ...page, rev });
    return c.json({ site: updated });
  });
