/**
 * RFC-0042 §4 "API and MCP" for `list_entries`: `where` and `orderBy` over a collection's list
 * fields, run by core-ts's shared evaluator (`queryContentEntries`, in SQL while the collection's
 * list values are ready), and `limit`/`cursor` paging: with `orderBy` the store pages, without it
 * the list keeps its order (last updated first) and is paged here; without `limit` it is unpaged,
 * as before. Problems are refused as `invalid_query` with their paths (`where/0/value`).
 */
import type { ContentEntry, FieldCondition, FieldOrder } from "@cloudhal/core-contracts";
import { SiteSchema } from "@cloudhal/core-contracts";
import {
  ENTRY_PAGE_LIMIT,
  type EntryQuery,
  InvariantError,
  queryContentEntries,
} from "@cloudhal/core-ts";
import type { JsonSchema, ToolContext } from "./common.ts";

const DEFS = SiteSchema.$defs as Record<string, JsonSchema>;

export const ENTRY_QUERY_INPUT: Record<string, JsonSchema> = {
  where: {
    type: "array",
    minItems: 1,
    maxItems: 4,
    items: { $ref: "#/$defs/FieldCondition" },
    description:
      'Conditions on the collection\'s list fields (list_collections → listFields, with each field\'s ops), ANDed, e.g. [{"field":"startsAt","op":"gte","value":"now"},{"field":"format","op":"in","values":["talk"]}]. Values are strings read by the field\'s type: a number, YYYY-MM-DD, an RFC 3339 instant, true/false, an option value, or now',
    $defs: { FieldCondition: DEFS.FieldCondition },
  },
  orderBy: {
    $ref: "#/$defs/FieldOrder",
    description:
      'Order by a number, date or datetime list field, e.g. {"field":"startsAt","direction":"asc"}; entries without a value come last',
    $defs: { FieldOrder: DEFS.FieldOrder },
  },
  limit: {
    type: "integer",
    minimum: 1,
    maximum: 100,
    description: "Page size; the answer then has total and, when more follow, nextCursor",
  },
  cursor: {
    type: "string",
    minLength: 1,
    maxLength: 32,
    description: "nextCursor from the previous page (same arguments otherwise)",
  },
};

const refuse = (path: string, message: string): never => {
  throw new InvariantError("invalid_query", `${path}: ${message}`, {
    issues: [{ path, code: "invalid_query", message }],
  });
};

/** An opaque cursor: the offset of the next page (the API's form). */
const encodeCursor = (offset: number) => btoa(`o:${offset}`).replace(/=+$/, "");
function decodeCursor(raw: string): number {
  let text = "";
  try {
    text = atob(raw);
  } catch {
    // refused below
  }
  const m = /^o:(\d{1,9})$/.exec(text);
  return m ? Number(m[1]) : refuse("cursor", "not a cursor this list returned");
}

export interface EntryListAnswer {
  entries: ContentEntry[];
  total?: number;
  nextCursor?: string;
}

const byUpdated = (x: ContentEntry, y: ContentEntry) => y.updatedAt.localeCompare(x.updatedAt);

/** The entries of `base` matching the call's field query, ordered and paged. */
export async function listEntries(
  ctx: ToolContext,
  siteId: string,
  base: EntryQuery,
  a: Record<string, unknown>,
): Promise<EntryListAnswer> {
  const where = a.where as FieldCondition[] | undefined;
  const orderBy = a.orderBy as FieldOrder | undefined;
  const limit = a.limit as number | undefined;
  if (a.cursor !== undefined && limit === undefined) refuse("cursor", "a cursor needs limit");
  // List fields belong to one collection; without it they would be silently ignored.
  if (base.collection === undefined && (where !== undefined || orderBy !== undefined))
    refuse("collection", "where and orderBy need the collection whose list fields they use");
  const offset = a.cursor === undefined ? 0 : decodeCursor(a.cursor as string);
  // Ordered by a field, the store pages (in SQL once the collection's list values are ready);
  // otherwise the list keeps its last-updated order, sorted here.
  const paged =
    orderBy !== undefined &&
    Number.isInteger(limit) &&
    (limit as number) >= 1 &&
    (limit as number) <= ENTRY_PAGE_LIMIT;
  const result = await queryContentEntries(ctx.store, siteId, {
    ...base,
    ...(where ? { where } : {}),
    ...(orderBy ? { orderBy } : {}),
    ...(paged ? { limit, offset } : {}),
    now: (ctx.now?.() ?? new Date()).getTime(),
  });
  const ordered = orderBy ? result.entries : result.entries.sort(byUpdated);
  if (limit === undefined) return { entries: ordered };
  const page = paged ? ordered : ordered.slice(offset, offset + limit);
  const total = paged ? result.total : ordered.length;
  const next = offset + page.length;
  return {
    entries: page,
    total,
    ...(next < total ? { nextCursor: encodeCursor(next) } : {}),
  };
}
