/** Content entry writes: corrections, the block index, gates, terms, assets and path changes. */
import { assertValid, type ContentEntry } from "@cloudhal/core-contracts";
import { indexMarkdown, withoutIndex } from "../body-index.ts";
import { prepareCorrections } from "../corrections.ts";
import { ConflictError, NotFoundError } from "../errors.ts";
import { nodeHash } from "../hash.ts";
import { assertUnlocked } from "../holds.ts";
import { ID_PREFIX } from "../ids.ts";
import { fillMissingSrc } from "../media/refs.ts";
import { and, casUpdateStatement, insertNodeStatement, OpBatch, runOpBatch } from "../node-sql.ts";
import { uniquenessKey } from "../nodes.ts";
import { entryPath } from "../permalinks.ts";
import { canonicalTerms } from "../taxonomy.ts";
import type { StoreContext } from "./context.ts";
import { checkLocalizedNode, checkTranslationLinks } from "./translations.ts";
import type { NodeWriteOptions } from "./types.ts";
import { checkBodyDirectives } from "./validation.ts";

export class EntryEngine {
  readonly #ctx: StoreContext;

  constructor(ctx: StoreContext) {
    this.#ctx = ctx;
  }

  async write(
    prev: ContentEntry | undefined,
    draft: ContentEntry,
    ts: string,
    options: NodeWriteOptions = {},
  ): Promise<ContentEntry> {
    fillMissingSrc("contentEntry", draft);
    // The block index is the store's (RFC-0014 §3): a client's is dropped before validation.
    draft = { ...draft, body: withoutIndex(draft.body) };
    const site = await this.#ctx.graph.getSite(draft.siteId);
    if (!site) throw new NotFoundError("site", draft.siteId);
    let stored: ContentEntry | undefined;
    if (prev) {
      stored = await this.#ctx.graph.getContentEntry(prev.id);
      if (!stored || stored.rev !== prev.rev)
        throw new ConflictError("contentEntry", prev.id, prev.rev, stored?.rev);
    }
    // RFC-0019 §2: the store stamps new corrections and keeps live ones as they are.
    if (draft.corrections !== undefined || stored?.corrections !== undefined) {
      const { corrections: _c, ...rest } = draft;
      const corrections = prepareCorrections(draft.corrections, stored?.corrections, {
        live: new Set(
          stored?.corrections
            ? (await this.#ctx.liveEntry(site, draft.id))?.corrections?.map((c) => c.id)
            : [],
        ),
        at: ts,
        personEdit: options.correctionEdit === true,
        newId: () => this.#ctx.newId(ID_PREFIX.correction),
      });
      draft = corrections ? { ...rest, corrections } : (rest as ContentEntry);
    }
    assertValid("content-entry", canonicalTerms(draft));
    checkLocalizedNode("contentEntry", site, draft);
    await checkTranslationLinks(this.#ctx, { kind: "contentEntry", site, node: draft, stored });
    if (stored)
      await assertUnlocked(this.#ctx.sql, stored.siteId, [stored.id], options.releaseEdit);
    if (draft.body.format === "markdown") {
      checkBodyDirectives(this.#ctx.graph.blocks, draft.body.value, "body");
      const previous = stored?.body.format === "markdown" ? stored.body : undefined;
      const index = await indexMarkdown({
        markdown: draft.body.value,
        previous: previous?.blocks,
        previousMarkdown: previous?.value,
        writer: options.writer,
        at: ts,
        newId: () => this.#ctx.newId(ID_PREFIX.block),
      });
      draft = { ...draft, body: { ...draft.body, ...index } };
    }
    await this.#ctx.checkGates(site.id, stored?.availability, draft.availability);
    // §7.5: an entry not shown yet keeps its date on its embargo. When a write moves `from` and
    // the caller left `publishedAt` alone, the date follows, until the entry has been shown.
    const from = draft.availability?.from;
    if (
      stored &&
      from !== undefined &&
      draft.status === "published" &&
      from !== stored.availability?.from &&
      draft.publishedAt === stored.publishedAt &&
      draft.publishedAt !== from &&
      !(await this.#ctx.shownLive(site, draft.id))
    )
      draft = { ...draft, publishedAt: from };
    const refs = await this.#ctx.assets.planRefs("contentEntry", site.id, draft, stored);
    const prepared = await this.#ctx.tax.prepareEntry(refs.node, site, ts);
    const { entry, newTerms } = prepared;
    const guard = and(prepared.guard, refs.guard);
    const extra = refs.statements(await nodeHash(entry));
    const key = uniquenessKey("contentEntry", entry);
    const sameLocale = stored?.locale === entry.locale;
    const plan = await this.#ctx.tax.planPathChange(site, ts, {
      locale: entry.locale,
      wasPublished:
        !!stored && sameLocale && (stored.status === "published" || !!stored.publishedAt),
      isPublished: entry.status === "published",
      // Both under the site's current templates (RFC-0038).
      oldPath: stored && sameLocale ? entryPath(site, stored) : undefined,
      newPath: entryPath(site, entry),
      source: { kind: "contentEntry", id: entry.id },
    });
    if (newTerms.length === 0 && !plan) {
      const statement = stored
        ? await casUpdateStatement("contentEntry", entry, stored.rev, guard)
        : await insertNodeStatement("contentEntry", entry, ts, guard);
      const r = await this.#ctx.runUnique(statement, "contentEntry", key, extra);
      if (r.changes !== 1) {
        const rev = await this.#ctx.revOf(entry.id);
        if (stored && rev !== stored.rev)
          throw new ConflictError("contentEntry", entry.id, stored.rev, rev);
        await this.#ctx.tax.diagnoseEntry(entry);
        await refs.diagnose();
        throw new ConflictError("contentEntry", entry.id, stored?.rev ?? 0, rev);
      }
      return entry;
    }
    const batch = new OpBatch(this.#ctx.newId(ID_PREFIX.operation), site.id, ts);
    for (const term of newTerms)
      await batch.insert("term", term, this.#ctx.tax.termSlugGuard(term));
    if (stored) await batch.update("contentEntry", stored, entry, guard);
    else await batch.insert("contentEntry", entry, guard);
    batch.append(...extra);
    await plan?.emit(batch);
    await runOpBatch(this.#ctx.sql, batch, {
      uniqueKind: "contentEntry",
      uniqueKey: key,
      diagnose: async () => {
        await this.#ctx.tax.diagnoseEntry(entry);
        await refs.diagnose();
      },
    });
    return entry;
  }
}
