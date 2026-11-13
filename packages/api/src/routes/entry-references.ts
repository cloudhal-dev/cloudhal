/**
 * RFC-0045 §5 "API": the entry picker and an entry's referrers, site-scoped under the
 * `/sites/:siteId` membership check, both `content:read`.
 *
 * - `GET …/entries/pick?collections=a,b&q=&locale=&limit=&cursor=`: at most 20 `{groupId, id,
 *   title, collection, status, locale}` of the allowed collections, never archived ones, with a
 *   `cursor` and `truncated` when the row budget ended first (`entry-pick.ts`). `q` is at most
 *   100 characters and refused before it is read further; a per-member window of the
 *   `rate_limits` counters applies.
 * - `GET …/entries/groups?ids=a,b` (rollout step 6, Studio's chosen targets): each group's members
 *   in this site, any status, as `{groupId, id, title, collection, status, locale}` cards (the
 *   membership rule, `getGroupMembers`); a group with no member left gets an empty list. At most
 *   100 ids, the per-entry reference cap.
 * - `GET …/entries/reference-issues` (rollout step 6, Studio's publish dialog): what publishing
 *   the working copy now would show as nothing, `referenceIssues` over it ("publish warns, never
 *   fails"), each with the holder's title; the first 50 and the total. A site without reference
 *   fields answers none without reading its entries.
 * - `GET …/entries/:entryId/references?limit=&offset=`: the referrers of the entry's translation
 *   group from `entry_refs`, published holders first, each holder with the same-site members that
 *   show its value (`shared` 1, or 2 without their own value), paged (`listReferrers`, which MCP's
 *   `list_references` shares).
 */
import { getGroupMembers, listReferrers, referenceCard } from "@cloudhal/core-ts";
import {
  FIELD_LIMITS,
  GROUP_ID_PATTERN,
  hasReferenceFields,
  memberGroup,
  referenceIssues,
} from "@cloudhal/core-ts/fields";
import type { Context } from "hono";
import { Hono } from "hono";
import type { Env } from "../context.ts";
import { pickEntries } from "../entry-pick.ts";
import { apiError, badRequest, notFound } from "../errors.ts";
import { param } from "../params.ts";
import { countHit } from "../rate-limits.ts";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LOCALE = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,3}$/;
const MAX_Q = 100;
/** A node key: collection, locale and slug (each well under 100 characters). */
const MAX_CURSOR = 400;
const PICK_LIMIT = 20;
/** Picker searches per member and site per minute. */
const PICK_WINDOW = { hits: 120, ms: 60_000 };
const REFERRERS_LIMIT = 100;
const ISSUES_SHOWN = 50;
const GROUP_ID = new RegExp(GROUP_ID_PATTERN);

/** The groups' query: one to 100 well-formed group ids. */
function groupIds(c: Context<Env>): string[] {
  const ids = [...new Set((c.req.query("ids") ?? "").split(",").filter((s) => s !== ""))];
  if (ids.length === 0 || ids.length > FIELD_LIMITS.referencesPerEntry)
    throw badRequest(`ids lists one to ${FIELD_LIMITS.referencesPerEntry} translation group ids`);
  if (!ids.every((id) => GROUP_ID.test(id))) throw badRequest("ids are translation group ids");
  return ids;
}

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
  const cursor = c.req.query("cursor") || undefined;
  if (cursor !== undefined && cursor.length > MAX_CURSOR)
    throw badRequest("cursor is not one this route gave");
  return { q, collections, locale, limit, cursor };
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

export const entryReferences: Hono<Env> = new Hono<Env>()
  .get("/pick", async (c) => {
    const siteId = param(c, "siteId");
    const query = pickQuery(c);
    if (!(await c.get("store").getSite(siteId))) throw notFound("site not found");
    if (await rateLimited(c, siteId))
      throw apiError(429, "rate_limited", "too many picker searches; wait a minute");
    return c.json(await pickEntries(c.get("store").sql, siteId, query));
  })
  .get("/groups", async (c) => {
    const siteId = param(c, "siteId");
    const ids = groupIds(c);
    const store = c.get("store");
    if (!(await store.getSite(siteId))) throw notFound("site not found");
    const members = await getGroupMembers(store.sql, siteId, ids);
    return c.json({
      groups: Object.fromEntries([...members].map(([g, list]) => [g, list.map(referenceCard)])),
    });
  })
  .get("/reference-issues", async (c) => {
    const store = c.get("store");
    const site = await store.getSite(param(c, "siteId"));
    if (!site) throw notFound("site not found");
    if (!hasReferenceFields(site)) return c.json({ total: 0, issues: [] });
    const entries = await store.listContentEntries(site.id);
    const issues = referenceIssues({ site, entries }, c.get("now")().getTime());
    const titles = new Map(entries.map((e) => [e.id, e.title]));
    return c.json({
      total: issues.length,
      issues: issues
        .slice(0, ISSUES_SHOWN)
        .map((i) => ({ ...i, title: titles.get(i.entryId) ?? "" })),
    });
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
    return c.json({ groupId: page.group, ...(await listReferrers(store.sql, entry.siteId, page)) });
  });
