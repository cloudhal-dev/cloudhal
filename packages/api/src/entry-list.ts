/**
 * RFC-0042 §4: the entry list's field query in a query string. `where` is a JSON list of
 * conditions and `orderBy` a JSON object (the contract's `FieldCondition` / `FieldOrder`), `limit`
 * pages (1–100) and `cursor` continues. Without `limit` the answer stays today's unpaged array;
 * with it, `{ entries, total, nextCursor? }`. Problems answer `422 invalid_query` with paths.
 */
import type { ContentEntry, FieldCondition, FieldOrder } from "@cloudhal/core-contracts";
import {
  type FieldEntryListQuery,
  InvariantError,
  queryContentEntries,
  type SiteGraphStore,
} from "@cloudhal/core-ts";

export interface FieldListParams {
  where?: string | undefined;
  orderBy?: string | undefined;
  limit?: string | undefined;
  cursor?: string | undefined;
}

export interface EntryPage {
  entries: ContentEntry[];
  total: number;
  nextCursor?: string;
}

const invalid = (path: string, message: string): never => {
  throw new InvariantError("invalid_query", `${path}: ${message}`, {
    issues: [{ path, code: "invalid_query", message }],
  });
};

function json(raw: string, path: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return invalid(path, "not valid JSON");
  }
}

/** An opaque cursor: the offset of the next page. */
const encodeCursor = (offset: number) => btoa(`o:${offset}`).replace(/=+$/, "");
function decodeCursor(raw: string): number {
  let text = "";
  try {
    text = atob(raw);
  } catch {
    // falls through to the refusal below
  }
  const m = /^o:(\d{1,9})$/.exec(text);
  return m ? Number(m[1]) : invalid("cursor", "not a cursor this list returned");
}

/** True when the request uses any of the field-query parameters. */
export const usesFieldQuery = (p: FieldListParams): boolean =>
  p.where !== undefined ||
  p.orderBy !== undefined ||
  p.limit !== undefined ||
  p.cursor !== undefined;

function parseParams(p: FieldListParams) {
  const where = p.where === undefined ? undefined : json(p.where, "where");
  if (where !== undefined && !Array.isArray(where)) invalid("where", "a JSON list of conditions");
  const orderBy = p.orderBy === undefined ? undefined : json(p.orderBy, "orderBy");
  if (
    orderBy !== undefined &&
    (typeof orderBy !== "object" || orderBy === null || Array.isArray(orderBy))
  )
    invalid("orderBy", 'a JSON object such as {"field":"startsAt","direction":"asc"}');
  const limit =
    p.limit === undefined ? undefined : /^\d{1,4}$/.test(p.limit) ? Number(p.limit) : Number.NaN;
  if (p.cursor !== undefined && limit === undefined) invalid("cursor", "a cursor needs limit");
  const offset = p.cursor === undefined ? undefined : decodeCursor(p.cursor);
  return {
    where: where as FieldCondition[] | undefined,
    orderBy: orderBy as FieldOrder | undefined,
    limit: limit === undefined ? undefined : Number.isNaN(limit) ? -1 : limit,
    offset,
  };
}

/** The entry list with a field query: an array without `limit`, a page with it. */
export async function listEntriesByField(
  store: SiteGraphStore,
  siteId: string,
  base: Omit<FieldEntryListQuery, "where" | "orderBy" | "limit" | "offset">,
  params: FieldListParams,
): Promise<ContentEntry[] | EntryPage> {
  const q = parseParams(params);
  const result = await queryContentEntries(store, siteId, {
    ...base,
    ...(q.where ? { where: q.where } : {}),
    ...(q.orderBy ? { orderBy: q.orderBy } : {}),
    ...(q.limit !== undefined ? { limit: q.limit } : {}),
    ...(q.offset !== undefined ? { offset: q.offset } : {}),
  });
  if (q.limit === undefined) return result.entries;
  const next = (q.offset ?? 0) + result.entries.length;
  return {
    entries: result.entries,
    total: result.total,
    ...(next < result.total ? { nextCursor: encodeCursor(next) } : {}),
  };
}
