/** Page writes: create (with the site's page list), update (path changes, redirects), delete. */
import { assertValid, type Page, type Site } from "@cloudhal/core-contracts";
import { type BlockWriter, indexMarkdown, withoutIndex } from "../body-index.ts";
import { ConflictError, NotFoundError } from "../errors.ts";
import { nodeHash } from "../hash.ts";
import { assertUnlocked } from "../holds.ts";
import { ID_PREFIX } from "../ids.ts";
import { fillMissingSrc } from "../media/refs.ts";
import { and, casUpdateStatement, OpBatch, runOpBatch } from "../node-sql.ts";
import { type Creatable, uniquenessKey } from "../nodes.ts";
import type { StoreContext } from "./context.ts";
import { checkLocalizedNode, checkTranslationLinks } from "./translations.ts";
import type { NodeWriteOptions } from "./types.ts";
import { checkComponentSections, checkReservedPath } from "./validation.ts";

export class PageEngine {
  readonly #ctx: StoreContext;

  constructor(ctx: StoreContext) {
    this.#ctx = ctx;
  }

  async createPage(
    site: Site,
    input: Creatable<Page>,
    options: NodeWriteOptions = {},
  ): Promise<{ page: Page; site: Site }> {
    const ts = this.#ctx.stamp();
    let draft: Page = structuredClone({
      ...input,
      schemaVersion: 1,
      id: input.id ?? this.#ctx.newId(ID_PREFIX.page),
      rev: 0,
      createdAt: ts,
      updatedAt: ts,
    });
    fillMissingSrc("page", draft);
    draft = await this.#indexSections(draft, undefined, ts, options.writer);
    assertValid("page", draft);
    checkComponentSections(this.#ctx.graph.blocks, draft);
    if (draft.siteId !== site.id) throw new Error("page.siteId must match site.id");
    checkReservedPath(draft.path);
    checkLocalizedNode("page", site, draft);
    await checkTranslationLinks(this.#ctx, { kind: "page", site, node: draft });
    await this.#ctx.checkGates(site.id, undefined, draft.availability);
    const refs = await this.#ctx.assets.planRefs("page", site.id, draft, undefined);
    const page = refs.node;
    const nextSite: Site = {
      ...site,
      pageIds: [...site.pageIds, page.id],
      rev: site.rev + 1,
      updatedAt: ts,
    };
    assertValid("site", nextSite);
    await this.#ctx.tax.checkPagePath(page);
    const plan = await this.#ctx.tax.planPathChange(site, ts, {
      locale: page.locale,
      wasPublished: false,
      isPublished: page.status === "published",
      oldPath: undefined,
      newPath: page.path,
      source: { kind: "page", id: page.id },
    });
    const batch = new OpBatch(this.#ctx.newId(ID_PREFIX.operation), site.id, ts);
    await batch.update("site", site, nextSite);
    await batch.insert("page", page, and(this.#ctx.tax.pageGuard(page), refs.guard));
    batch.append(...refs.statements(await nodeHash(page)));
    await plan?.emit(batch);
    await runOpBatch(this.#ctx.sql, batch, {
      uniqueKind: "page",
      uniqueKey: uniquenessKey("page", page),
      diagnose: async () => {
        await this.#ctx.tax.checkPagePath(page);
        await refs.diagnose();
      },
    });
    return { page, site: nextSite };
  }

  async updatePage(page: Page, options: NodeWriteOptions = {}): Promise<Page> {
    const ts = this.#ctx.stamp();
    let draft: Page = structuredClone({ ...page, rev: page.rev + 1, updatedAt: ts });
    fillMissingSrc("page", draft);
    const stored = await this.#ctx.graph.getPage(page.id);
    if (!stored || stored.rev !== page.rev)
      throw new ConflictError("page", page.id, page.rev, stored?.rev);
    checkReservedPath(draft.path, stored.path);
    draft = await this.#indexSections(draft, stored, ts, options.writer);
    assertValid("page", draft);
    checkComponentSections(this.#ctx.graph.blocks, draft);
    await assertUnlocked(this.#ctx.sql, stored.siteId, [page.id], options.releaseEdit);
    await this.#ctx.checkGates(draft.siteId, stored.availability, draft.availability);
    const refs = await this.#ctx.assets.planRefs("page", draft.siteId, draft, stored);
    const next = refs.node;
    await this.#ctx.tax.checkPagePath(next);
    const site = await this.#ctx.graph.getSite(next.siteId);
    if (!site) throw new NotFoundError("site", next.siteId);
    checkLocalizedNode("page", site, next);
    await checkTranslationLinks(this.#ctx, { kind: "page", site, node: next, stored });
    const sameLocale = stored.locale === next.locale;
    const plan = await this.#ctx.tax.planPathChange(site, ts, {
      locale: next.locale,
      wasPublished: sameLocale && stored.status === "published",
      isPublished: next.status === "published",
      oldPath: sameLocale ? stored.path : undefined,
      newPath: next.path,
      source: { kind: "page", id: next.id },
    });
    const key = uniquenessKey("page", next);
    const extra = refs.statements(await nodeHash(next));
    if (!plan) {
      const r = await this.#ctx.runUnique(
        await casUpdateStatement(
          "page",
          next,
          page.rev,
          and(this.#ctx.tax.pageGuard(next), refs.guard),
        ),
        "page",
        key,
        extra,
      );
      if (r.changes !== 1) {
        const rev = await this.#ctx.revOf(page.id);
        if (rev === page.rev) {
          await this.#ctx.tax.checkPagePath(next);
          await refs.diagnose();
        }
        throw new ConflictError("page", page.id, page.rev, rev);
      }
      return next;
    }
    const batch = new OpBatch(this.#ctx.newId(ID_PREFIX.operation), site.id, ts);
    await batch.update("page", stored, next, and(this.#ctx.tax.pageGuard(next), refs.guard));
    batch.append(...extra);
    await plan.emit(batch);
    await runOpBatch(this.#ctx.sql, batch, {
      uniqueKind: "page",
      uniqueKey: key,
      diagnose: async () => {
        await this.#ctx.tax.checkPagePath(next);
        await refs.diagnose();
      },
    });
    return next;
  }

  async deletePage(site: Site, page: Page): Promise<Site> {
    await assertUnlocked(this.#ctx.sql, site.id, [page.id]);
    const ts = this.#ctx.stamp();
    const nextSite: Site = {
      ...site,
      pageIds: site.pageIds.filter((id) => id !== page.id),
      rev: site.rev + 1,
      updatedAt: ts,
    };
    assertValid("site", nextSite);
    const siteHash = await nodeHash(nextSite);
    const results = await this.#ctx.sql.batch([
      await casUpdateStatement("site", nextSite, site.rev),
      {
        sql: "DELETE FROM nodes WHERE id = ? AND rev = ? AND kind = 'page' AND site_id = ? AND EXISTS (SELECT 1 FROM nodes WHERE id = ? AND hash = ?)",
        params: [page.id, page.rev, site.id, site.id, siteHash],
      },
      this.#ctx.assets.dropRefsStatement(page.id),
    ]);
    if (results[0]?.changes !== 1)
      throw new ConflictError("site", site.id, site.rev, await this.#ctx.revOf(site.id));
    if (results[1]?.changes !== 1) {
      // Site moved forward but the page was stale: surface as conflict on the page. The site change
      // stands (pageIds no longer lists the page); callers should reload both.
      throw new ConflictError("page", page.id, page.rev, await this.#ctx.revOf(page.id));
    }
    return nextSite;
  }

  /** A page with its markdown rich-text sections indexed against `stored`'s (RFC-0014 §3). */
  async #indexSections(
    page: Page,
    stored: Page | undefined,
    ts: string,
    writer: BlockWriter | undefined,
  ): Promise<Page> {
    const before = new Map((stored?.sections ?? []).map((s) => [s.id, s]));
    const sections = await Promise.all(
      page.sections.map(async (section) => {
        if (section.kind !== "richText") return section;
        const bare = withoutIndex(section) as typeof section;
        if (bare.format !== "markdown") return bare;
        const old = before.get(section.id);
        const previous = old?.kind === "richText" && old.format === "markdown" ? old : undefined;
        const index = await indexMarkdown({
          markdown: bare.body,
          previous: previous?.blocks,
          previousMarkdown: previous?.body,
          writer,
          at: ts,
          newId: () => this.#ctx.newId(ID_PREFIX.block),
        });
        return { ...bare, ...index };
      }),
    );
    return { ...page, sections };
  }
}
