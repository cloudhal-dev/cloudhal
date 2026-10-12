/**
 * Navigation menu tools (RFC-0003 §6). Reading menus is `site:read`; every write (`update_menu`,
 * `set_menu`, `delete_menu`) is `site:write` and waits for a person in every mode except local
 * `bypass`. Targets are resolved from ids or handles ("/about", "posts/hello-world",
 * "category:news") before anyone is asked, the tree is validated and the delta computed, so a call
 * that cannot succeed fails before approval. Each write is one store CAS and exactly one snapshot.
 */
import { type LookupData, menuLookup } from "@cloudhal/astro-renderer/navigation";
import type { Menu, MenuItem, Site } from "@cloudhal/core-contracts";
import { MenuSchema, SnapshotSchema } from "@cloudhal/core-contracts";
import type { SnapshotDiff } from "@cloudhal/core-ts";
import { ID_PREFIX, newId } from "@cloudhal/core-ts";
import {
  applyMenuOps,
  buildMenuItems,
  countMenuItems,
  defaultMaxDepth,
  type ItemInput,
  indexMenu,
  isMenuHref,
  MENU_LIMITS,
  MENU_MAX_OPS,
  type MenuDelta,
  type MenuHiddenReason,
  type MenuLookup,
  type MenuOp,
  menuDelta,
  menuStateChanges,
  type ResolvedMenu,
  type ResolvedMenuItem,
  resolveMenu,
  type TargetInput,
  validateMenuTree,
} from "@cloudhal/core-ts/menu";
import {
  autoSnapshot,
  id,
  type JsonSchema,
  obj,
  quote,
  requireSite,
  SLUG_PATTERN,
  str,
  strip,
  type ToolContext,
  type ToolDefinition,
  ToolError,
  toToolError,
} from "./common.ts";

const MENU = strip(MenuSchema);
const SNAPSHOT = strip(SnapshotSchema);

const READ = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;
const WRITE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;

/** Where the blog theme shows the well-known menus (prompts name them). */
const PLACES: Record<string, string> = { primary: "Header", footer: "Footer", sidebar: "Sidebar" };
const WELL_KNOWN = ["primary", "footer"] as const;

const MENU_KEY = str(
  "Menu key: primary (header), footer, or sidebar (docs); other slugs work too",
  {
    pattern: SLUG_PATTERN,
    maxLength: 128,
  },
);
const LOCALE = { type: "string", pattern: "^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$" };
const LABELS = {
  type: "object",
  description:
    "Label per locale (plain text, 1–100 characters). Page, article and term items may omit it: they show the target's title. Collection, URL and group items need one in the site's default locale.",
  propertyNames: LOCALE,
  additionalProperties: { type: "string", minLength: 1, maxLength: 100 },
  maxProperties: 20,
};
const TARGET = {
  type: "object",
  additionalProperties: false,
  required: ["kind"],
  description:
    'What the item links to. page: ref = page id or path ("/about"); contentEntry: ref = entry id or "<collection>/<slug>"; term: ref = term id or "<taxonomy>:<slug or name>" ("category:news"); collection: the collection\'s index; url: an external https link (shown with its host to the approver); group: a label holding children.',
  properties: {
    kind: { type: "string", enum: ["page", "contentEntry", "term", "collection", "url", "group"] },
    ref: str("page, contentEntry, term: an id or a handle", { minLength: 1, maxLength: 300 }),
    collection: str("collection: its slug, e.g. posts", { pattern: SLUG_PATTERN }),
    href: str("url: https://…", { maxLength: 2048 }),
  },
};
const ITEM_INPUT: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["target"],
  properties: {
    id: { ...id, description: "set_menu: keep this existing item's id (its identity in diffs)" },
    target: TARGET,
    labels: LABELS,
    newTab: { type: "boolean", description: "url items only: open in a new tab" },
    children: { type: "array", items: { $ref: "#/$defs/MenuItemInput" }, maxItems: 100 },
  },
};
const DEFS = { MenuItemInput: ITEM_INPUT };
const OP = {
  type: "object",
  additionalProperties: false,
  required: ["op"],
  properties: {
    op: { type: "string", enum: ["add", "remove", "move", "update"] },
    item: { $ref: "#/$defs/MenuItemInput" },
    itemId: { ...id, description: "remove, move, update: the item (get_menu ids)" },
    parent: {
      type: ["string", "null"],
      description: "add, move: parent item id; null or absent = top level",
    },
    index: {
      type: "integer",
      minimum: 0,
      description: "add, move: 0-based position; absent = last",
    },
    labels: {
      ...LABELS,
      description: "update: labels to set; null removes a locale's label",
      additionalProperties: { type: ["string", "null"], minLength: 1, maxLength: 100 },
    },
    target: TARGET,
    newTab: { type: ["boolean", "null"], description: "update: url items only; null clears" },
  },
};
const DELTA_OUT = obj(
  {
    added: { type: "integer" },
    removed: { type: "integer" },
    moved: { type: "integer" },
    changed: { type: "integer" },
    items: { type: "integer", description: "Items in the menu after the write" },
  },
  ["added", "removed", "moved", "changed", "items"],
);
const RESOLVED_ITEM: JsonSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    kind: { type: "string" },
    state: { type: "string", enum: ["shown", "hidden"] },
    reason: { type: "string" },
    label: { type: "string" },
    labelSource: { type: "string", enum: ["item", "default-locale", "target", "none"] },
    href: { type: "string" },
    children: { type: "array", items: { $ref: "#/$defs/ResolvedMenuItem" } },
  },
  required: ["id", "kind", "state", "label", "labelSource", "children"],
};

// ───────────────────────────── resolution ─────────────────────────────

const ID_RE = /^[a-z]+_[A-Za-z0-9]{6,32}$/;

interface RawTarget {
  kind: string;
  ref?: string;
  collection?: string;
  href?: string;
}
interface RawItem {
  id?: string;
  target: RawTarget;
  labels?: Record<string, string>;
  newTab?: boolean;
  children?: RawItem[];
}
interface RawOp {
  op: MenuOp["op"];
  item?: RawItem;
  itemId?: string;
  parent?: string | null;
  index?: number;
  labels?: Record<string, string | null>;
  target?: RawTarget;
  newTab?: boolean | null;
}

/** Resolves a target handle to an id of a linkable node of this site (invariant 9, before approval). */
async function resolveTarget(
  ctx: ToolContext,
  site: Site,
  t: RawTarget,
): Promise<TargetInput | { kind: "group" }> {
  const need = (field: string, value: string | undefined) => {
    if (!value) throw new ToolError("invalid", `${t.kind} targets need "${field}"`);
    return value;
  };
  const unknown = (what: string) =>
    new ToolError(
      "unknown_target",
      `${what} is not in this site; list_pages, list_entries or list_terms show what is`,
    );
  switch (t.kind) {
    case "group":
      return { kind: "group" };
    case "collection": {
      const c = need("collection", t.collection);
      if (!new RegExp(SLUG_PATTERN).test(c))
        throw new ToolError("invalid", `"${c}" is not a collection slug`);
      return { kind: "collection", collection: c };
    }
    case "url": {
      const href = need("href", t.href);
      if (!isMenuHref(href))
        throw new ToolError(
          "invalid_menu",
          `external links must be https:// with an ASCII host (punycode for international names), no user-info, whitespace or backslashes; link this site's pages, articles and terms by kind and ref instead (got "${quote(href, 80)}")`,
        );
      return { kind: "url", href };
    }
    case "page": {
      const ref = need("ref", t.ref);
      if (ID_RE.test(ref)) {
        const page = await ctx.store.getPage(ref);
        if (!page || page.siteId !== site.id) throw unknown(`page ${ref}`);
        return { kind: "page", ref };
      }
      const pages = (await ctx.store.listPages(site.id)).filter((p) => p.path === ref);
      const page = pages.find((p) => p.locale === site.defaultLocale) ?? pages[0];
      if (!page) throw unknown(`page "${quote(ref, 80)}"`);
      return { kind: "page", ref: page.id };
    }
    case "contentEntry": {
      const ref = need("ref", t.ref);
      if (ID_RE.test(ref)) {
        const entry = await ctx.store.getContentEntry(ref);
        if (!entry || entry.siteId !== site.id) throw unknown(`article ${ref}`);
        return { kind: "contentEntry", ref };
      }
      const m = /^\/?([a-z0-9]+(?:-[a-z0-9]+)*)\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(ref);
      if (!m)
        throw new ToolError(
          "invalid",
          `article refs are ids or "<collection>/<slug>" (got "${quote(ref, 80)}")`,
        );
      const entries = (
        await ctx.store.listContentEntries(site.id, { collection: m[1] as string })
      ).filter((e) => e.slug === m[2]);
      const entry = entries.find((e) => e.locale === site.defaultLocale) ?? entries[0];
      if (!entry) throw unknown(`article "${quote(ref, 80)}"`);
      return { kind: "contentEntry", ref: entry.id };
    }
    case "term": {
      const ref = need("ref", t.ref);
      let termId: string | undefined;
      if (ID_RE.test(ref)) termId = ref;
      else {
        const at = ref.indexOf(":");
        if (at < 1)
          throw new ToolError(
            "invalid",
            `term refs are ids or "<taxonomy>:<slug or name>", e.g. category:news (got "${quote(ref, 80)}")`,
          );
        const key = ref.slice(0, at);
        if (!(await ctx.store.getTaxonomyByKey(site.id, key)))
          throw new ToolError(
            "unknown_taxonomy",
            `this site has no taxonomy "${key}"; call list_taxonomies`,
          );
        const [r] = await ctx.store.resolveTerms(site.id, key, [ref.slice(at + 1)]);
        if (!r?.matched) {
          const hints = (r?.suggestions ?? []).map((s) => `${s.slug} (${s.termId})`).join(", ");
          throw new ToolError(
            r?.reason === "ambiguous" ? "ambiguous_term" : "unknown_term",
            `${key} "${quote(ref.slice(at + 1), 60)}" ${r?.reason === "ambiguous" ? "matches several terms" : "matches no term"}${hints ? `; candidates: ${hints}` : ""}; pass the term id`,
          );
        }
        termId = r.termId;
      }
      const term = await ctx.store.getTerm(termId);
      if (!term || term.siteId !== site.id) throw unknown(`term ${termId}`);
      if (term.status === "retired")
        throw new ToolError(
          "unknown_target",
          `term ${term.slug} is retired; link the term that replaced it (resolve_terms)`,
        );
      return { kind: "term", ref: term.id };
    }
    default:
      throw new ToolError("invalid", `unknown target kind "${t.kind}"`);
  }
}

async function resolveItem(ctx: ToolContext, site: Site, raw: RawItem): Promise<ItemInput> {
  return {
    ...(raw.id ? { id: raw.id } : {}),
    target: await resolveTarget(ctx, site, raw.target),
    ...(raw.labels ? { labels: raw.labels } : {}),
    ...(raw.newTab !== undefined ? { newTab: raw.newTab } : {}),
    ...(raw.children?.length
      ? { children: await Promise.all(raw.children.map((c) => resolveItem(ctx, site, c))) }
      : {}),
  };
}

async function resolveOps(ctx: ToolContext, site: Site, raw: RawOp[]): Promise<MenuOp[]> {
  const out: MenuOp[] = [];
  for (const [i, op] of raw.entries()) {
    const at = (e: unknown) => {
      const err = toToolError(e);
      if (err instanceof ToolError)
        return new ToolError(err.code, `operation ${i}: ${err.message}`, {
          ...err.details,
          opIndex: i,
        });
      return err;
    };
    try {
      switch (op.op) {
        case "add":
          if (!op.item) throw new ToolError("invalid", "add needs an item");
          out.push({
            op: "add",
            item: await resolveItem(ctx, site, op.item),
            ...(op.parent !== undefined ? { parent: op.parent } : {}),
            ...(op.index !== undefined ? { index: op.index } : {}),
          });
          break;
        case "remove":
        case "move":
        case "update": {
          if (!op.itemId) throw new ToolError("invalid", `${op.op} needs an itemId`);
          if (op.op === "remove") out.push({ op: "remove", itemId: op.itemId });
          else if (op.op === "move")
            out.push({
              op: "move",
              itemId: op.itemId,
              ...(op.parent !== undefined ? { parent: op.parent } : {}),
              ...(op.index !== undefined ? { index: op.index } : {}),
            });
          else {
            const target = op.target ? await resolveTarget(ctx, site, op.target) : undefined;
            if (target?.kind === "group")
              throw new ToolError(
                "invalid",
                "an item cannot become a group; add a group and move the items under it",
              );
            out.push({
              op: "update",
              itemId: op.itemId,
              ...(op.labels ? { labels: op.labels } : {}),
              ...(target ? { target } : {}),
              ...(op.newTab !== undefined ? { newTab: op.newTab } : {}),
            });
          }
          break;
        }
        default:
          throw new ToolError("invalid", `unknown operation "${String(op.op)}"`);
      }
    } catch (e) {
      throw at(e);
    }
  }
  return out;
}

const newItemId = () => newId(ID_PREFIX.menuItem);

/** The menu a write starts from: the stored one (its `rev` must match) or a new empty one. */
async function baseMenu(
  ctx: ToolContext,
  site: Site,
  key: string,
  rev: number | undefined,
  create: { maxDepth?: number } | undefined,
  tool: string,
): Promise<{ existing?: Menu; base: Menu }> {
  const existing = await ctx.store.getMenuByKey(site.id, key);
  if (existing) {
    if (rev === undefined)
      throw new ToolError(
        "conflict",
        `menu "${key}" exists (rev ${existing.rev}); send its rev (get_menu)`,
      );
    if (existing.rev !== rev)
      throw new ToolError(
        "conflict",
        `menu "${key}" is at rev ${existing.rev}, you sent ${rev}; reload (get_menu) and retry`,
      );
    return { existing, base: existing };
  }
  if (!create)
    throw new ToolError(
      "not_found",
      `this site has no "${key}" menu (it shows the theme's derived default); ${tool === "update_menu" ? "pass create: {} to create it" : "omit rev to create it"}`,
    );
  const ts = new Date(0).toISOString();
  return {
    base: {
      schemaVersion: 1,
      id: "menu_pending0",
      siteId: site.id,
      key,
      maxDepth: create.maxDepth ?? defaultMaxDepth(key),
      items: [],
      rev: 0,
      createdAt: ts,
      updatedAt: ts,
    },
  };
}

interface Planned {
  site: Site;
  existing?: Menu;
  next: Menu;
  delta: MenuDelta;
}

async function plan(ctx: ToolContext, tool: string, a: Record<string, unknown>): Promise<Planned> {
  const site = await requireSite(ctx, a.siteId as string);
  const key = a.key as string;
  try {
    if (tool === "update_menu") {
      const ops = (a.ops as RawOp[] | undefined) ?? [];
      if (ops.length === 0 || ops.length > MENU_MAX_OPS)
        throw new ToolError("invalid", `send 1–${MENU_MAX_OPS} operations`);
      const { existing, base } = await baseMenu(
        ctx,
        site,
        key,
        a.rev as number | undefined,
        a.create as { maxDepth?: number } | undefined,
        tool,
      );
      const resolved = await resolveOps(ctx, site, ops);
      const next = applyMenuOps(base, resolved, newItemId, site);
      validateMenuTree(next, site, existing);
      return { site, ...(existing ? { existing } : {}), next, delta: menuDelta(existing, next) };
    }
    // set_menu
    const rev = a.rev as number | undefined;
    const { existing, base } = await baseMenu(
      ctx,
      site,
      key,
      rev,
      rev === undefined
        ? { ...(a.maxDepth !== undefined ? { maxDepth: a.maxDepth as number } : {}) }
        : undefined,
      tool,
    );
    const raw = (a.items as RawItem[] | undefined) ?? [];
    const inputs = await Promise.all(raw.map((r) => resolveItem(ctx, site, r)));
    const next: Menu = {
      ...base,
      ...(a.maxDepth !== undefined ? { maxDepth: a.maxDepth as number } : {}),
      items: buildMenuItems(inputs, newItemId),
    };
    validateMenuTree(next, site, existing);
    return { site, ...(existing ? { existing } : {}), next, delta: menuDelta(existing, next) };
  } catch (e) {
    throw toToolError(e);
  }
}

/** A lookup over the site's current nodes, as the next publish would serve them. */
async function currentData(ctx: ToolContext, site: Site): Promise<LookupData> {
  const [pages, entries, taxonomies, terms] = await Promise.all([
    ctx.store.listPages(site.id),
    ctx.store.listContentEntries(site.id),
    ctx.store.listTaxonomies(site.id),
    ctx.store.listTerms(site.id),
  ]);
  return { site, pages, entries, taxonomies, terms };
}

// ───────────────────────────── prompt (§6.3) ─────────────────────────────

const REASON_TEXT: Record<MenuHiddenReason, (kind: string) => string> = {
  missing: (k) => `its ${k} was deleted`,
  unpublished: (k) => `its ${k} is not published`,
  "other-locale": (k) => `its ${k} is in another locale`,
  "not-served": () => "its archive is not served (no published posts, not public, or archives off)",
  retired: () => "its term is retired",
  "no-index": () => "no page lists that collection",
  "empty-group": () => "none of its items is shown",
  "parent-hidden": () => "an item above it is hidden",
};
const KIND_WORD: Record<string, string> = {
  page: "page",
  contentEntry: "article",
  term: "term",
  collection: "collection",
  url: "link",
  group: "group",
};

function flatResolved(
  items: readonly ResolvedMenuItem[],
  out = new Map<string, ResolvedMenuItem>(),
) {
  for (const i of items) {
    out.set(i.id, i);
    flatResolved(i.children, out);
  }
  return out;
}

/** `"About"`, or `"About" (title)` when the label falls back to the target's title. */
function shownLabel(r: ResolvedMenuItem | undefined, fallbackId: string): string {
  if (!r?.label) return fallbackId;
  return `"${quote(r.label, 50)}"${r.labelSource === "target" ? " (title)" : ""}`;
}

/** Where an item links, for a person: path and kind, or the external host. */
function where(item: MenuItem, lookup: MenuLookup, locale: string): string {
  switch (item.kind) {
    case "page": {
      const p = lookup.page(item.pageId);
      return `${p?.path ?? item.pageId} (page)`;
    }
    case "contentEntry": {
      const e = lookup.entry(item.entryId);
      return `${e?.path ?? item.entryId} (article)`;
    }
    case "term": {
      const t = lookup.term(item.termId, locale);
      return t
        ? `${t.path ?? "no archive"} (term "${quote(t.name, 40)}")`
        : `${item.termId} (term)`;
    }
    case "collection":
      return `${lookup.collectionIndex(item.collection, locale) ?? "no index"} (collection ${item.collection})`;
    case "url": {
      let host = "?";
      try {
        host = new URL(item.href).host;
      } catch {}
      return `${quote(item.href, 50)} (external: ${host}${item.newTab ? ", new tab" : ""})`;
    }
    case "group":
      return "(group)";
  }
}

function targetText(item: MenuItem, lookup: MenuLookup, locale: string): string {
  switch (item.kind) {
    case "page":
      return `page "${quote(lookup.page(item.pageId)?.title ?? item.pageId, 40)}"`;
    case "contentEntry":
      return `article "${quote(lookup.entry(item.entryId)?.title ?? item.entryId, 40)}"`;
    case "term":
      return `term "${quote(lookup.term(item.termId, locale)?.name ?? item.termId, 40)}"`;
    case "collection":
      return `collection ${item.collection}`;
    case "url":
      return where(item, lookup, locale);
    case "group":
      return "group";
  }
}

const MAX_LINES = 20;

/** The approval prompt of a menu write, in the RFC-0003 §6.3 format. */
export async function menuPrompt(ctx: ToolContext, p: Planned, tool: string): Promise<string> {
  const { site, existing, next, delta } = p;
  const locale = site.defaultLocale;
  const lookup = menuLookup(await currentData(ctx, site));
  const before = existing ? resolveMenu(existing, lookup, locale) : undefined;
  const after = resolveMenu({ ...next, id: existing?.id ?? "menu_pending0" }, lookup, locale);
  const was = before ? flatResolved(before.items) : new Map<string, ResolvedMenuItem>();
  const now = flatResolved(after.items);
  const oldIndex = indexMenu(existing?.items ?? []);
  const newIndex = indexMenu(next.items);
  const place = PLACES[next.key] ? ` (${PLACES[next.key]})` : "";
  const label = (id: string) => shownLabel(now.get(id) ?? was.get(id), id);
  const parentText = (parentId: string | undefined) =>
    parentId ? `under ${label(parentId)}` : "top level";
  const lines: string[] = [];
  for (const a of delta.added) {
    const item = newIndex.get(a.id)?.item as MenuItem;
    lines.push(
      `+ ${label(a.id)} → ${where(item, lookup, locale)}, ${parentText(a.parentId)}, position ${a.index + 1}${a.descendants ? `, with ${a.descendants} item${a.descendants === 1 ? "" : "s"} below it` : ""}`,
    );
  }
  for (const r of delta.removed) {
    const item = oldIndex.get(r.id)?.item as MenuItem;
    lines.push(
      r.descendants
        ? `− ${shownLabel(was.get(r.id), r.id)} and ${r.descendants} item${r.descendants === 1 ? "" : "s"} below it`
        : `− ${shownLabel(was.get(r.id), r.id)} → ${where(item, lookup, locale)}`,
    );
  }
  for (const m of delta.moved)
    lines.push(
      m.reparented
        ? `↳ ${label(m.id)} moved ${parentText(m.to.parentId)} (was ${m.from.parentId ? `under ${label(m.from.parentId)}` : "top level"})`
        : `↕ ${label(m.id)}: position ${m.from.index + 1} → ${m.to.index + 1}`,
    );
  for (const c of delta.changed) {
    for (const l of c.labels ?? [])
      lines.push(
        `~ ${label(c.id)}: label [${l.locale}] ${l.from !== undefined ? `"${quote(l.from, 40)}"` : "(none)"} → ${l.to !== undefined ? `"${quote(l.to, 40)}"` : "(none)"}`,
      );
    if (c.target)
      lines.push(
        `~ ${label(c.id)}: target ${targetText(c.target.from, lookup, locale)} → ${targetText(c.target.to, lookup, locale)}`,
      );
    if (c.newTab)
      lines.push(
        `~ ${label(c.id)}: ${c.newTab.to ? "opens in a new tab" : "opens in the same tab"}`,
      );
  }
  // Items this write adds or edits that the site will not show (yet).
  const touched = new Set([...delta.added.map((x) => x.id), ...delta.changed.map((x) => x.id)]);
  for (const id of touched) {
    const r = now.get(id);
    if (r?.state === "hidden" && r.reason)
      lines.push(
        `! ${label(id)} stays hidden: ${REASON_TEXT[r.reason](KIND_WORD[r.kind] ?? r.kind)}`,
      );
  }
  const shown = lines.slice(0, MAX_LINES);
  if (lines.length > MAX_LINES) shown.push(`… and ${lines.length - MAX_LINES} more`);
  const head =
    tool === "delete_menu"
      ? ""
      : existing
        ? `Change menu "${next.key}"${place}: ${delta.changes} change${delta.changes === 1 ? "" : "s"}, ${delta.before} → ${delta.after} items. It goes live with the next publish.`
        : `Create menu "${next.key}"${place} with ${delta.after} item${delta.after === 1 ? "" : "s"} (maxDepth ${next.maxDepth}); it replaces the theme's derived ${place ? place.slice(2, -1).toLowerCase() : "menu"} with the next publish.`;
  return shown.length ? `${head}\n${shown.join("\n")}` : head;
}

/** The audit row's `input.effect` (counts and item ids, no labels). */
function effect(key: string, delta: MenuDelta, created: boolean) {
  return {
    menu: {
      key,
      ...(created ? { created: true } : {}),
      added: delta.added.map((x) => x.id),
      removed: delta.removed.map((x) => x.id),
      moved: delta.moved.map((x) => x.id),
      changed: delta.changed.map((x) => x.id),
    },
  };
}

function deltaOut(delta: MenuDelta) {
  return {
    added: delta.added.length,
    removed: delta.removed.length,
    moved: delta.moved.length,
    changed: delta.changed.length,
    items: delta.after,
  };
}

async function write(ctx: ToolContext, tool: string, a: Record<string, unknown>) {
  const p = await plan(ctx, tool, a);
  let menu: Menu;
  try {
    menu = p.existing
      ? await ctx.store.updateMenu({ ...p.next, id: p.existing.id, rev: p.existing.rev })
      : await ctx.store.createMenu({
          siteId: p.site.id,
          key: p.next.key,
          maxDepth: p.next.maxDepth,
          items: p.next.items,
        });
  } catch (e) {
    throw toToolError(e);
  }
  ctx.report?.(effect(menu.key, p.delta, !p.existing));
  const snapshot = await autoSnapshot(ctx, p.site.id, tool, {
    "cloudhal.tool": tool,
    "cloudhal.menu": menu.key,
  });
  return { menu, delta: deltaOut(p.delta), snapshot };
}

// ───────────────────────────── publish and other prompts ─────────────────────────────

/** Nodes of the live snapshot: menus always, the rest only when a menu needs resolving. */
async function liveState(
  ctx: ToolContext,
  site: Site,
  currentIds: ReadonlySet<string>,
): Promise<{ menus: Menu[]; data?: LookupData }> {
  if (!site.publishedSnapshotId) return { menus: [] };
  const snap = await ctx.store.getSnapshot(site.publishedSnapshotId);
  if (!snap) return { menus: [] };
  const read = async <T>(kind: string) =>
    Promise.all(
      snap.nodes
        .filter((n) => (n.kind as string) === kind)
        .map((n) => ctx.store.readSnapshotNode(n)),
    ) as Promise<T[]>;
  const menus = await read<Menu>("menu");
  // Effects are only computed for menus live now and still there; skip the rest of the snapshot
  // when there are none (most publishes of most sites).
  if (!menus.some((m) => currentIds.has(m.id))) return { menus };
  const [[liveSite], pages, entries, taxonomies, terms] = await Promise.all([
    read<Site>("site"),
    read<LookupData["pages"][number]>("page"),
    read<LookupData["entries"][number]>("contentEntry"),
    read<LookupData["taxonomies"][number]>("taxonomy"),
    read<LookupData["terms"][number]>("term"),
  ]);
  return { menus, data: { site: liveSite ?? site, pages, entries, taxonomies, terms } };
}

/**
 * Menu lines of the `publish` prompt (§6.3): the menu effects of other changes — items that become
 * hidden or shown again because a page was deleted, an entry unpublished or a term retired,
 * computed by resolving each menu against the live and the new state — and deleted menus. Each
 * changed menu's own summary (`~ menu "primary" (+2 −1)`) comes from `describeChanges`.
 */
export async function publishMenuLines(ctx: ToolContext, site: Site): Promise<string[]> {
  const current = await ctx.store.listMenus(site.id);
  const live = await liveState(ctx, site, new Set(current.map((m) => m.id)));
  if (current.length === 0 && live.menus.length === 0) return [];
  const locale = site.defaultLocale;
  const lines: string[] = [];
  if (live.data) {
    const newLookup = menuLookup(await currentData(ctx, site));
    const oldLookup = menuLookup(live.data);
    for (const menu of current) {
      const was = live.menus.find((m) => m.id === menu.id);
      if (!was) continue;
      const before: ResolvedMenu = resolveMenu(was, oldLookup, locale);
      const after = resolveMenu(menu, newLookup, locale);
      for (const { item, was: w } of menuStateChanges(before, after)) {
        const label = shownLabel(item.label ? item : w, item.id);
        lines.push(
          item.state === "hidden" && item.reason
            ? `! menu "${menu.key}": ${label} hidden (${REASON_TEXT[item.reason](KIND_WORD[item.kind] ?? item.kind)})`
            : `! menu "${menu.key}": ${label} shown again`,
        );
      }
    }
  }
  for (const was of live.menus)
    if (!current.some((m) => m.id === was.id))
      lines.push(`! menu "${was.key}" deleted: the theme's derived default returns`);
  return lines.length > 10
    ? [...lines.slice(0, 10), `… and ${lines.length - 10} more menu effects`]
    : lines;
}

/** `(+2 −1 ↕1 ~1)` for a changed menu in `describeChanges`. */
export async function menuChangeSummary(
  ctx: ToolContext,
  ref: { id: string },
  before: SnapshotDiff["added"][number] | undefined,
): Promise<string> {
  const now = await ctx.store.getMenu(ref.id);
  if (!now) return "";
  const was = before ? await ctx.store.readSnapshotNode<Menu>(before) : undefined;
  const d = menuDelta(was, now);
  if (!was) return ` (${countMenuItems(now.items)} items)`;
  const parts = [
    d.added.length ? `+${d.added.length}` : "",
    d.removed.length ? `−${d.removed.length}` : "",
    d.moved.length ? `↕${d.moved.length}` : "",
    d.changed.length ? `~${d.changed.length}` : "",
  ].filter(Boolean);
  return parts.length ? ` (${parts.join(" ")})` : "";
}

/**
 * For delete prompts: the menu items that will be hidden when `target` goes (invariant 10 — the
 * menu itself is not written).
 */
export async function menuItemsHiddenBy(
  ctx: ToolContext,
  siteId: string,
  target: { kind: "page" | "contentEntry" | "term"; id: string },
): Promise<string> {
  const refs = await ctx.store.menuReferences(siteId, target);
  if (refs.length === 0) return "";
  const parts = refs.map(
    (r) => `${r.itemIds.length} item${r.itemIds.length === 1 ? "" : "s"} in menu "${r.menu.key}"`,
  );
  return ` Menus keep linking it but hide it: ${parts.join(", ")}.`;
}

/**
 * For create results: after a site adopts a `primary` menu, new pages no longer join the header on
 * their own (RFC-0003 compatibility), so say so.
 */
export async function menuHint(
  ctx: ToolContext,
  siteId: string,
  target: { kind: "page" | "contentEntry"; id: string },
): Promise<string | undefined> {
  const primary = await ctx.store.getMenuByKey(siteId, "primary");
  if (!primary) return undefined;
  const refs = await ctx.store.menuReferences(siteId, target);
  if (refs.length > 0) return undefined;
  return `not in any menu: this site has a "primary" menu, so new ${target.kind === "page" ? "pages" : "articles"} do not join the header on their own; use update_menu to add it`;
}

// ───────────────────────────── tools ─────────────────────────────

export function menuTools(): ToolDefinition[] {
  const writeCommon = {
    scopes: ["site:write" as const],
    requiresApproval: true,
  };
  return [
    {
      name: "list_menus",
      title: "List menus",
      description:
        "The site's navigation menus (primary = header, footer, sidebar, custom keys) with id, rev, maxDepth, item count and how many items are hidden on the site. Well-known keys without a menu use the theme's derived default (top-level pages, categories).",
      inputSchema: obj({ siteId: id }, ["siteId"]),
      outputSchema: obj(
        {
          menus: {
            type: "array",
            items: obj(
              {
                id: { type: "string" },
                key: { type: "string" },
                rev: { type: "integer" },
                maxDepth: { type: "integer" },
                items: { type: "integer" },
                hidden: { type: "integer" },
              },
              ["id", "key", "rev", "maxDepth", "items", "hidden"],
            ),
          },
          derived: {
            type: "array",
            items: { type: "string" },
            description: "Well-known keys without a menu (the theme's derived default shows)",
          },
          limits: { type: "object" },
        },
        ["menus", "derived", "limits"],
      ),
      annotations: READ,
      scopes: ["site:read"],
      handler: async (a, ctx) => {
        const site = await requireSite(ctx, a.siteId as string);
        const menus = await ctx.store.listMenus(site.id);
        const lookup = menus.length ? menuLookup(await currentData(ctx, site)) : undefined;
        return {
          menus: menus.map((m) => ({
            id: m.id,
            key: m.key,
            rev: m.rev,
            maxDepth: m.maxDepth,
            items: countMenuItems(m.items),
            hidden: lookup ? resolveMenu(m, lookup, site.defaultLocale).hidden : 0,
          })),
          derived: WELL_KNOWN.filter((k) => !menus.some((m) => m.key === k)),
          limits: { ...MENU_LIMITS, operationsPerCall: MENU_MAX_OPS },
        };
      },
    },
    {
      name: "get_menu",
      title: "Get menu",
      description:
        "One menu: the stored tree (send its rev back when writing) and, per item for a locale, whether the site shows it (`state`), why not (`reason`: missing, unpublished, other-locale, not-served, retired, no-index, empty-group, parent-hidden), the label shown and where it comes from (item, default-locale, target title) and the href. Hidden items are never rendered as dead links.",
      inputSchema: obj(
        {
          siteId: id,
          key: MENU_KEY,
          locale: str("BCP 47 locale; defaults to the site's default", { pattern: LOCALE.pattern }),
        },
        ["siteId", "key"],
      ),
      outputSchema: {
        ...obj(
          {
            menu: MENU,
            locale: { type: "string" },
            items: { type: "array", items: { $ref: "#/$defs/ResolvedMenuItem" } },
            shown: { type: "integer" },
            hidden: { type: "integer" },
          },
          ["menu", "locale", "items", "shown", "hidden"],
        ),
        $defs: { ResolvedMenuItem: RESOLVED_ITEM },
      },
      annotations: READ,
      scopes: ["site:read"],
      handler: async (a, ctx) => {
        const site = await requireSite(ctx, a.siteId as string);
        const menu = await ctx.store.getMenuByKey(site.id, a.key as string);
        if (!menu)
          throw new ToolError(
            "not_found",
            `this site has no "${a.key}" menu; it shows the theme's derived default. update_menu with create: {} (or set_menu without rev) creates one`,
          );
        const locale = (a.locale as string | undefined) ?? site.defaultLocale;
        const resolved = resolveMenu(menu, menuLookup(await currentData(ctx, site)), locale);
        const slim = (items: readonly ResolvedMenuItem[]): unknown[] =>
          items.map(({ external: _e, newTab: _n, target: _t, ...rest }) => ({
            ...rest,
            children: slim(rest.children),
          }));
        return {
          menu,
          locale,
          items: slim(resolved.items),
          shown: resolved.shown,
          hidden: resolved.hidden,
        };
      },
    },
    {
      name: "update_menu",
      title: "Edit menu",
      description:
        'Edit a menu with operations, applied in order and all or nothing: add {item, parent?, index?}, remove {itemId} (with its subtree), move {itemId, parent?, index?}, update {itemId, labels?, target?, newTab?}. Items link pages, articles and terms by id or handle ({kind:"page", ref:"/about"}, {kind:"term", ref:"category:news"}), a collection index, an external https link, or group children. Requires the menu\'s rev; `create: {}` creates the menu when the key is free. Always waits for a person, who sees every change. Snapshots afterwards.',
      inputSchema: {
        ...obj(
          {
            siteId: id,
            key: MENU_KEY,
            rev: { type: "integer", minimum: 0, description: "The menu's current rev (get_menu)" },
            create: obj(
              { maxDepth: { type: "integer", minimum: 1, maximum: MENU_LIMITS.maxDepth } },
              [],
              {
                description:
                  "Create the menu if the key is free (maxDepth: primary 3, footer 2, sidebar 6, others 3)",
              },
            ),
            ops: { type: "array", items: OP, minItems: 1, maxItems: MENU_MAX_OPS },
          },
          ["siteId", "key", "ops"],
        ),
        $defs: DEFS,
      },
      outputSchema: obj({ menu: MENU, delta: DELTA_OUT, snapshot: SNAPSHOT }, [
        "menu",
        "delta",
        "snapshot",
      ]),
      annotations: WRITE,
      ...writeCommon,
      precheck: async (a, ctx) => {
        await plan(ctx, "update_menu", a);
      },
      approvalPrompt: async (a, ctx) =>
        menuPrompt(ctx, await plan(ctx, "update_menu", a), "update_menu"),
      handler: (a, ctx) => write(ctx, "update_menu", a),
    },
    {
      name: "set_menu",
      title: "Replace menu",
      description:
        "Replace a menu's whole tree (or create the menu: omit rev). Items that keep their id keep their identity; items without one get new ids. Same item shape and rules as update_menu. Always waits for a person, who sees the delta. Snapshots afterwards.",
      inputSchema: {
        ...obj(
          {
            siteId: id,
            key: MENU_KEY,
            rev: {
              type: "integer",
              minimum: 0,
              description: "The menu's current rev; omit only to create it",
            },
            maxDepth: { type: "integer", minimum: 1, maximum: MENU_LIMITS.maxDepth },
            items: { type: "array", items: { $ref: "#/$defs/MenuItemInput" }, maxItems: 100 },
          },
          ["siteId", "key", "items"],
        ),
        $defs: DEFS,
      },
      outputSchema: obj({ menu: MENU, delta: DELTA_OUT, snapshot: SNAPSHOT }, [
        "menu",
        "delta",
        "snapshot",
      ]),
      annotations: WRITE,
      ...writeCommon,
      precheck: async (a, ctx) => {
        await plan(ctx, "set_menu", a);
      },
      approvalPrompt: async (a, ctx) => menuPrompt(ctx, await plan(ctx, "set_menu", a), "set_menu"),
      handler: (a, ctx) => write(ctx, "set_menu", a),
    },
    {
      name: "delete_menu",
      title: "Delete menu",
      description:
        "Delete a menu; the site falls back to the theme's derived default for that key (e.g. top-level pages in the header). Destructive: always waits for a person. Snapshots afterwards.",
      inputSchema: obj({ siteId: id, key: MENU_KEY, rev: { type: "integer", minimum: 0 } }, [
        "siteId",
        "key",
        "rev",
      ]),
      outputSchema: obj({ snapshot: SNAPSHOT }, ["snapshot"]),
      annotations: { ...WRITE, destructiveHint: true },
      ...writeCommon,
      precheck: async (a, ctx) => {
        const site = await requireSite(ctx, a.siteId as string);
        await baseMenu(ctx, site, a.key as string, a.rev as number, undefined, "delete_menu");
      },
      approvalPrompt: async (a, ctx) => {
        const site = await requireSite(ctx, a.siteId as string);
        const menu = await ctx.store.getMenuByKey(site.id, a.key as string);
        const place = PLACES[a.key as string];
        return `Delete menu "${a.key as string}"${place ? ` (${place})` : ""} with ${menu ? countMenuItems(menu.items) : 0} items? With the next publish the site shows the theme's derived default there; earlier snapshots keep the menu.`;
      },
      handler: async (a, ctx) => {
        const site = await requireSite(ctx, a.siteId as string);
        const { existing } = await baseMenu(
          ctx,
          site,
          a.key as string,
          a.rev as number,
          undefined,
          "delete_menu",
        );
        try {
          await ctx.store.deleteMenu(existing as Menu);
        } catch (e) {
          throw toToolError(e);
        }
        ctx.report?.({ menu: { key: a.key as string, deleted: true } });
        return {
          snapshot: await autoSnapshot(ctx, site.id, "delete_menu", {
            "cloudhal.tool": "delete_menu",
            "cloudhal.menu": a.key as string,
          }),
        };
      },
    },
  ];
}
