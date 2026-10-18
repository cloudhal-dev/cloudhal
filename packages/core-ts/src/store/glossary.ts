/**
 * RFC-0033 §2: the site's translation glossary, one node per site. Agents translating content read
 * it as hard constraints (phase D); people edit it in Studio. Writes are one statement: an insert
 * (the `glossary` key is unique per site) or a CAS update on `rev`.
 */
import { assertValid, type Glossary, type Site } from "@cloudhal/core-contracts";
import { ConflictError, InvariantError, NotFoundError } from "../errors.ts";
import { ID_PREFIX } from "../ids.ts";
import { casUpdateStatement, insertNodeStatement } from "../node-sql.ts";
import type { Creatable } from "../nodes.ts";
import type { StoreContext } from "./context.ts";

/** Terms compare without case unless an entry says otherwise. */
function termKey(entry: Glossary["entries"][number]): string {
  return entry.caseSensitive ? entry.term : entry.term.toLocaleLowerCase("und");
}

/** Unique terms; translations only for the site's other locales; none for do-not-translate terms. */
export function checkGlossary(glossary: Glossary, site: Site): void {
  const seen = new Set<string>();
  for (const entry of glossary.entries) {
    const key = termKey(entry);
    if (seen.has(key))
      throw new InvariantError("invalid_labels", `"${entry.term}" is in the glossary twice`, {
        term: entry.term,
      });
    seen.add(key);
    const locales = Object.keys(entry.translations ?? {});
    if (entry.doNotTranslate && locales.length > 0)
      throw new InvariantError(
        "invalid_labels",
        `"${entry.term}" is never translated, so it has no translations`,
        { term: entry.term },
      );
    for (const locale of locales)
      if (locale === site.defaultLocale || !site.locales.includes(locale))
        throw new InvariantError(
          "locale_not_enabled",
          `"${entry.term}": ${locale} is not one of the site's other locales`,
          { term: entry.term, locale },
        );
  }
}

export class GlossaryEngine {
  readonly #ctx: StoreContext;

  constructor(ctx: StoreContext) {
    this.#ctx = ctx;
  }

  /** The site's glossary, or `undefined` before the first save. */
  async get(siteId: string): Promise<Glossary | undefined> {
    const row = await this.#ctx.sql.get<{ body: string }>(
      "SELECT body FROM nodes WHERE site_id = ? AND kind = 'glossary'",
      [siteId],
    );
    return row ? (JSON.parse(row.body) as Glossary) : undefined;
  }

  /** Creates the glossary (no `rev`) or replaces it (CAS on `rev`). */
  async save(input: Creatable<Glossary> | Glossary): Promise<Glossary> {
    const site = await this.#ctx.graph.getSite(input.siteId);
    if (!site) throw new NotFoundError("site", input.siteId);
    const ts = this.#ctx.stamp();
    const stored = "rev" in input ? await this.get(site.id) : undefined;
    if ("rev" in input && (!stored || stored.id !== input.id || stored.rev !== input.rev))
      throw new ConflictError("glossary", input.id ?? "", input.rev, stored?.rev);
    const next: Glossary = {
      ...input,
      schemaVersion: 1,
      id: stored?.id ?? input.id ?? this.#ctx.newId(ID_PREFIX.glossary),
      rev: stored ? stored.rev + 1 : 0,
      createdAt: stored?.createdAt ?? ts,
      updatedAt: ts,
    };
    assertValid("glossary", next);
    checkGlossary(next, site);
    if (stored) {
      const update = await casUpdateStatement("glossary", next, stored.rev);
      const res = await this.#ctx.sql.run(update.sql, update.params ?? []);
      if (res.changes !== 1)
        throw new ConflictError("glossary", next.id, stored.rev, await this.#ctx.revOf(next.id));
      return next;
    }
    await this.#ctx.runUnique(
      await insertNodeStatement("glossary", next, ts),
      "glossary",
      "glossary",
    );
    return next;
  }
}
