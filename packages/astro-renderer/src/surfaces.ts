/**
 * Surfaces on the page (RFC-0020 §1–§4): a surface section becomes a resolved tree (bindings and
 * named functions applied, visibility evaluated against the initial data, entry sources loaded),
 * then HTML. `renderSurface` gives framework-free markup for previews and themes without their
 * own components; `Surface.astro` walks the same tree so a theme can draw any component itself.
 * Every value reaches the page escaped; nothing a model wrote is executed. Worker-safe.
 */
import type { ContentEntry, SurfaceSection } from "@cloudhal/core-contracts";
import type { BlockRegistry } from "@cloudhal/core-ts/blocks";
import {
  type Catalog,
  type CatalogEntry,
  checkSurface,
  createCatalog,
  evaluateCondition,
  isInteractive,
  resolveProps,
} from "@cloudhal/core-ts/surfaces";
import { builtInBlockHtml, isBuiltInBlock, missingBlockHtml } from "./block-html.ts";
import { escapeHtml, renderMarkdown, safeHref } from "./markdown.ts";
import { imageAttributes, imgHtml, type MediaContext } from "./media.ts";
import { SURFACE_SCRIPT, scriptJson } from "./surface-client.ts";

/** One component of a surface, ready to draw. */
export interface SurfaceNode {
  id: string;
  component: string;
  entry: CatalogEntry;
  /** Props with bindings and functions resolved against the surface's data. */
  props: Record<string, unknown>;
  /** The props as written (bindings kept), for the interaction runtime's attributes. */
  raw: Record<string, unknown>;
  /** In a live surface: the node's visibility condition, and whether it starts hidden. */
  visible?: unknown;
  hidden?: boolean;
  /** The surface loads the interaction runtime (RFC-0020 §4). */
  live?: boolean;
  children: SurfaceNode[];
}

export interface SurfaceTree {
  section: SurfaceSection;
  /** `undefined` when the surface has no root yet (still arriving) or the root is hidden. */
  root: SurfaceNode | undefined;
  /** It has inputs or button actions: the page carries its data and the interaction runtime. */
  live: boolean;
  /** Ids of components the catalog does not know: kept, not drawn (a preview labels them). */
  unknown: string[];
  data: Record<string, unknown>;
}

/** What an entry looks like inside a surface's data (`$source: "entries"`, RFC-0020 §3). */
export interface SurfaceEntryCard {
  id: string;
  href: string;
  title: string;
  summary?: string;
  published?: string;
  collection: string;
}

export function surfaceEntryCard(e: ContentEntry): SurfaceEntryCard {
  return {
    id: e.id,
    href: `/${e.collection}/${e.slug}`,
    title: e.title,
    collection: e.collection,
    ...(e.summary ? { summary: e.summary } : {}),
    ...(e.publishedAt ? { published: e.publishedAt } : {}),
  };
}

/** The entry queries in a surface's data, by data key (`$source: "entries"`). */
export function surfaceSources(
  section: SurfaceSection,
): { key: string; collection: string; filter?: string; sort: string; limit: number }[] {
  const out = [];
  for (const [key, v] of Object.entries(section.data ?? {})) {
    if (typeof v !== "object" || v === null || (v as { $source?: unknown }).$source !== "entries")
      continue;
    const q = (v as { query?: Record<string, unknown> }).query ?? {};
    out.push({
      key,
      collection: String(q.collection ?? "posts"),
      ...(typeof q.filter === "string" ? { filter: q.filter } : {}),
      sort: typeof q.sort === "string" ? q.sort : "newest",
      limit: Math.min(Math.max(Number(q.limit) || 10, 1), 50),
    });
  }
  return out;
}

/** Sorts and trims a source's entries the way the query asks. */
export function pickEntries(
  entries: readonly ContentEntry[],
  q: { sort: string; limit: number },
): SurfaceEntryCard[] {
  const at = (e: ContentEntry) => e.publishedAt ?? e.createdAt;
  // The page's source already holds only what this response may show (published, or the draft
  // in a preview), so no status filter here.
  return [...entries]
    .sort((a, b) =>
      q.sort === "title"
        ? a.title.localeCompare(b.title)
        : q.sort === "oldest"
          ? at(a).localeCompare(at(b))
          : at(b).localeCompare(at(a)),
    )
    .slice(0, q.limit)
    .map(surfaceEntryCard);
}

export interface SurfaceContext {
  readonly media?: MediaContext | undefined;
  /** The deployment's registry; defaults to `media.blocks`, else the built-ins. */
  readonly registry?: BlockRegistry | undefined;
  /** Entry sources already loaded by the page, by data key (`surfaceSources`). */
  readonly sources?: Readonly<Record<string, readonly SurfaceEntryCard[]>> | undefined;
  readonly preview?: boolean | undefined;
}

const catalogs = new WeakMap<BlockRegistry, Catalog>();
const defaultCatalog = createCatalog();
function catalogFor(registry: BlockRegistry | undefined): Catalog {
  if (!registry) return defaultCatalog;
  let c = catalogs.get(registry);
  if (!c) {
    c = createCatalog({ blocks: registry });
    catalogs.set(registry, c);
  }
  return c;
}

/**
 * The surface as a tree to draw: unknown, unreachable and hidden components are left out, props
 * resolved against the data with the page's entry sources in place of their queries.
 */
export function surfaceTree(section: SurfaceSection, ctx: SurfaceContext = {}): SurfaceTree {
  const catalog = catalogFor(ctx.registry ?? ctx.media?.blocks);
  const check = checkSurface(section, catalog);
  const data: Record<string, unknown> = { ...(section.data ?? {}) };
  for (const s of surfaceSources(section)) data[s.key] = ctx.sources?.[s.key] ?? [];
  const locale = ctx.media?.locale ?? "en";
  const byId = new Map(section.components.map((c) => [c.id, c]));
  const unknown = new Set(check.unknown);
  const live = isInteractive(section);
  // A surface with structural problems (a stored one never has them) draws nothing.
  if (check.issues.some((i) => !i.path.includes("/props/") && !i.path.includes("/visible")))
    return { section, root: undefined, unknown: check.unknown, data, live: false };
  const invalidProps = new Set(
    check.issues.map((i) => /^\/components\/(\d+)\//.exec(i.path)?.[1]).filter(Boolean),
  );
  const node = (id: string, depth: number): SurfaceNode | undefined => {
    const c = byId.get(id);
    if (!c || unknown.has(id) || depth > 8) return undefined;
    const index = section.components.indexOf(c);
    if (invalidProps.has(String(index))) return undefined;
    // A live surface keeps hidden components (the runtime shows them when their condition holds).
    const shown = evaluateCondition(c.visible, data);
    if (!shown && !live) return undefined;
    const entry = catalog.get(c.component);
    if (!entry) return undefined;
    return {
      id,
      component: c.component,
      entry,
      props: resolveProps(c.props, data, { locale }),
      raw: { ...(c.props ?? {}) },
      ...(live ? { live: true } : {}),
      ...(live && c.visible !== undefined ? { visible: c.visible, hidden: !shown } : {}),
      children: (c.children ?? [])
        .map((k) => node(k, depth + 1))
        .filter((n): n is SurfaceNode => n !== undefined),
    };
  };
  return { section, root: node("root", 1), unknown: check.unknown, data, live };
}

// ── markup ───────────────────────────────────────────────────────────────────────────────────

const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const attr = (name: string, v: unknown, allowed?: readonly string[]) => {
  const s = str(v);
  if (!s || (allowed && !allowed.includes(s))) return "";
  return ` data-${name}="${escapeHtml(s)}"`;
};
const SPACE = ["none", "s", "m", "l", "xl"];
const TONE = ["surface", "muted", "brand", "inverse"];
const ALIGN = ["start", "center", "end", "stretch"];

const isBinding = (v: unknown) =>
  typeof v === "object" && v !== null && !Array.isArray(v) && ("path" in v || "call" in v);
const json = (v: unknown) => escapeHtml(JSON.stringify(v));

/** A text prop: escaped, and kept live by the runtime when it is bound in a live surface. */
function text(
  node: Pick<SurfaceNode, "props"> & Partial<Pick<SurfaceNode, "raw" | "live">>,
  name: string,
): string {
  const value = escapeHtml(str(node.props[name]));
  return node.live && isBinding(node.raw?.[name])
    ? `<span data-ch-text="${json(node.raw?.[name])}">${value}</span>`
    : value;
}

/** The pointer an input writes to (its `value` bound with {path}), in a live surface. */
function model(node: Partial<Pick<SurfaceNode, "raw" | "live">>): string {
  const v = node.raw?.value as { path?: unknown } | undefined;
  return node.live && typeof v?.path === "string" ? ` data-ch-model="${escapeHtml(v.path)}"` : "";
}

/** Where a primitive's children go in its markup. */
export const CHILDREN = "<!--ch-children-->";

/**
 * A primitive's markup around `CHILDREN`, from resolved props (escaped here). `Tabs` reads its
 * children's labels for the tab buttons.
 */
export function primitiveHtml(
  node: Pick<SurfaceNode, "id" | "component" | "props" | "children"> &
    Partial<Pick<SurfaceNode, "raw" | "live">>,
  scope: string,
  media?: MediaContext,
): string {
  const p = node.props;
  const id = escapeHtml(`${scope}-${node.id}`);
  switch (node.component) {
    case "Stack":
      return `<div class="ch-stack"${attr("gap", p.gap, SPACE)}${attr("align", p.align, ALIGN)}>${CHILDREN}</div>`;
    case "Row":
      return `<div class="ch-row"${attr("gap", p.gap, SPACE)}${attr("align", p.align, ALIGN)}${attr("justify", p.justify, ["start", "center", "end", "between"])}${p.wrap === false ? ' data-wrap="no"' : ""}>${CHILDREN}</div>`;
    case "Grid":
      return `<div class="ch-grid"${attr("cols", p.columns, ["1", "2", "3", "4", "5", "6"])}${attr("gap", p.gap, SPACE)}>${CHILDREN}</div>`;
    case "Columns":
      return `<div class="ch-columns"${attr("ratio", p.ratio, ["1-1", "2-1", "1-2", "1-1-1", "1-2-1"])}${attr("gap", p.gap, SPACE)}>${CHILDREN}</div>`;
    case "Band":
      return `<div class="ch-band"${attr("tone", p.tone, TONE)}${attr("width", p.width, ["narrow", "wide", "full"])}${attr("spacing", p.spacing, SPACE)}><div class="ch-band__inner">${CHILDREN}</div></div>`;
    case "Card": {
      const href = typeof p.href === "string" ? safeHref(p.href) : undefined;
      return href
        ? `<a class="ch-card" href="${escapeHtml(href)}"${attr("tone", p.tone, TONE)}>${CHILDREN}</a>`
        : `<div class="ch-card"${attr("tone", p.tone, TONE)}>${CHILDREN}</div>`;
    }
    case "Spacer":
      return `<div class="ch-spacer"${attr("size", p.size, SPACE)} aria-hidden="true"></div>`;
    case "Divider":
      return `<hr class="ch-divider">`;
    case "Heading": {
      const level = [1, 2, 3, 4].includes(Number(p.level)) ? Number(p.level) : 2;
      return `<h${level} class="ch-heading"${attr("align", p.align, ALIGN)}>${text(node, "text")}</h${level}>`;
    }
    case "Text":
      return `<div class="ch-text"${attr("size", p.size, ["s", "m", "l"])}${p.muted === true ? ' data-muted="yes"' : ""}${attr("align", p.align, ALIGN)}>${renderMarkdown(str(p.text), media)}</div>`;
    case "Markdown":
      return `<div class="ch-markdown ch-richtext">${renderMarkdown(str(p.content), media)}</div>`;
    case "Image": {
      const m = /^asset:([a-z]+_[A-Za-z0-9]{6,32})$/.exec(str(p.asset));
      const asset = m ? media?.assets?.get(m[1] as string) : undefined;
      if (!asset) {
        if (m) media?.onMiss?.(m[1] as string);
        return "";
      }
      const defaultLocale = media?.defaultLocale ?? media?.locale ?? "en";
      const img = imgHtml(
        imageAttributes(
          asset,
          { alt: str(p.alt) },
          {
            locale: media?.locale ?? defaultLocale,
            defaultLocale,
            transform: media?.transform ?? "none",
            sizes: "(min-width: 64rem) 64rem, 100vw",
            ...(media?.preview ? { preview: true } : {}),
          },
        ),
      );
      const caption = str(p.caption);
      return `<figure class="ch-figure"${attr("ratio", p.ratio, ["auto", "16:9", "4:3", "1:1", "3:4"])}>${img}${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ""}</figure>`;
    }
    case "Button":
    case "Link": {
      const cls =
        node.component === "Link"
          ? "ch-link"
          : `ch-button ch-button--${["primary", "secondary", "ghost"].includes(str(p.variant)) ? str(p.variant) : "primary"}`;
      // An action (RFC-0020 §4): a button the runtime acts on; without JavaScript it does nothing.
      const action = node.component === "Button" ? p.onClick : undefined;
      if (action && typeof action === "object" && !Array.isArray(action)) {
        const a = action as Record<string, unknown>;
        const safe = a.action !== "navigate" || (typeof a.href === "string" && safeHref(a.href));
        if (!safe) return "";
        return `<button type="button" class="${cls}" data-ch-action="${json(a)}">${text(node, "label")}</button>`;
      }
      const href = typeof p.href === "string" ? safeHref(p.href) : undefined;
      if (!href) return "";
      return `<a class="${cls}" href="${escapeHtml(href)}">${text(node, "label")}</a>`;
    }
    case "Badge":
      return `<span class="ch-badge"${attr("tone", p.tone, ["neutral", "info", "success", "warning", "danger"])}>${text(node, "label")}</span>`;
    case "Stat":
      return `<div class="ch-stat"><span class="ch-stat__value">${text(node, "value")}</span><span class="ch-stat__label">${text(node, "label")}</span>${p.detail ? `<span class="ch-stat__detail">${text(node, "detail")}</span>` : ""}</div>`;
    case "Toggle": {
      const options = Array.isArray(p.options) ? p.options.slice(0, 8).map(str) : [];
      const radios = options
        .map(
          (o) =>
            `<label class="ch-toggle__option"><input type="radio" name="${id}" value="${escapeHtml(o)}"${model(node)}${o === str(p.value) ? " checked" : ""}><span>${escapeHtml(o)}</span></label>`,
        )
        .join("");
      return `<div class="ch-toggle" role="radiogroup"${p.label ? ` aria-label="${escapeHtml(str(p.label))}"` : ""}>${radios}</div>`;
    }
    case "Select": {
      const options = Array.isArray(p.options) ? p.options.slice(0, 50).map(str) : [];
      return `<label class="ch-field"><span class="ch-field__label">${escapeHtml(str(p.label))}</span><select class="ch-select"${model(node)}>${options.map((o) => `<option value="${escapeHtml(o)}"${o === str(p.value) ? " selected" : ""}>${escapeHtml(o)}</option>`).join("")}</select></label>`;
    }
    case "Slider": {
      const n = (v: unknown, d: number) => (Number.isFinite(Number(v)) ? Number(v) : d);
      const out =
        node.live && isBinding(node.raw?.value)
          ? `<output class="ch-slider__value" data-ch-text="${json(node.raw?.value)}">${escapeHtml(str(p.value))}</output>`
          : `<output class="ch-slider__value">${escapeHtml(str(p.value))}</output>`;
      return `<label class="ch-field"><span class="ch-field__label">${escapeHtml(str(p.label))}</span><span class="ch-slider"><input type="range" min="${n(p.min, 0)}" max="${n(p.max, 100)}" step="${n(p.step, 1) || "any"}" value="${n(p.value, 0)}"${model(node)}>${out}</span></label>`;
    }
    case "Quote": {
      const cite = str(p.cite);
      const role = str(p.role);
      return `<figure class="ch-quote"><blockquote>${renderMarkdown(str(p.text), media)}</blockquote>${cite || role ? `<figcaption>${cite ? `<cite>${escapeHtml(cite)}</cite>` : ""}${role ? ` <span>${escapeHtml(role)}</span>` : ""}</figcaption>` : ""}</figure>`;
    }
    case "List": {
      const items = Array.isArray(p.items) ? p.items.slice(0, 50) : [];
      const tag = p.ordered === true ? "ol" : "ul";
      return `<${tag} class="ch-list"${attr("marker", p.marker, ["bullet", "check", "none"])}>${items.map((i) => `<li>${escapeHtml(str(i))}</li>`).join("")}</${tag}>`;
    }
    case "Tabs": {
      // No JavaScript: one radio per panel; the theme's CSS shows the checked one's panel.
      const panels = node.children.filter((c) => c.component === "TabPanel");
      const radios = panels
        .map(
          (c, i) =>
            `<input class="ch-tabs__radio" type="radio" name="${id}" id="${id}-${i}"${i === 0 ? " checked" : ""}><label class="ch-tabs__tab" for="${id}-${i}">${escapeHtml(str(c.props.label))}</label>`,
        )
        .join("");
      return `<div class="ch-tabs" data-count="${panels.length}">${radios}<div class="ch-tabs__panels">${CHILDREN}</div></div>`;
    }
    case "TabPanel":
      return `<div class="ch-tabs__panel" role="group" aria-label="${escapeHtml(str(p.label))}">${CHILDREN}</div>`;
    case "Accordion":
      return `<div class="ch-accordion" data-group="${id}">${CHILDREN}</div>`;
    case "Disclosure":
      return `<details class="ch-disclosure"${p.open === true ? " open" : ""}><summary>${escapeHtml(str(p.summary))}</summary><div class="ch-disclosure__body">${CHILDREN}</div></details>`;
    default:
      return "";
  }
}

/**
 * A block component in a surface with Cloudhal's built-in markup; a theme's own type has none
 * (its component draws it on the site), so a preview labels it.
 */
export function blockNodeHtml(node: SurfaceNode, media?: MediaContext, preview?: boolean): string {
  const attrs = `data-block-type="${escapeHtml(node.component)}"`;
  if (isBuiltInBlock(node.component))
    return `<div class="ch-block" ${attrs}>${builtInBlockHtml(node.component, node.props, {
      markdown: (source) => renderMarkdown(source, media),
    })}</div>`;
  return preview
    ? missingBlockHtml("div", attrs, node.component, "shown by the theme on the site")
    : "";
}

/**
 * In a live surface, a component with a visibility condition sits in a `display: contents`
 * wrapper the runtime hides and shows (`hidden` while the condition is false).
 */
export function visibilityWrapper(node: Pick<SurfaceNode, "visible" | "hidden">): [string, string] {
  if (node.visible === undefined) return ["", ""];
  return [
    `<div class="ch-node" data-ch-visible="${json(node.visible)}"${node.hidden ? " hidden" : ""}>`,
    "</div>",
  ];
}

/**
 * Previews mark each component's outer element with its id, so Studio's Build view can tell which
 * component the pointer is on (RFC-0020 §6 click-to-scope). The public site's markup is unchanged.
 */
function markComponent(html: string, id: string, ctx: SurfaceContext): string {
  if (!ctx.preview) return html;
  return html.replace(/^<([a-z][a-z0-9-]*)(?=[\s>/])/, `<$1 data-component-id="${escapeHtml(id)}"`);
}

function nodeHtml(node: SurfaceNode, scope: string, ctx: SurfaceContext): string {
  const [open, close] = visibilityWrapper(node);
  if (node.entry.kind === "block")
    return open + markComponent(blockNodeHtml(node, ctx.media, ctx.preview), node.id, ctx) + close;
  const inner = node.children.map((c) => nodeHtml(c, scope, ctx)).join("");
  return (
    open +
    markComponent(primitiveHtml(node, scope, ctx.media), node.id, ctx).replace(CHILDREN, inner) +
    close
  );
}

/** What a page's source offers for entry sources (`GraphSource`). */
export interface SurfaceEntrySource {
  entries(collection: string): Promise<ContentEntry[]>;
  entriesByFilter(filter: string): Promise<ContentEntry[]>;
}

/**
 * Loads every entry source of the page's surfaces, by section id then data key. A filter that no
 * longer parses (a term was removed) lists nothing rather than failing the page.
 */
export async function loadSurfaceSources(
  source: SurfaceEntrySource,
  sections: readonly { kind: string }[],
): Promise<Record<string, Record<string, SurfaceEntryCard[]>>> {
  const out: Record<string, Record<string, SurfaceEntryCard[]>> = {};
  for (const s of sections) {
    if (s.kind !== "surface") continue;
    const section = s as SurfaceSection;
    const loaded: Record<string, SurfaceEntryCard[]> = {};
    for (const q of surfaceSources(section)) {
      const list = q.filter
        ? await source
            .entriesByFilter(`collection:${q.collection}+${q.filter}`)
            .catch(() => [] as ContentEntry[])
        : await source.entries(q.collection);
      loaded[q.key] = pickEntries(list, q);
    }
    out[section.id] = loaded;
  }
  return out;
}

/** The surface's id as an HTML id scope: tab groups and labels stay unique on the page. */
export const surfaceScope = (section: SurfaceSection) => `ch-${section.id}`;

/** Opening and closing markup of the surface's wrapper. */
export function surfaceWrapper(
  section: SurfaceSection,
  live?: { data: Record<string, unknown> },
): [string, string] {
  const scope = surfaceScope(section);
  return [
    `<section class="ch-surface" data-section-id="${escapeHtml(section.id)}" data-kind="surface" data-catalog="${escapeHtml(section.catalog)}"${live ? ` data-ch-surface="${escapeHtml(scope)}"` : ""}>`,
    live
      ? // RFC-0020 §4: the data as inert JSON, then Cloudhal's runtime (one module per page).
        `<script type="application/json" data-ch-state>${scriptJson(live.data)}</script><script type="module" src="${SURFACE_SCRIPT.path}"></script></section>`
      : "</section>",
  ];
}

/**
 * A surface as HTML: every primitive and built-in block in Cloudhal's markup. Previews label
 * unknown components and theme blocks; the site leaves them out.
 */
export function renderSurface(section: SurfaceSection, ctx: SurfaceContext = {}): string {
  const tree = surfaceTree(section, ctx);
  const [open, close] = surfaceWrapper(section, tree.live ? { data: tree.data } : undefined);
  const body = tree.root ? nodeHtml(tree.root, surfaceScope(section), ctx) : "";
  const missing = ctx.preview
    ? tree.unknown
        .map((id) => {
          const c = section.components.find((x) => x.id === id);
          return missingBlockHtml(
            "div",
            `data-component-id="${escapeHtml(id)}"`,
            c?.component ?? id,
            "unknown block type",
          );
        })
        .join("")
    : "";
  if (!body && !missing) return ctx.preview ? `${open}${close}` : "";
  return `${open}${body}${missing}${close}`;
}
