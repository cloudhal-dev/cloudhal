/**
 * RFC-0041 §5: a change to a non-localized field value of an original does not make its
 * translations stale; they read the value live. Staleness compares a translation's recorded
 * `translation.source.hash` with its source's current node hash (RFC-0033), so when an entry
 * write changes nothing but non-localized values, the translations that were fresh (their source
 * hash was the stored entry's hash) get the new hash and revision, in the same batch and guarded
 * on the entry's new hash (rule 4). Node hashes stay what they are, so existing sites and their
 * recorded hashes are untouched; any other change still marks translations stale, as before.
 * Translations held by a release, or in other sites (editions copy values), are left alone.
 */
import { assertValid, type ContentEntry, type FieldDefinition } from "@cloudhal/core-contracts";
import type { SqlStatement } from "@cloudhal/storage";
import { fieldDefinitions, type SiteFields, sameJson } from "../fields/types.ts";
import { nodeHash } from "../hash.ts";
import { readHolds } from "../holds.ts";
import { casUpdateStatement, hashIs } from "../node-sql.ts";
import type { StoreContext } from "./context.ts";

/** Statements a write adds, built once the entry's new hash is known. */
export type ForwardStatements = (hash: string) => Promise<SqlStatement[]>;

const NONE: ForwardStatements = async () => [];

/** The entry without its revision stamps and non-localized values. */
function localizedView(entry: ContentEntry, shared: readonly FieldDefinition[]) {
  const { rev: _r, updatedAt: _u, fields, ...rest } = entry;
  const kept = { ...(fields ?? {}) };
  for (const def of shared) delete kept[def.key];
  return { ...rest, fields: kept };
}

/** True when the write changes non-localized values and nothing else. */
export function onlySharedValuesChanged(
  site: SiteFields,
  stored: ContentEntry,
  entry: ContentEntry,
): boolean {
  if (stored.collection !== entry.collection) return false;
  const shared = fieldDefinitions(site, entry.collection).filter((d) => !d.localized);
  if (shared.length === 0) return false;
  const changed = shared.some(
    (d) => !sameJson(stored.fields?.[d.key] ?? null, entry.fields?.[d.key] ?? null),
  );
  return changed && sameJson(localizedView(stored, shared), localizedView(entry, shared));
}

/** One translation re-pointed at its source's new revision and hash. */
export function forwardedSource(
  node: ContentEntry,
  source: { rev: number; hash: string },
  ts: string,
): ContentEntry {
  const t = node.translation as NonNullable<ContentEntry["translation"]>;
  const from = t.source as NonNullable<typeof t.source>;
  return {
    ...node,
    translation: { ...t, source: { ...from, rev: source.rev, hash: source.hash } },
    rev: node.rev + 1,
    updatedAt: ts,
  };
}

/** The forward of fresh translations when `entry` changes only non-localized values. */
export async function planSourceForward(
  ctx: StoreContext,
  site: SiteFields & { id: string },
  write: { stored: ContentEntry | undefined; entry: ContentEntry; ts: string },
): Promise<ForwardStatements> {
  const { stored, entry, ts } = write;
  if (!stored || !onlySharedValuesChanged(site, stored, entry)) return NONE;
  const storedHash = await nodeHash(stored);
  const rows = await ctx.sql.all<{ body: string }>(
    `SELECT body FROM nodes WHERE site_id = ? AND kind = 'contentEntry'
       AND json_extract(body, '$.translation.source.id') = ?
       AND json_extract(body, '$.translation.source.hash') = ?
       AND json_extract(body, '$.translation.source.siteId') IS NULL`,
    [site.id, entry.id, storedHash],
  );
  if (rows.length === 0) return NONE;
  const translations = rows.map((r) => JSON.parse(r.body) as ContentEntry);
  const held = await readHolds(
    ctx.sql,
    site.id,
    translations.map((t) => t.id),
  );
  const free = translations.filter((t) => !held.has(t.id));
  return async (hash) => {
    const out: SqlStatement[] = [];
    for (const t of free) {
      const next = forwardedSource(t, { rev: entry.rev, hash }, ts);
      assertValid("content-entry", next);
      out.push(await casUpdateStatement("contentEntry", next, t.rev, hashIs(entry.id, hash)));
    }
    return out;
  };
}
