/**
 * @cloudhal/core-ts/automations — what the built-in automations read (RFC-0008 §11.1, rollout
 * step 9): `BuiltinSources` over the site graph's tables, for `createBuiltinRunner` in
 * `@cloudhal/schedules`. Worker-safe; it imports `@cloudhal/schedules` (and the time-zone library
 * with it), so like `./releases` it is a subpath the site Worker never bundles.
 *
 * **The live site, cheaply.** A built-in step must stay inside a Workers Free tick (40 statements,
 * 10 ms of CPU), so it never loads the whole snapshot's bodies:
 * - the site row and its live snapshot's node refs are **one** read;
 * - routes, gates, titles and dates come from the working copy's rows with `json_extract` in D1
 *   (**one** read, no bodies through the Worker) — exact for every node whose working hash equals its
 *   live hash, which is nearly all of them; a node edited or deleted since it went live is read
 *   from its live body in the blob store (`nodes/<hash>.json`, a bounded number per step), and
 *   beyond that bound its working copy stands in;
 * - the bodies a `broken-links` page scans are **one** read of the working rows, with the same
 *   blob fallback.
 *
 * Analytics' 404 rows and the site's own feed come in through `BuiltinInputs`, which the admin
 * Worker (the `SITE` binding, the analytics service) and the Node ticker (the local renderer, the
 * SQL analytics) provide.
 */
import type {
  ContentEntry,
  Menu,
  NodeRef,
  Page,
  Site,
  Snapshot,
  Term,
} from "@cloudhal/core-contracts";
import {
  type BuiltinRunner,
  type BuiltinRunnerOptions,
  type BuiltinSources,
  canonicalInstant,
  createBuiltinRunner,
  DAY_MS,
  DIGEST_ITEMS,
  type DigestItem,
  type FeedExpectations,
  type FetchedDocument,
  type LinkFinding,
  type NodeKindName,
  type NotFoundRow,
  openFindings,
  type StaleDraftFinding,
  type StaleEntryFinding,
  type WeeklyDigest,
} from "@cloudhal/schedules";
import { SqlScheduleStore } from "@cloudhal/schedules/sql";
import type { BlobStore, SqlDriver } from "@cloudhal/storage";
import { Lexer, type Token, type Tokens } from "marked";
import { gateState } from "./availability.ts";
import { ASSET_HREF, imageSlots, markdownSlots } from "./media/refs.ts";
import { MEDIA_ROUTE, mediaPrefix } from "./media/types.ts";
import { entryAt, entryPath } from "./permalinks.ts";
import { matchRedirect, normalisePath } from "./redirects.ts";

// ───────────────────────────── inputs from the deployment ─────────────────────────────

/** One 404 or 410 row of analytics' `renders` report (visitor-supplied path). */
export interface NotFoundSourceRow {
  readonly path: string;
  readonly status: number;
  readonly refPath: string | null;
  readonly hits: number;
  readonly lastSeen: string | null;
}

/** What the deployment adds to the graph for the built-in jobs. */
export interface BuiltinInputs {
  /** 404/410 rows of a site in `[from, to)`; undefined when analytics is off for it. */
  readonly notFound?:
    | ((input: {
        siteId: string;
        from: string;
        to: string;
        limit: number;
      }) => Promise<readonly NotFoundSourceRow[] | undefined>)
    | undefined;
  /** The site's own `/rss.xml` or `/sitemap.xml` as served; undefined: not served from here. */
  readonly fetchDocument?:
    | ((input: { siteId: string; path: string }) => Promise<FetchedDocument | undefined>)
    | undefined;
}

/** The part of `AnalyticsService` the 404 sweep uses (structural: core-ts does not import analytics). */
export interface NotFoundAnalytics {
  feature(): { readonly enabled: boolean };
  query(q: {
    kind: "renders";
    siteId: string;
    range: { from: string; to: string };
    statuses: "errors";
    limit: number;
  }): Promise<{ readonly data: unknown }>;
}

/**
 * `BuiltinInputs.notFound` from an analytics service: the week's 404/410 rows (rollups first, at
 * most one live query, within the deployment's analytics budget), or undefined when it is off.
 */
export function notFoundFromAnalytics(
  analytics: NotFoundAnalytics,
): NonNullable<BuiltinInputs["notFound"]> {
  return async ({ siteId, from, to, limit }) => {
    if (!analytics.feature().enabled) return undefined;
    const res = await analytics.query({
      kind: "renders",
      siteId,
      range: { from, to },
      statuses: "errors",
      limit,
    });
    const rows = (res.data as { rows?: readonly NotFoundSourceRow[] }).rows ?? [];
    return rows.filter((r) => r.status === 404 || r.status === 410);
  };
}

// ───────────────────────────── the live index ─────────────────────────────

interface Live {
  site: Site;
  snapshotId: string;
  refs: readonly NodeRef[];
  byId: Map<string, NodeRef>;
}

/** The site and its live snapshot's refs (one read); undefined when never published. */
async function readLive(sql: SqlDriver, siteId: string): Promise<Live | undefined> {
  const row = await sql.get<{ site: string; snapshot: string | null }>(
    `SELECT n.body AS site, s.body AS snapshot FROM nodes n
     LEFT JOIN snapshots s ON s.id = json_extract(n.body, '$.publishedSnapshotId')
     WHERE n.id = ? AND n.kind = 'site'`,
    [siteId],
  );
  if (!row?.snapshot) return undefined;
  const snap = JSON.parse(row.snapshot) as Snapshot;
  return {
    site: JSON.parse(row.site) as Site,
    snapshotId: snap.id,
    refs: snap.nodes,
    byId: new Map(snap.nodes.map((r) => [r.id, r])),
  };
}

/** The route-bearing fields of a node (what links resolve against, what the digest lists). */
interface RouteInfo {
  id: string;
  kind: string;
  status?: string | undefined;
  path?: string | undefined;
  collection?: string | undefined;
  slug?: string | undefined;
  title?: string | undefined;
  from?: string | undefined;
  until?: string | undefined;
  taxonomyId?: string | undefined;
  visibility?: string | undefined;
  archiveOn?: boolean | undefined;
  archiveBase?: string | undefined;
  feed?: boolean | undefined;
  redirectFrom?: string | undefined;
  redirectTo?: string | undefined;
  redirectMatch?: string | undefined;
  publishedAt?: string | undefined;
  updatedAt?: string | undefined;
  sha256?: string | undefined;
}

const ROUTE_KINDS = ["page", "contentEntry", "taxonomy", "term", "redirect", "asset"];

type RouteRow = {
  id: string;
  kind: string;
  hash: string;
  status: string | null;
  path: string | null;
  collection: string | null;
  slug: string | null;
  title: string | null;
  gate_from: string | null;
  gate_until: string | null;
  taxonomy_id: string | null;
  visibility: string | null;
  archive_on: number | null;
  archive_base: string | null;
  feed: number | null;
  r_from: string | null;
  r_to: string | null;
  r_match: string | null;
  published_at: string | null;
  updated_at: string | null;
  sha256: string | null;
};

const opt = <T>(v: T | null | undefined): T | undefined => (v === null ? undefined : v);

function infoOfRow(r: RouteRow): RouteInfo {
  return {
    id: r.id,
    kind: r.kind,
    status: opt(r.status),
    path: opt(r.path),
    collection: opt(r.collection),
    slug: opt(r.slug),
    title: opt(r.title),
    from: opt(r.gate_from),
    until: opt(r.gate_until),
    taxonomyId: opt(r.taxonomy_id),
    visibility: opt(r.visibility),
    archiveOn: r.archive_on === null ? undefined : Number(r.archive_on) === 1,
    archiveBase: opt(r.archive_base),
    feed: r.feed === null ? undefined : Number(r.feed) === 1,
    redirectFrom: opt(r.r_from),
    redirectTo: opt(r.r_to),
    redirectMatch: opt(r.r_match),
    publishedAt: opt(r.published_at),
    updatedAt: opt(r.updated_at),
    sha256: opt(r.sha256),
  };
}

/** The same fields from a node body (the live body read from the blob store). */
function infoOfBody(kind: string, body: Record<string, unknown>): RouteInfo {
  const s = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : undefined);
  const a = body.availability as { from?: string; until?: string } | undefined;
  const archive = body.archive as { enabled?: boolean; basePath?: string } | undefined;
  const redirect = kind === "redirect";
  return {
    id: s("id") as string,
    kind,
    status: s("status"),
    path: s("path"),
    collection: s("collection"),
    slug: s("slug"),
    title: s("title"),
    from: a?.from,
    until: a?.until,
    taxonomyId: s("taxonomyId"),
    visibility: s("visibility"),
    archiveOn: archive?.enabled,
    archiveBase: archive?.basePath,
    feed: typeof body.feed === "boolean" ? body.feed : undefined,
    redirectFrom: redirect ? s("from") : undefined,
    redirectTo: redirect ? s("to") : undefined,
    redirectMatch: redirect ? s("match") : undefined,
    publishedAt: s("publishedAt"),
    updatedAt: s("updatedAt"),
    sha256: s("sha256"),
  };
}

const ROUTE_SQL = `SELECT id, kind, hash,
  json_extract(body, '$.status') AS status, json_extract(body, '$.path') AS path,
  json_extract(body, '$.collection') AS collection, json_extract(body, '$.slug') AS slug,
  json_extract(body, '$.title') AS title,
  json_extract(body, '$.availability.from') AS gate_from, json_extract(body, '$.availability.until') AS gate_until,
  json_extract(body, '$.taxonomyId') AS taxonomy_id, json_extract(body, '$.visibility') AS visibility,
  json_extract(body, '$.archive.enabled') AS archive_on, json_extract(body, '$.archive.basePath') AS archive_base,
  json_extract(body, '$.feed') AS feed,
  CASE WHEN kind = 'redirect' THEN json_extract(body, '$.from') END AS r_from,
  CASE WHEN kind = 'redirect' THEN json_extract(body, '$.to') END AS r_to,
  CASE WHEN kind = 'redirect' THEN json_extract(body, '$.match') END AS r_match,
  json_extract(body, '$.publishedAt') AS published_at, json_extract(body, '$.updatedAt') AS updated_at,
  CASE WHEN kind = 'asset' THEN json_extract(body, '$.sha256') END AS sha256
FROM nodes WHERE site_id = ? AND kind IN (${ROUTE_KINDS.map((k) => `'${k}'`).join(", ")})`;

/** Reads live bodies from the blob store, at most `budget.left` of them (shared by a step). */
interface BlobBudget {
  left: number;
}

async function liveBody(
  blobs: BlobStore,
  ref: NodeRef,
  budget: BlobBudget,
): Promise<Record<string, unknown> | undefined> {
  if (budget.left <= 0) return undefined;
  budget.left--;
  const bytes = await blobs.get(`nodes/${ref.hash}.json`);
  return bytes
    ? (JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>)
    : undefined;
}

type Resolution =
  | { readonly ok: true }
  | { readonly ok: false; readonly gated?: { id: string; state: "embargoed" | "expired" } };

const WELL_KNOWN = new Set(["/", "/rss.xml", "/sitemap.xml", "/robots.txt"]);

/** The live site's routes, gates and assets at `now` (RFC-0002 §7's order: page, entry, archive, redirect). */
class LiveIndex {
  readonly live: Live;
  readonly now: number;
  readonly info = new Map<string, RouteInfo>();
  readonly #pages = new Map<string, RouteInfo[]>();
  readonly #entries = new Map<string, RouteInfo>();
  readonly #terms = new Map<string, RouteInfo>();
  readonly #taxonomies: RouteInfo[] = [];
  readonly #redirects: { from: string; to: string; match: "exact" | "prefix" }[] = [];
  readonly assets = new Set<string>();
  readonly mediaPrefixes = new Set<string>();

  constructor(live: Live, infos: Iterable<RouteInfo>, now: number) {
    this.live = live;
    this.now = now;
    for (const i of infos) {
      this.info.set(i.id, i);
      if (i.kind === "page" && i.path) {
        const list = this.#pages.get(i.path) ?? [];
        list.push(i);
        this.#pages.set(i.path, list);
      } else if (i.kind === "contentEntry" && i.collection && i.slug)
        this.#entries.set(entryPathOf(live.site, i), i);
      else if (i.kind === "term" && i.taxonomyId && i.slug)
        this.#terms.set(`${i.taxonomyId}\n${i.slug}`, i);
      else if (i.kind === "taxonomy" && i.archiveOn && i.archiveBase) this.#taxonomies.push(i);
      else if (i.kind === "redirect" && i.redirectFrom && i.redirectTo)
        this.#redirects.push({
          from: i.redirectFrom,
          to: i.redirectTo,
          match: i.redirectMatch === "prefix" ? "prefix" : "exact",
        });
      else if (i.kind === "asset") {
        this.assets.add(i.id);
        if (i.sha256) this.mediaPrefixes.add(mediaPrefix(i.sha256));
      }
    }
  }

  /** `open`, `embargoed`, `expired` — or `unpublished` for a live node whose status is not published. */
  visibility(i: RouteInfo): "open" | "embargoed" | "expired" | "unpublished" {
    if (i.status !== "published") return "unpublished";
    const availability =
      i.from !== undefined || i.until !== undefined
        ? {
            ...(i.from !== undefined ? { from: i.from } : {}),
            ...(i.until !== undefined ? { until: i.until } : {}),
          }
        : undefined;
    return gateState(availability ? { availability } : {}, this.now);
  }

  #node(candidates: readonly RouteInfo[] | undefined): Resolution | undefined {
    if (!candidates || candidates.length === 0) return undefined;
    let gated: { id: string; state: "embargoed" | "expired" } | undefined;
    for (const c of candidates) {
      const v = this.visibility(c);
      if (v === "open") return { ok: true };
      if (v !== "unpublished") gated ??= { id: c.id, state: v };
    }
    return gated ? { ok: false, gated } : undefined;
  }

  /** What a request for `path` finds on the live site now. */
  resolve(path: string): Resolution {
    if (WELL_KNOWN.has(path)) return { ok: true };
    const page = this.#node(this.#pages.get(path));
    if (page?.ok) return page;
    const hit = entryAt(this.live.site, path) && this.#entries.get(path);
    const entry = hit ? this.#node([hit]) : undefined;
    if (entry?.ok) return entry;
    for (const tax of this.#taxonomies) {
      const base = tax.archiveBase as string;
      if (!path.startsWith(`${base}/`)) continue;
      const m = /^([^/]+)(?:\/page\/([1-9][0-9]*)|\/(rss\.xml))?$/.exec(
        path.slice(base.length + 1),
      );
      if (!m) continue;
      const term = this.#terms.get(`${tax.id}\n${m[1]}`);
      if (term?.status === "active" && term.visibility === "public" && (!m[3] || tax.feed))
        return { ok: true };
    }
    if (matchRedirect(this.#redirects as never, path)) return { ok: true };
    return page ?? entry ?? { ok: false };
  }

  /** Live, published, visible entries. */
  entries(): RouteInfo[] {
    return [...this.info.values()].filter(
      (i) => i.kind === "contentEntry" && this.visibility(i) === "open",
    );
  }

  /** The hostnames the site answers on (absolute links to them are internal). */
  hosts(): Set<string> {
    return new Set((this.live.site.domains ?? []).map((d) => d.hostname.toLowerCase()));
  }
}

const entryPathOf = (site: Site, i: { collection?: unknown; slug?: unknown }) =>
  entryPath(site, { collection: `${i.collection}`, slug: `${i.slug}` });

/** The live index: one read of the routes, plus live bodies of nodes changed since publishing. */
async function liveIndex(
  sql: SqlDriver,
  blobs: BlobStore,
  live: Live,
  now: number,
  budget: BlobBudget,
): Promise<LiveIndex> {
  const rows = await sql.all<RouteRow>(ROUTE_SQL, [live.site.id]);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const infos: RouteInfo[] = [];
  for (const ref of live.refs) {
    if (!ROUTE_KINDS.includes(ref.kind)) continue;
    const row = byId.get(ref.id);
    if (row && row.hash === ref.hash) {
      infos.push(infoOfRow(row));
      continue;
    }
    const body = await liveBody(blobs, ref, budget);
    if (body) infos.push({ ...infoOfBody(ref.kind, body), id: ref.id });
    else if (row) infos.push(infoOfRow(row)); // over the step's blob budget: the working copy stands in
  }
  return new LiveIndex(live, infos, now);
}

// ───────────────────────────── references in bodies ─────────────────────────────

interface Reference {
  readonly field: string;
  readonly href: string;
}

/** Link and image targets of a markdown text (code excluded), plus `href`/`src` of raw HTML in it. */
function markdownHrefs(markdown: string): string[] {
  const out: string[] = [];
  const walk = (tokens: readonly Token[] | undefined) => {
    for (const t of tokens ?? []) {
      if (t.type === "link" || t.type === "image") out.push((t as Tokens.Link | Tokens.Image).href);
      else if (t.type === "html") out.push(...htmlHrefs((t as Tokens.HTML).text));
      const nested = t as { tokens?: Token[]; items?: Tokens.ListItem[] };
      if (nested.tokens) walk(nested.tokens);
      if (nested.items) for (const item of nested.items) walk(item.tokens);
      if (t.type === "table") {
        const table = t as Tokens.Table;
        for (const cell of table.header) walk(cell.tokens);
        for (const row of table.rows) for (const cell of row) walk(cell.tokens);
      }
    }
  };
  walk(new Lexer({ gfm: true }).lex(markdown));
  return out;
}

function htmlHrefs(html: string): string[] {
  return [...html.matchAll(/\b(?:href|src)\s*=\s*(["'])(.*?)\1/gi)].map((m) => m[2] as string);
}

/** Every reference a live page, entry or term makes (links, images, CTAs). */
function referencesOf(kind: "page" | "contentEntry" | "term", node: unknown): Reference[] {
  const n = node as Page | ContentEntry | Term;
  const out: Reference[] = [];
  for (const slot of imageSlots(kind, n))
    out.push({
      field: slot.field,
      href: slot.ref.assetId ? `asset:${slot.ref.assetId}` : slot.ref.src,
    });
  for (const slot of markdownSlots(kind, n))
    for (const href of markdownHrefs(slot.text)) out.push({ field: slot.field, href });
  if (kind === "contentEntry") {
    const e = n as ContentEntry;
    if (e.body.format === "html")
      for (const href of htmlHrefs(e.body.value)) out.push({ field: "body", href });
  } else if (kind === "page") {
    for (const s of (n as Page).sections) {
      if (s.kind === "richText" && s.format === "html")
        for (const href of htmlHrefs(s.body)) out.push({ field: `sections.${s.id}.body`, href });
      if (s.kind === "hero" && s.cta) out.push({ field: `sections.${s.id}.cta`, href: s.cta.href });
    }
  }
  return out;
}

type MenuItem = Menu["items"][number];

/** A menu's page, entry and term targets. */
function menuTargets(menu: Menu): { itemId: string; kind: string; targetId: string }[] {
  const out: { itemId: string; kind: string; targetId: string }[] = [];
  const walk = (items: readonly MenuItem[] | undefined) => {
    for (const item of items ?? []) {
      if (item.kind === "page") out.push({ itemId: item.id, kind: "page", targetId: item.pageId });
      else if (item.kind === "contentEntry")
        out.push({ itemId: item.id, kind: "contentEntry", targetId: item.entryId });
      else if (item.kind === "term")
        out.push({ itemId: item.id, kind: "term", targetId: item.termId });
      walk((item as { children?: MenuItem[] }).children);
    }
  };
  walk(menu.items);
  return out;
}

type Target =
  | { kind: "asset"; id: string }
  | { kind: "bad-asset" }
  | { kind: "path"; path: string }
  | { kind: "skip" };

/** What a written reference points at: an asset, a path on this site, or something not checked. */
function targetOf(href: string, hosts: ReadonlySet<string>): Target {
  const h = href.trim();
  if (/^asset:/i.test(h)) {
    const m = ASSET_HREF.exec(h);
    return m ? { kind: "asset", id: m[1] as string } : { kind: "bad-asset" };
  }
  let path: string;
  if (h.startsWith("/") && !h.startsWith("//")) path = h;
  else if (/^(?:https?:)?\/\//i.test(h)) {
    try {
      const u = new URL(h.startsWith("//") ? `https:${h}` : h);
      if (!hosts.has(u.hostname.toLowerCase())) return { kind: "skip" };
      path = u.pathname;
    } catch {
      return { kind: "skip" };
    }
  } else return { kind: "skip" }; // fragments, mailto:, relative paths, other schemes
  try {
    path = decodeURI(path);
  } catch {
    // keep it encoded
  }
  return { kind: "path", path: normalisePath(path) };
}

const KIND_NAME: Record<string, NodeKindName> = {
  page: "page",
  contentEntry: "contentEntry",
  menu: "menu",
  term: "term",
};

/** Checks one node's references against the live index. */
function checkNode(
  index: LiveIndex,
  ref: NodeRef,
  body: unknown,
  hosts: ReadonlySet<string>,
): { links: number; findings: LinkFinding[] } {
  const findings: LinkFinding[] = [];
  const nodeKind = KIND_NAME[ref.kind] as NodeKindName;
  const seen = new Set<string>();
  let links = 0;
  const add = (f: Omit<LinkFinding, "nodeId" | "nodeKind">) => {
    const key = `${f.field}\n${f.href}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push({ ...f, nodeId: ref.id, nodeKind });
  };
  if (ref.kind === "menu") {
    for (const t of menuTargets(body as Menu)) {
      links++;
      const info = index.info.get(t.targetId);
      const v = info ? index.visibility(info) : "unpublished";
      const termOk = info?.kind === "term" && info.status === "active";
      if (t.kind === "term" ? termOk : v === "open") continue;
      add({
        code:
          info && (v === "embargoed" || v === "expired")
            ? "link-to-gated-content"
            : "broken-menu-target",
        severity: v === "embargoed" ? "info" : "error",
        field: `items.${t.itemId}`,
        href: t.targetId,
        targetId: t.targetId,
        ...(info && (v === "embargoed" || v === "expired") ? { gate: v } : {}),
      });
    }
    return { links, findings };
  }
  for (const r of referencesOf(ref.kind as "page" | "contentEntry" | "term", body)) {
    const target = targetOf(r.href, hosts);
    if (target.kind === "skip") continue;
    links++;
    if (target.kind === "bad-asset") {
      add({ code: "broken-media-reference", severity: "error", field: r.field, href: r.href });
      continue;
    }
    if (target.kind === "asset") {
      if (!index.assets.has(target.id))
        add({
          code: "broken-media-reference",
          severity: "error",
          field: r.field,
          href: r.href,
          targetId: target.id,
        });
      continue;
    }
    const path = target.path;
    if (path.startsWith("/media/")) {
      const m = MEDIA_ROUTE.exec(path);
      if (!m || !index.mediaPrefixes.has(m[1] as string))
        add({ code: "broken-media-reference", severity: "error", field: r.field, href: r.href });
      continue;
    }
    // A file the theme may serve (`/fonts/x.woff2`) cannot be checked against the graph.
    if (/\.[A-Za-z0-9]{1,8}$/.test(path) && !WELL_KNOWN.has(path)) {
      links--;
      continue;
    }
    const res = index.resolve(path);
    if (res.ok) continue;
    if (res.gated)
      add({
        code: "link-to-gated-content",
        severity: res.gated.state === "embargoed" ? "info" : "warning",
        field: r.field,
        href: r.href,
        targetId: res.gated.id,
        gate: res.gated.state,
      });
    else add({ code: "broken-internal-link", severity: "error", field: r.field, href: r.href });
  }
  return { links, findings };
}

const SCANNED_KINDS = new Set(["page", "contentEntry", "term", "menu"]);

/** Whether readers see a live node (menus always; terms when active and public). */
function shown(index: LiveIndex, ref: NodeRef): boolean {
  if (ref.kind === "menu") return true;
  const info = index.info.get(ref.id);
  if (!info) return true; // its route could not be read: check it rather than skip it
  if (ref.kind === "term") return info.status === "active" && info.visibility === "public";
  return index.visibility(info) === "open";
}

// ───────────────────────────── the sources ─────────────────────────────

export interface GraphBuiltinSourcesOptions {
  /** The tick's driver (metered: every statement counts against the tick's budget). */
  readonly sql: SqlDriver;
  readonly blobs: BlobStore;
  readonly inputs?: BuiltinInputs | undefined;
  /** Live bodies one step may read from the blob store (nodes changed since publishing). Default 40. */
  readonly maxBlobReads?: number | undefined;
}

const lastSegment = (p: string) => p.slice(p.lastIndexOf("/") + 1);

/** `BuiltinSources` over the site graph's tables (see the module comment). */
export function graphBuiltinSources(o: GraphBuiltinSourcesOptions): BuiltinSources {
  const { sql, blobs } = o;
  const maxBlobs = o.maxBlobReads ?? 40;
  const schedules = new SqlScheduleStore(sql);
  const indexFor = async (siteId: string, now: Date, budget: BlobBudget) => {
    const live = await readLive(sql, siteId);
    return live ? liveIndex(sql, blobs, live, now.getTime(), budget) : undefined;
  };

  const sources: BuiltinSources = {
    // live + routes + one page of bodies: 3 statements
    async scanLinks({ siteId, after, limit, now }) {
      const budget = { left: maxBlobs };
      const index = await indexFor(siteId, now, budget);
      if (!index) return undefined;
      const refs = index.live.refs
        .filter((r) => SCANNED_KINDS.has(r.kind) && (after === undefined || r.id > after))
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      const pageRefs = refs.slice(0, limit);
      if (pageRefs.length === 0) return { scanned: 0, links: 0, findings: [] };
      const rows = await sql.all<{ id: string; hash: string; body: string }>(
        "SELECT id, hash, body FROM nodes WHERE site_id = ? AND id IN (SELECT value FROM json_each(?))",
        [siteId, JSON.stringify(pageRefs.map((r) => r.id))],
      );
      const bodies = new Map(rows.map((r) => [r.id, r]));
      const hosts = index.hosts();
      let scanned = 0;
      let links = 0;
      const findings: LinkFinding[] = [];
      for (const ref of pageRefs) {
        // Only what readers see: a draft, an embargoed or expired node, a hidden term links nowhere.
        if (!shown(index, ref)) continue;
        const row = bodies.get(ref.id);
        // The live body: the working row when unchanged, else the blob (over the step's blob
        // budget, the working copy stands in, as it does for routes).
        const body: unknown =
          row && row.hash === ref.hash
            ? JSON.parse(row.body)
            : ((await liveBody(blobs, ref, budget)) ?? (row ? JSON.parse(row.body) : undefined));
        if (!body) continue;
        scanned++;
        const r = checkNode(index, ref, body, hosts);
        links += r.links;
        findings.push(...r.findings);
      }
      const last = pageRefs[pageRefs.length - 1]?.id;
      return {
        scanned,
        links,
        findings,
        ...(refs.length > pageRefs.length && last ? { next: last } : {}),
      };
    },

    // live + routes + the analytics query (its own reads)
    ...(o.inputs?.notFound
      ? {
          async notFoundPaths({ siteId, now, limit }) {
            const notFound = o.inputs?.notFound as NonNullable<BuiltinInputs["notFound"]>;
            const to = canonicalInstant(now);
            const from = canonicalInstant(now.getTime() - 7 * DAY_MS);
            const rows = await notFound({ siteId, from, to, limit: 1000 });
            if (!rows) return undefined;
            const groups = new Map<
              string,
              {
                path: string;
                status: number;
                hits: number;
                refs: Map<string, number>;
                lastSeen: string | null;
              }
            >();
            for (const r of rows) {
              const key = `${r.status} ${r.path}`;
              const g = groups.get(key) ?? {
                path: r.path,
                status: r.status,
                hits: 0,
                refs: new Map<string, number>(),
                lastSeen: null,
              };
              g.hits += r.hits;
              if (r.refPath) g.refs.set(r.refPath, (g.refs.get(r.refPath) ?? 0) + r.hits);
              if (r.lastSeen && (!g.lastSeen || r.lastSeen > g.lastSeen)) g.lastSeen = r.lastSeen;
              groups.set(key, g);
            }
            const top = [...groups.values()]
              .sort((a, b) => b.hits - a.hits || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
              .slice(0, limit);
            if (top.length === 0) return [];
            const index = await indexFor(siteId, now, { left: maxBlobs });
            const candidates = index
              ? [
                  ...[...index.info.values()]
                    .filter((i) => i.kind === "page" && i.path && index.visibility(i) === "open")
                    .map((i) => ({
                      path: i.path as string,
                      nodeId: i.id,
                      segment: lastSegment(i.path as string),
                    })),
                  ...index.entries().map((i) => ({
                    path: entryPathOf(index.live.site, i),
                    nodeId: i.id,
                    segment: i.slug as string,
                  })),
                ]
              : [];
            return top.map((g): NotFoundRow => {
              let segment = lastSegment(normalisePath(g.path));
              try {
                segment = decodeURIComponent(segment);
              } catch {
                // keep it encoded
              }
              const similar = segment
                ? candidates.find((c) => c.segment === segment.toLowerCase() && c.path !== g.path)
                : undefined;
              return {
                path: g.path.slice(0, 2048),
                status: g.status,
                hits: g.hits,
                linkedFrom: [...g.refs.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 5)
                  .map(([p]) => p.slice(0, 2048)),
                lastSeen: g.lastSeen,
                ...(similar
                  ? {
                      proposal: {
                        path: similar.path,
                        nodeId: similar.nodeId,
                        reason: "similar" as const,
                      },
                    }
                  : {}),
              };
            });
          },
        }
      : {}),

    // live + one page of entry rows: 2 statements
    async staleEntries({ siteId, cutoff, after, limit, now }) {
      const live = await readLive(sql, siteId);
      if (!live) return undefined;
      const rows = await sql.all<{
        id: string;
        hash: string;
        title: string | null;
        collection: string | null;
        slug: string | null;
        status: string | null;
        updated_at: string | null;
        gate_from: string | null;
        gate_until: string | null;
      }>(
        `SELECT id, hash, json_extract(body, '$.title') AS title, json_extract(body, '$.collection') AS collection,
           json_extract(body, '$.slug') AS slug, json_extract(body, '$.status') AS status,
           json_extract(body, '$.updatedAt') AS updated_at,
           json_extract(body, '$.availability.from') AS gate_from, json_extract(body, '$.availability.until') AS gate_until
         FROM nodes WHERE site_id = ? AND kind = 'contentEntry' AND id > ? ORDER BY id LIMIT ?`,
        [siteId, after ?? "", limit],
      );
      const t = now.getTime();
      const stale: StaleEntryFinding[] = [];
      for (const r of rows) {
        // Live and visible now; a working copy edited since (a newer `updatedAt`) is being worked on.
        if (!live.byId.has(r.id) || r.status !== "published" || !r.updated_at) continue;
        const availability = {
          ...(r.gate_from ? { from: r.gate_from } : {}),
          ...(r.gate_until ? { until: r.gate_until } : {}),
        };
        if (gateState({ availability }, t) !== "open") continue;
        if (!(r.updated_at < cutoff)) continue;
        stale.push({
          code: "stale-entry",
          severity: "info",
          nodeId: r.id,
          title: r.title ?? r.id,
          path: entryPathOf(live.site, r),
          updatedAt: r.updated_at,
          ageDays: Math.floor((t - Date.parse(r.updated_at)) / DAY_MS),
        });
      }
      const next = rows.length === limit ? rows[rows.length - 1]?.id : undefined;
      return { scanned: rows.length, stale, ...(next ? { next } : {}) };
    },

    // live + routes: 2 statements
    async feedExpectations({ siteId, now, newest }) {
      const index = await indexFor(siteId, now, { left: maxBlobs });
      if (!index) return undefined;
      const entries = index
        .entries()
        .sort((a, b) =>
          (b.publishedAt ?? "") < (a.publishedAt ?? "")
            ? -1
            : (b.publishedAt ?? "") > (a.publishedAt ?? "")
              ? 1
              : a.id < b.id
                ? -1
                : 1,
        )
        .slice(0, newest);
      const gated: FeedExpectations["gated"][number][] = [];
      for (const i of index.info.values()) {
        if (i.kind !== "page" && i.kind !== "contentEntry") continue;
        const v = index.visibility(i);
        if (v !== "embargoed" && v !== "expired") continue;
        const path = i.kind === "page" ? i.path : entryPathOf(index.live.site, i);
        if (path) gated.push({ nodeId: i.id, path, state: v });
      }
      return {
        now: canonicalInstant(now),
        newest: entries.map((e) => ({
          nodeId: e.id,
          path: entryPathOf(index.live.site, e),
          title: e.title ?? e.id,
        })),
        gated,
        mediaPrefixes: [...index.mediaPrefixes],
      };
    },

    ...(o.inputs?.fetchDocument ? { fetchDocument: o.inputs.fetchDocument } : {}),

    // the schedule tables (3) + live + routes: 5 statements
    async digest({ siteId, automationId, now }) {
      const t = now.getTime();
      const window = {
        from: canonicalInstant(t - 7 * DAY_MS),
        now: canonicalInstant(t),
        to: canonicalInstant(t + 7 * DAY_MS),
      };
      const data = await schedules.digestData(siteId, automationId, window);
      const index = await indexFor(siteId, now, { left: maxBlobs });
      const published: DigestItem[] = [];
      const scheduled: DigestItem[] = [];
      const attention: DigestItem[] = [];
      for (const r of data.releases) {
        const item: DigestItem = { id: r.id, title: r.title ?? r.id, at: r.at, state: r.state };
        (r.section === "published"
          ? published
          : r.section === "scheduled"
            ? scheduled
            : attention
        ).push(item);
      }
      if (index) {
        for (const i of index.info.values()) {
          if (i.kind !== "contentEntry" && i.kind !== "page") continue;
          const v = index.visibility(i);
          if (
            i.kind === "contentEntry" &&
            v === "open" &&
            i.publishedAt &&
            i.publishedAt >= window.from &&
            i.publishedAt < window.now
          )
            published.push({
              id: i.id,
              title: i.title ?? i.id,
              at: i.publishedAt,
              state: "published",
            });
          if (v === "embargoed" && i.from && i.from < window.to)
            scheduled.push({ id: i.id, title: i.title ?? i.id, at: i.from, state: "embargo" });
        }
      }
      const byAt = (a: DigestItem, b: DigestItem) =>
        (a.at ?? "") < (b.at ?? "") ? -1 : (a.at ?? "") > (b.at ?? "") ? 1 : a.id < b.id ? -1 : 1;
      published.sort((a, b) => byAt(b, a));
      scheduled.sort(byAt);
      attention.sort((a, b) => byAt(b, a));
      if (data.overlaps > 0)
        attention.push({
          id: "overlaps",
          title: `${data.overlaps} node${data.overlaps === 1 ? " is" : "s are"} in two pending releases`,
          state: "overlap",
        });
      const open: DigestItem[] = [];
      let openCount = 0;
      for (const a of data.automations) {
        const counts = openFindings(a.counts);
        const n = Object.values(counts).reduce((x, y) => x + y, 0);
        if (n === 0) continue;
        openCount += n;
        open.push({
          id: a.id,
          title: a.name,
          state: a.job,
          counts,
          ...(a.endedAt ? { at: a.endedAt } : {}),
        });
      }
      const section = (items: DigestItem[], count = items.length) => ({
        count,
        items: items.slice(0, DIGEST_ITEMS),
      });
      const digest: WeeklyDigest = {
        siteId,
        ...window,
        published: section(published),
        scheduled: section(scheduled),
        attention: section(
          attention,
          attention.length - (data.overlaps > 0 ? 1 : 0) + data.overlaps,
        ),
        openFindings: section(open, openCount),
      };
      return digest;
    },

    // one batch of 10 statements
    async cleanup({ siteId, now, limit }) {
      return schedules.cleanupSite(siteId, canonicalInstant(now), { limit });
    },

    // one read
    async staleDrafts({ siteId, now, days, limit }) {
      const cutoff = canonicalInstant(now.getTime() - days * DAY_MS);
      const rows = await sql.all<{
        id: string;
        kind: "page" | "contentEntry";
        title: string | null;
        updated_at: string;
        total: number;
      }>(
        `SELECT id, kind, json_extract(body, '$.title') AS title, json_extract(body, '$.updatedAt') AS updated_at,
           COUNT(*) OVER () AS total
         FROM nodes WHERE site_id = ? AND kind IN ('page', 'contentEntry')
           AND json_extract(body, '$.status') IN ('draft', 'review') AND json_extract(body, '$.updatedAt') < ?
         ORDER BY updated_at, id LIMIT ?`,
        [siteId, cutoff, limit],
      );
      const t = now.getTime();
      const drafts: StaleDraftFinding[] = rows.map((r) => ({
        code: "stale-draft",
        severity: "info",
        nodeId: r.id,
        nodeKind: r.kind,
        title: r.title ?? r.id,
        updatedAt: r.updated_at,
        ageDays: Math.floor((t - Date.parse(r.updated_at)) / DAY_MS),
      }));
      return { count: Number(rows[0]?.total ?? 0), drafts };
    },
  };
  return sources;
}

/** The built-in jobs over the site graph: the runner `runScheduledTick` steps by default. */
export function graphBuiltinRunner(
  o: GraphBuiltinSourcesOptions & BuiltinRunnerOptions,
): BuiltinRunner {
  return createBuiltinRunner(graphBuiltinSources(o), o);
}
