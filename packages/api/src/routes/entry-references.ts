/**
 * RFC-0045 §5 "API": the entry picker and an entry's referrers, site-scoped under the
 * `/sites/:siteId` membership check, both `content:read`.
 *
 * - `GET …/entries/pick?collections=a,b&q=&locale=&limit=`: at most 20 `{groupId, id, title,
 *   collection, status, locale}` of the allowed collections, never archived ones. `q` is at most
 *   100 characters, refused before it is read further, and matched as a substring of titles and
 *   slugs with both sides folded by `foldName` (case, diacritics, Turkish İ/ı; no pattern over
 *   input, rule 13), over at most 5,000 candidates in title order, under a per-member window of
 *   the `rate_limits` counters.
 * - `GET …/entries/:entryId/references?limit=&offset=`: the referrers of the entry's translation
 *   group from `entry_refs`, published holders first, each holder with the same-site members that
 *   show its value (`shared` 1, or 2 without their own value), paged.
 */
import type { ContentEntry } from "@cloudhal/core-contracts";
import { memberGroup } from "@cloudhal/core-ts/fields";
import { foldName } from "@cloudhal/core-ts/names";
import type { SqlDriver } from "@cloudhal/storage";
import type { Context } from "hono";
import { Hono } from "hono";
import type { Env } from "../context.ts";
import { apiError, badRequest, notFound } from "../errors.ts";
import { param } from "../params.ts";
import { countHit } from "../rate-limits.ts";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LOCALE = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,3}$/;
const MAX_Q = 100;
/** Candidates one picker search folds and matches at most (title order). */
const PICK_SCAN = 5000;
const PICK_LIMIT = 20;
/** Picker searches per member and site per minute. */
const PICK_WINDOW = { hits: 120, ms: 60_000 };
const REFERRERS_LIMIT = 100;

function intParam(raw: string | undefined, max: number, fallback: number): number {
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) throw badRequest("limit and offset are non-negative integers");
  return Math.min(n, max);
}

/** The picker's query, checked before any read. */
function pickQuery(c: Context<Env>) {
  const q = c.req.query("q") ?? "";
  if (q.length > MAX_Q) throw badRequest(`q is at most ${MAX_Q} characters`);
  const collections = (c.req.query("collections") ?? "").split(",").filter((s) => s !== "");
  if (collections.length === 0 || collections.length > 5 || !collections.every((s) => SLUG.test(s)))
    throw badRequest("collections lists one to five collection keys");
  const locale = c.req.query("locale") || undefined;
  if (locale !== undefined && !LOCALE.test(locale)) throw badRequest("locale is a language tag");
  const limit = Math.max(1, intParam(c.req.query("limit"), PICK_LIMIT, PICK_LIMIT));
  return { q, collections, locale, limit };
}

async function rateLimited(c: Context<Env>, siteId: string): Promise<boolean> {
  const who = c.get("actor")?.id ?? "anonymous";
  const count = await countHit(c.get("store").sql, {
    key: `entries-pick:${siteId}:${who}`,
    windowMs: PICK_WINDOW.ms,
    now: c.get("now")().getTime(),
  });
  return count > PICK_WINDOW.hits;
}

interface Card {
  groupId: string;
  id: string;
  title: string;
  collection: string;
  status: ContentEntry["status"];
  locale: string;
}

const cardOf = (e: ContentEntry): Card => ({
  groupId: memberGroup(e),
  id: e.id,
  title: e.title,
  collection: e.collection,
  status: e.status,
  locale: e.locale,
});

/** A picker candidate: only the columns a card and the match need, never the whole body. */
interface Candidate extends Record<string, unknown> {
  id: string;
  title: string | null;
  slug: string | null;
  collection: string;
  status: ContentEntry["status"];
  locale: string;
  grp: string | null;
}

/**
 * At most `limit` cards whose folded title or slug contains the folded `q`. Both sides fold in
 * JS with `foldName` (case, diacritics, Turkish İ/ı: "ÇİÇEK" finds "Çiçek Pasajı"), over at most
 * `PICK_SCAN` candidates of the allowed collections in title order, read as small columns.
 */
async function pick(sql: SqlDriver, siteId: string, query: ReturnType<typeof pickQuery>) {
  const rows = await sql.all<Candidate>(
    `SELECT id, json_extract(body, '$.title') AS title, json_extract(body, '$.slug') AS slug,
        json_extract(body, '$.collection') AS collection, json_extract(body, '$.status') AS status,
        json_extract(body, '$.locale') AS locale, json_extract(body, '$.translation.group') AS grp
      FROM nodes WHERE site_id = ? AND kind = 'contentEntry'
      AND json_extract(body, '$.collection') IN (SELECT value FROM json_each(?))
      AND json_extract(body, '$.status') <> 'archived'
      AND (? IS NULL OR json_extract(body, '$.locale') = ?)
      ORDER BY json_extract(body, '$.title'), id LIMIT ?`,
    [
      siteId,
      JSON.stringify(query.collections),
      query.locale ?? null,
      query.locale ?? null,
      PICK_SCAN,
    ],
  );
  const q = foldName(query.q);
  const hits = (text: string | null) => text !== null && foldName(text).includes(q);
  const out: Card[] = [];
  for (const r of rows) {
    if (out.length >= query.limit) break;
    if (q !== "" && !hits(r.title) && !hits(r.slug)) continue;
    out.push({
      groupId: r.grp ?? r.id,
      id: r.id,
      title: r.title ?? "",
      collection: r.collection,
      status: r.status,
      locale: r.locale,
    });
  }
  return out;
}

interface RefRow {
  holder: string;
  field: string;
  shared: number;
  root_key: string;
  source_status: string;
  body: string;
}

/** One page of the group's rows, each holder with the members that show its value. */
async function referrers(
  sql: SqlDriver,
  siteId: string,
  page: { group: string; limit: number; offset: number },
) {
  const rows = await sql.all<RefRow & Record<string, unknown>>(
    `SELECT r.source_id AS holder, r.field AS field, r.shared AS shared, r.root_key AS root_key,
        r.source_status AS source_status, n.body AS body
      FROM entry_refs r JOIN nodes n ON n.id = r.source_id AND n.site_id = r.site_id
      WHERE r.site_id = ? AND r.target_id = ?
      ORDER BY r.source_status = 'published' DESC, r.source_id, r.field LIMIT ? OFFSET ?`,
    [siteId, page.group, page.limit + 1, page.offset],
  );
  const shown = rows.slice(0, page.limit);
  const holders = [...new Set(shown.map((r) => r.holder))];
  const members = holders.length
    ? await sql.all<{ body: string }>(
        `SELECT body FROM nodes WHERE site_id = ? AND kind = 'contentEntry'
          AND json_extract(body, '$.translation.group') IN (SELECT value FROM json_each(?))
          AND json_extract(body, '$.translation.source.siteId') IS NULL`,
        [siteId, JSON.stringify(holders)],
      )
    : [];
  const inheriting = members.map((m) => JSON.parse(m.body) as ContentEntry);
  const items = shown.map((r) => ({
    ...cardOf(JSON.parse(r.body) as ContentEntry),
    field: r.field,
    shownBy: inheriting
      .filter(
        (m) =>
          m.translation?.group === r.holder &&
          // Only the row's own holder is left out: another holder on this page may still show it.
          m.id !== r.holder &&
          (r.shared === 1 || !Object.hasOwn(m.fields ?? {}, r.root_key)),
      )
      .map(cardOf),
  }));
  return {
    referrers: items,
    ...(rows.length > page.limit ? { next: page.offset + page.limit } : {}),
  };
}

export const entryReferences: Hono<Env> = new Hono<Env>()
  .get("/pick", async (c) => {
    const siteId = param(c, "siteId");
    const query = pickQuery(c);
    if (!(await c.get("store").getSite(siteId))) throw notFound("site not found");
    if (await rateLimited(c, siteId))
      throw apiError(429, "rate_limited", "too many picker searches; wait a minute");
    return c.json({ entries: await pick(c.get("store").sql, siteId, query) });
  })
  .get("/:entryId/references", async (c) => {
    const store = c.get("store");
    const entry = await store.getContentEntry(param(c, "entryId"));
    if (!entry || entry.siteId !== param(c, "siteId")) throw notFound("entry not found");
    const page = {
      group: memberGroup(entry),
      limit: Math.max(1, intParam(c.req.query("limit"), REFERRERS_LIMIT, 20)),
      offset: intParam(c.req.query("offset"), Number.MAX_SAFE_INTEGER, 0),
    };
    return c.json({ groupId: page.group, ...(await referrers(store.sql, entry.siteId, page)) });
  });
