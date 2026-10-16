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
  AMBIENT_KINDS,
  type Catalog,
  type CatalogEntry,
  checkSurface,
  createCatalog,
  evaluateCondition,
  INPUT_MODEL,
  isInteractive,
  MOTION_HOVERS,
  MOTION_LOOPS,
  MOTION_REVEALS,
  MOTION_SCROLLS,
  MOTION_SPEEDS,
  MOTION_STAGGER,
  PARTICLE_PRESETS,
  resolveProps,
  SURFACE_STYLES,
  surfaceLoops,
  TONE_SURFACE,
  usesMotion,
} from "@cloudhal/core-ts/surfaces";
import { builtInBlockHtml, isBuiltInBlock, missingBlockHtml } from "./block-html.ts";
import { chartInner } from "./chart.ts";
import { escapeHtml, renderMarkdown, safeHref } from "./markdown.ts";
import { imageAttributes, imgHtml, type MediaContext } from "./media.ts";
import { MOTION_SCRIPT } from "./motion-client.ts";
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
  /** RFC-0024: the node's motion as `data-ch-*` attributes for its outer element (or ""). */
  motion?: string;
  /** RFC-0024 24c: a Heading or Text revealed piece by piece. */
  split?: "words" | "chars" | "lines";
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
  // A component's motion that does not check is left out; the component still draws.
  const issues = check.issues.filter((i) => !i.path.includes("/motion"));
  if (issues.some((i) => !i.path.includes("/props/") && !i.path.includes("/visible")))
    return { section, root: undefined, unknown: check.unknown, data, live: false };
  const invalidProps = new Set(
    issues.map((i) => /^\/components\/(\d+)\//.exec(i.path)?.[1]).filter(Boolean),
  );
  const badMotion = new Set(
    check.issues
      .filter((i) => i.path.includes("/motion"))
      .map((i) => /^\/components\/(\d+)\//.exec(i.path)?.[1]),
  );
  const node = (
    id: string,
    depth: number,
    stagger?: { reveal: string; index: number },
  ): SurfaceNode | undefined => {
    const c = byId.get(id);
    if (!c || unknown.has(id) || depth > 8) return undefined;
    const index = section.components.indexOf(c);
    if (invalidProps.has(String(index))) return undefined;
    // A live surface keeps hidden components (the runtime shows them when their condition holds).
    const shown = evaluateCondition(c.visible, data);
    if (!shown && !live) return undefined;
    const entry = catalog.get(c.component);
    if (!entry) return undefined;
    const motion = badMotion.has(String(index))
      ? undefined
      : (c.motion as MotionFields | undefined);
    // RFC-0024 §2: a staggered parent hands its reveal to its children, each a step later.
    const staggers =
      motion?.stagger === true && (MOTION_STAGGER as readonly string[]).includes(c.component);
    let i = 0;
    const children = (c.children ?? [])
      .map((k) =>
        node(
          k,
          depth + 1,
          staggers ? { reveal: motion?.reveal ?? "rise", index: Math.min(i++, 12) } : undefined,
        ),
      )
      .filter((n): n is SurfaceNode => n !== undefined);
    const attrs = motionAttrs(staggers ? { ...motion, reveal: undefined } : motion, stagger);
    const reveal = motion?.reveal;
    const split =
      typeof reveal === "string" &&
      reveal.startsWith("split-") &&
      (c.component === "Heading" || c.component === "Text") &&
      typeof c.props?.text === "string"
        ? (reveal.slice(6) as "words" | "chars" | "lines")
        : undefined;
    return {
      id,
      component: c.component,
      entry,
      props: resolveProps(c.props, data, { locale }),
      raw: { ...(c.props ?? {}) },
      ...(live ? { live: true } : {}),
      ...(live && c.visible !== undefined ? { visible: c.visible, hidden: !shown } : {}),
      ...(attrs ? { motion: attrs } : {}),
      ...(split ? { split } : {}),
      children,
    };
  };
  return { section, root: node("root", 1), unknown: check.unknown, data, live };
}

// ── motion (RFC-0024 §2, §7) ─────────────────────────────────────────────────────────────────

interface MotionFields {
  reveal?: string | undefined;
  scroll?: string;
  depth?: number;
  loop?: string;
  hover?: string;
  speed?: string;
  delay?: number;
  stagger?: boolean;
  replay?: boolean;
}

/**
 * A component's motion as attributes the theme's motion layer styles: the reveal (its own, or
 * the one a staggered parent hands down), speed, delay in stagger steps (`data-ch-d`), hover and
 * replay. Only known values pass, so nothing a model wrote reaches the page as free text.
 */
export function motionAttrs(
  motion: MotionFields | undefined,
  stagger?: { reveal: string; index: number },
): string {
  const out: string[] = [];
  const reveal = motion?.reveal ?? stagger?.reveal;
  if (reveal && (MOTION_REVEALS as readonly string[]).includes(reveal))
    out.push(` data-ch-reveal="${reveal}"`);
  if (motion?.speed && (MOTION_SPEEDS as readonly string[]).includes(motion.speed))
    out.push(` data-ch-speed="${motion.speed}"`);
  const delay =
    (Number.isInteger(motion?.delay) ? Math.min(4, Math.max(0, motion?.delay as number)) : 0) +
    (stagger?.index ?? 0);
  if (reveal && delay > 0) out.push(` data-ch-d="${Math.min(delay, 16)}"`);
  if (motion?.hover && (MOTION_HOVERS as readonly string[]).includes(motion.hover))
    out.push(` data-ch-hover="${motion.hover}"`);
  if (reveal && motion?.replay === true) out.push(" data-ch-replay");
  // RFC-0024 24b: moves with the scroll instead (never together with a reveal).
  if (!reveal && motion?.scroll && (MOTION_SCROLLS as readonly string[]).includes(motion.scroll)) {
    out.push(` data-ch-scroll="${motion.scroll}"`);
    const depth = motion.depth;
    if (Number.isInteger(depth) && depth !== 0 && Math.abs(depth as number) <= 3)
      out.push(` data-ch-dep="${depth}"`);
  }
  // RFC-0024 24c: a loop decorates on its own (never with a reveal or a scroll effect).
  if (
    !reveal &&
    !motion?.scroll &&
    motion?.loop &&
    (MOTION_LOOPS as readonly string[]).includes(motion.loop)
  )
    out.push(` data-ch-loop="${motion.loop}"`);
  return out.join("");
}

/**
 * RFC-0024 24c: a text split into pieces for kinetic type: words (or, for `chars`, words of
 * characters), each with its place in the sequence as `--ch-i`, hidden from screen readers,
 * which read the whole text once from a visually hidden copy. `lines` are numbered in the page,
 * once the line breaks are known (the motion module).
 */
export function splitHtml(text: string, mode: "words" | "chars" | "lines"): string {
  const words = text.split(/\s+/).filter(Boolean);
  let i = 0;
  const pieces = words.map((w) => {
    if (mode !== "chars")
      return `<span class="ch-w"${mode === "words" ? ` style="--ch-i:${i++}"` : ""}>${escapeHtml(w)}</span>`;
    const chars = Array.from(w)
      .map((c) => `<span class="ch-c" style="--ch-i:${i++}">${escapeHtml(c)}</span>`)
      .join("");
    return `<span class="ch-w">${chars}</span>`;
  });
  return `<span class="sr-only">${escapeHtml(text)}</span><span class="ch-split" data-mode="${mode}" aria-hidden="true">${pieces.join(" ")}</span>`;
}

/** RFC-0024 24c: a heading's text with its effect (highlight, gradient text or rotating words). */
function headingInner(
  node: Pick<SurfaceNode, "props"> & Partial<Pick<SurfaceNode, "raw" | "live" | "split">>,
): string {
  const p = node.props;
  const raw = str(p.text);
  if (node.split) return splitHtml(raw.replace(/\*/g, ""), node.split);
  const words = Array.isArray(p.words) ? p.words.slice(0, 6).map(str).filter(Boolean) : [];
  if (p.effect === "rotate-words" && words.length >= 2) {
    const [before, after = ""] = raw.includes("{words}")
      ? raw.split("{words}", 2)
      : [`${raw} `, ""];
    const turns = words
      .map(
        (w, i) =>
          `<span class="ch-rotate__word"${i === 0 ? " data-active" : ""}>${escapeHtml(w)}</span>`,
      )
      .join("");
    return `${escapeHtml(before ?? "")}<span class="sr-only">${escapeHtml(words.join(", "))}</span><span class="ch-rotate" data-ch-rotate aria-hidden="true">${turns}</span>${escapeHtml(after)}`;
  }
  if (p.effect === "highlight") {
    const marked = /\*([^*]+)\*/.exec(raw);
    if (marked)
      return `${escapeHtml(raw.slice(0, marked.index))}<span class="ch-hl">${escapeHtml(marked[1] as string)}</span>${escapeHtml(raw.slice(marked.index + marked[0].length).replace(/\*/g, ""))}`;
    const at = raw.trimEnd().lastIndexOf(" ");
    return at < 0
      ? `<span class="ch-hl">${escapeHtml(raw)}</span>`
      : `${escapeHtml(raw.slice(0, at + 1))}<span class="ch-hl">${escapeHtml(raw.slice(at + 1))}</span>`;
  }
  if (p.effect === "gradient-text")
    return `<span class="ch-gradient-text">${escapeHtml(raw)}</span>`;
  return text(node, "text");
}

/** The node's motion attributes on the outer element of its markup. */
export function withMotion(html: string, motion: string | undefined): string {
  if (!motion) return html;
  return html.replace(/^<([a-z][a-z0-9-]*)(?=[\s>/])/, `<$1${motion}`);
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
/**
 * RFC-0023 §4: a band's or card's paint as `data-surface` (the theme draws it from the color
 * roles); an old `tone` maps to its surface and also stays as `data-tone` for themes that style it.
 */
const paint = (p: Record<string, unknown>) => {
  const surface = str(p.surface);
  if (surface && (SURFACE_STYLES as readonly string[]).includes(surface))
    return ` data-surface="${surface}"`;
  const tone = str(p.tone);
  return tone && TONE.includes(tone)
    ? ` data-surface="${TONE_SURFACE[tone as keyof typeof TONE_SURFACE]}" data-tone="${tone}"`
    : "";
};
/**
 * RFC-0024 §4: a moving background as attributes the theme draws from the color roles, and for
 * particles the canvas the ambient module paints (hidden from assistive technology, under the
 * content). Only known values pass.
 */
const ambientOf = (
  p: Record<string, unknown>,
  cards = false,
): { attrs: string; canvas: string } => {
  const a = p.ambient;
  if (typeof a !== "object" || a === null) return { attrs: "", canvas: "" };
  const amb = a as Record<string, unknown>;
  const kind = str(amb.kind);
  if (!(AMBIENT_KINDS as readonly string[]).includes(kind) || (cards && kind === "particles"))
    return { attrs: "", canvas: "" };
  const preset =
    kind === "particles" && (PARTICLE_PRESETS as readonly string[]).includes(str(amb.preset))
      ? str(amb.preset)
      : kind === "particles"
        ? "dots"
        : "";
  return {
    attrs: ` data-ch-ambient="${kind}"${preset ? ` data-ch-preset="${preset}"` : ""}${attr("ch-density", amb.density, ["low", "medium", "high"])}${attr("ch-colors", amb.colors, ["brand", "accent", "brand-accent", "neutral"])}${kind === "particles" && amb.interactive === true ? " data-ch-interactive" : ""}`,
    canvas: kind === "particles" ? '<canvas class="ch-ambient" aria-hidden="true"></canvas>' : "",
  };
};
/** An anchor for `#links`; never one of the ids the renderer makes itself (`ch-…`). */
const anchor = (v: unknown) => {
  const s = str(v);
  return s && /^[a-z][a-z0-9-]{0,40}$/.test(s) && !s.startsWith("ch-") ? ` id="${s}"` : "";
};
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
function model(node: Partial<Pick<SurfaceNode, "raw" | "live">>, prop = "value"): string {
  const v = node.raw?.[prop] as { path?: unknown } | undefined;
  return node.live && typeof v?.path === "string" ? ` data-ch-model="${escapeHtml(v.path)}"` : "";
}

/**
 * RFC-0022 §2: a field's help text (linked with `aria-describedby`) and its invalid state, which
 * the runtime keeps in step when `invalid` is bound or computed.
 */
function fieldExtras(
  node: Pick<SurfaceNode, "props"> & Partial<Pick<SurfaceNode, "raw" | "live">>,
  id: string,
): { attrs: string; help: string } {
  const help = str(node.props.help);
  const raw = node.raw?.invalid;
  const invalid = node.props.invalid === true;
  return {
    attrs: `${help ? ` aria-describedby="${id}-help"` : ""}${invalid ? ' aria-invalid="true"' : ""}${
      node.live && isBinding(raw) ? ` data-ch-invalid="${json(raw)}"` : ""
    }`,
    help: help ? `<span class="ch-field__help" id="${id}-help">${escapeHtml(help)}</span>` : "",
  };
}

/** Where a primitive's children go in its markup. */
export const CHILDREN = "<!--ch-children-->";

/**
 * A primitive's markup around `CHILDREN`, from resolved props (escaped here). `Tabs` reads its
 * children's labels for the tab buttons.
 */
export function primitiveHtml(
  node: Pick<SurfaceNode, "id" | "component" | "props" | "children"> &
    Partial<Pick<SurfaceNode, "raw" | "live" | "split">>,
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
      return `<div class="ch-band"${anchor(p.anchor)}${paint(p)}${ambientOf(p).attrs}${attr("width", p.width, ["narrow", "wide", "full"])}${attr("spacing", p.spacing, SPACE)}>${ambientOf(p).canvas}<div class="ch-band__inner">${CHILDREN}</div></div>`;
    case "Card": {
      const href = typeof p.href === "string" ? safeHref(p.href) : undefined;
      return href
        ? `<a class="ch-card" href="${escapeHtml(href)}"${paint(p)}${ambientOf(p, true).attrs}>${CHILDREN}</a>`
        : `<div class="ch-card"${paint(p)}${ambientOf(p, true).attrs}>${CHILDREN}</div>`;
    }
    case "Spacer":
      return `<div class="ch-spacer"${attr("size", p.size, SPACE)} aria-hidden="true"></div>`;
    case "Divider":
      return `<hr class="ch-divider">`;
    case "Heading": {
      const level = [1, 2, 3, 4].includes(Number(p.level)) ? Number(p.level) : 2;
      return `<h${level} class="ch-heading"${attr("align", p.align, ALIGN)}>${headingInner(node)}</h${level}>`;
    }
    case "Text": {
      // A bound or computed text in a live surface is plain text the runtime keeps in step
      // (RFC-0022: a keypad's display, a result); otherwise it is markdown.
      const live = node.live && isBinding(node.raw?.text);
      const body = node.split
        ? `<p>${splitHtml(str(p.text).replace(/[*_`#>]+/g, ""), node.split)}</p>`
        : live
          ? `<p>${text(node, "text")}</p>`
          : renderMarkdown(str(p.text), media);
      return `<div class="ch-text"${attr("size", p.size, ["s", "m", "l"])}${p.muted === true ? ' data-muted="yes"' : ""}${attr("align", p.align, ALIGN)}>${body}</div>`;
    }
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
    // RFC-0022 §3: drawn here as SVG; a live surface redraws it when its data changes.
    case "Chart": {
      const locale = media?.locale ?? "en";
      const dataLabel = locale.startsWith("tr") ? "Verileri göster" : "Show the data";
      const live =
        node.live && node.raw
          ? ` data-ch-chart="${json(node.raw)}" data-ch-label="${escapeHtml(dataLabel)}"`
          : "";
      const rows = Array.isArray(p.data) ? p.data : [];
      const caption = str(p.caption);
      return `<figure class="ch-chart"${live}${rows.length === 0 ? " data-ch-chart-empty" : ""}><figcaption class="ch-chart__title">${escapeHtml(str(p.title))}</figcaption><div class="ch-chart__body">${chartInner(p, locale, { data: dataLabel })}</div>${caption ? `<p class="ch-chart__caption">${escapeHtml(caption)}</p>` : ""}</figure>`;
    }
    // RFC-0022 §4: a real table; `data-label` lets the theme stack rows into cards on phones.
    case "Table": {
      const locale = media?.locale ?? "en";
      const isRow = (r: unknown): r is Record<string, unknown> =>
        typeof r === "object" && r !== null && !Array.isArray(r);
      const rows = (Array.isArray(p.rows) ? p.rows : []).filter(isRow).slice(0, 200);
      const columns = (Array.isArray(p.columns) ? p.columns : []).filter(isRow).slice(0, 8);
      const cell = (v: unknown, c: Record<string, unknown>): string => {
        if (v === undefined || v === null || v === "") return "";
        const n = typeof v === "number" ? v : Number(v);
        const digits = Number.isInteger(c.digits) ? Number(c.digits) : undefined;
        try {
          if (c.format === "number" && Number.isFinite(n))
            return new Intl.NumberFormat(locale, { maximumFractionDigits: digits ?? 2 }).format(n);
          if (c.format === "currency" && Number.isFinite(n) && /^[A-Z]{3}$/.test(str(c.currency)))
            return new Intl.NumberFormat(locale, {
              style: "currency",
              currency: str(c.currency),
              ...(digits !== undefined ? { maximumFractionDigits: digits } : {}),
            }).format(n);
          if (c.format === "percent" && Number.isFinite(n))
            return new Intl.NumberFormat(locale, {
              style: "percent",
              maximumFractionDigits: digits ?? 0,
            }).format(n);
          if (c.format === "date") {
            const d = new Date(str(v));
            if (!Number.isNaN(d.getTime()))
              return new Intl.DateTimeFormat(locale, {
                dateStyle: "medium",
                timeZone: "UTC",
              }).format(d);
          }
        } catch {
          // an unknown currency or locale: show the value as it is
        }
        return str(v);
      };
      const hl = isRow(p.highlight) ? p.highlight : undefined;
      const head = columns
        .map(
          (c) =>
            `<th scope="col"${c.align === "end" ? ' data-align="end"' : ""}>${escapeHtml(str(c.label))}</th>`,
        )
        .join("");
      const body = rows
        .map((r) => {
          const marked = hl && str(r[str(hl.field)]) === str(hl.equals);
          return `<tr${marked ? ' data-highlight="yes"' : ""}>${columns
            .map(
              (c) =>
                `<td data-label="${escapeHtml(str(c.label))}"${c.align === "end" ? ' data-align="end"' : ""}>${escapeHtml(cell(r[str(c.field)], c))}</td>`,
            )
            .join("")}</tr>`;
        })
        .join("");
      return `<div class="ch-table-wrap"><table class="ch-table"${p.striped === true ? ' data-striped="yes"' : ""}><caption>${escapeHtml(str(p.caption))}</caption><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
    }
    // RFC-0022 §2: local inputs; values stay in the reader's browser.
    case "NumberField": {
      const x = fieldExtras(node, id);
      const n = (v: unknown) =>
        Number.isFinite(Number(v)) && v !== "" ? ` ${String(Number(v))}` : "";
      const bound = (k: string) => (n(p[k]) ? ` ${k}="${n(p[k]).trim()}"` : "");
      const unit = str(p.unit);
      return `<label class="ch-field"><span class="ch-field__label">${escapeHtml(str(p.label))}</span><span class="ch-input-wrap"><input class="ch-input" type="number" inputmode="decimal" id="${id}"${bound("min")}${bound("max")}${p.step === undefined ? ' step="any"' : bound("step")}${p.placeholder ? ` placeholder="${escapeHtml(str(p.placeholder))}"` : ""} value="${escapeHtml(str(p.value))}"${model(node)}${x.attrs}>${unit ? `<span class="ch-input__unit">${escapeHtml(unit)}</span>` : ""}</span>${x.help}</label>`;
    }
    case "TextField": {
      const x = fieldExtras(node, id);
      const max = Number.isInteger(p.maxLength) ? Math.min(500, Number(p.maxLength)) : 500;
      return `<label class="ch-field"><span class="ch-field__label">${escapeHtml(str(p.label))}</span><input class="ch-input" type="${p.kind === "email" ? "email" : "text"}" id="${id}" maxlength="${max}"${p.placeholder ? ` placeholder="${escapeHtml(str(p.placeholder))}"` : ""} value="${escapeHtml(str(p.value))}"${model(node)}${x.attrs}>${x.help}</label>`;
    }
    case "Checkbox":
      return `<label class="ch-check"><input type="checkbox"${p.checked === true ? " checked" : ""}${model(node, "checked")}><span>${escapeHtml(str(p.label))}</span></label>`;
    case "RadioGroup": {
      const x = fieldExtras(node, id);
      const options = (Array.isArray(p.options) ? p.options : [])
        .slice(0, 8)
        .filter((o): o is Record<string, unknown> => typeof o === "object" && o !== null);
      const radios = options
        .map(
          (o) =>
            `<label class="ch-radio__option"><input type="radio" name="${id}" value="${escapeHtml(str(o.value))}"${model(node)}${str(o.value) === str(p.value) ? " checked" : ""}><span>${escapeHtml(str(o.label))}</span></label>`,
        )
        .join("");
      return `<fieldset class="ch-radio" data-variant="${p.variant === "buttons" ? "buttons" : "list"}"${x.attrs}><legend class="ch-field__label">${escapeHtml(str(p.label))}</legend><span class="ch-radio__options">${radios}</span>${x.help}</fieldset>`;
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
    // RFC-0024 24c: a row the motion module sets moving (a still, wrapping row until then).
    case "Marquee":
      return `<div class="ch-marquee"${attr("speed", p.speed, ["slow", "normal", "fast"])}${attr("direction", p.direction, ["start", "end"])}${p.pauseOnHover === false ? "" : " data-hover-pause"}${attr("gap", p.gap, SPACE)}><div class="ch-marquee__track">${CHILDREN}</div></div>`;
    // RFC-0024 24c: the final number is in the page; the motion module counts up to it once.
    case "Counter": {
      const bound = node.live && isBinding(node.raw?.value);
      const to = Number(p.value);
      const decimals = Number.isInteger(p.decimals)
        ? Math.min(3, Math.max(0, p.decimals as number))
        : 0;
      const shown = Number.isFinite(to)
        ? new Intl.NumberFormat(media?.locale ?? "en", {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
          }).format(to)
        : "";
      const from = Number.isFinite(Number(p.from)) ? Number(p.from) : 0;
      const prefix = escapeHtml(str(p.prefix));
      const suffix = escapeHtml(str(p.suffix));
      const value = bound
        ? text(node, "value")
        : // The final number twice in one grid cell: a hidden copy holds the width while the
          // other counts (no layout shift, whatever the font's digits and separators).
          `<span class="sr-only">${escapeHtml(shown)}</span><span class="ch-counter__num" aria-hidden="true"><span class="ch-counter__hold">${escapeHtml(shown)}</span><span class="ch-counter__live"${Number.isFinite(to) ? ` data-ch-count="${to}" data-ch-from="${from}" data-ch-decimals="${decimals}"` : ""}${attr("ch-speed", p.duration, ["fast", "normal", "slow"])}>${escapeHtml(shown)}</span></span>`;
      return `<div class="ch-counter"><span class="ch-counter__value">${prefix}${value}${suffix}</span>${p.label ? `<span class="ch-counter__label">${text(node, "label")}</span>` : ""}</div>`;
    }
    // RFC-0024 §3: scroll storytelling; the motion module writes the step being read to `step`.
    case "Scrolly": {
      const bound = node.raw?.step as { path?: unknown } | undefined;
      const step = bound && typeof bound === "object" ? str(bound.path) : "";
      return `<div class="ch-scrolly"${attr("side", p.side, ["start", "end"])}${attr("ratio", p.ratio, ["1-1", "2-1", "1-2"])}${/^\/[^\s"<>]{0,199}$/.test(step) ? ` data-ch-step-path="${escapeHtml(step)}"` : ""}>${CHILDREN}</div>`;
    }
    case "Step":
      return `<div class="ch-step">${CHILDREN}</div>`;
    case "ScrollProgress":
      return `<div class="ch-progress"${attr("placement", p.placement ?? "page", ["page", "section"])}${attr("tone", p.tone, ["brand", "accent", "neutral"])} aria-hidden="true"><span class="ch-progress__bar"></span></div>`;
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
    return (
      open +
      markComponent(
        withMotion(blockNodeHtml(node, ctx.media, ctx.preview), node.motion),
        node.id,
        ctx,
      ) +
      close
    );
  const inner = node.children.map((c) => nodeHtml(c, scope, ctx)).join("");
  return (
    open +
    markComponent(
      withMotion(primitiveHtml(node, scope, ctx.media), node.motion),
      node.id,
      ctx,
    ).replace(CHILDREN, inner) +
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
  live?: { data: Record<string, unknown>; locale?: string | undefined },
  locale?: string,
): [string, string] {
  const scope = surfaceScope(section);
  // RFC-0022 §2: fields need the runtime to compute; say so only when it cannot run.
  const fields = live && section.components.some((c) => INPUT_MODEL[c.component]);
  const noscript = fields
    ? `<noscript><p class="ch-noscript">${
        live?.locale?.startsWith("tr")
          ? "Bu araç hesaplamak için JavaScript gerektirir."
          : "This tool needs JavaScript to calculate."
      }</p></noscript>`
    : "";
  // RFC-0024 §7: the motion module, only for surfaces that move (a module runs once per page).
  // RFC-0024 §1: anything that moves on its own for long gets the reader's pause control (WCAG
  // 2.2.2); it shows only where motion plays.
  const lang = locale ?? live?.locale ?? "en";
  const pause = surfaceLoops(section)
    ? `<button type="button" class="ch-motion-toggle" data-ch-motion-toggle aria-pressed="false">${lang.startsWith("tr") ? "Hareketi duraklat" : "Pause motion"}</button>`
    : "";
  const motion = usesMotion(section)
    ? `${pause}<script type="module" src="${MOTION_SCRIPT.path}"></script>`
    : "";
  return [
    `<section class="ch-surface" data-section-id="${escapeHtml(section.id)}" data-kind="surface" data-catalog="${escapeHtml(section.catalog)}"${live ? ` data-ch-surface="${escapeHtml(scope)}"` : ""}>`,
    live
      ? // RFC-0020 §4: the data as inert JSON, then Cloudhal's runtime (one module per page).
        `${noscript}<script type="application/json" data-ch-state>${scriptJson(live.data)}</script><script type="module" src="${SURFACE_SCRIPT.path}"></script>${motion}</section>`
      : `${motion}</section>`,
  ];
}

/**
 * A surface as HTML: every primitive and built-in block in Cloudhal's markup. Previews label
 * unknown components and theme blocks; the site leaves them out.
 */
export function renderSurface(section: SurfaceSection, ctx: SurfaceContext = {}): string {
  const tree = surfaceTree(section, ctx);
  const [open, close] = surfaceWrapper(
    section,
    tree.live ? { data: tree.data, locale: ctx.media?.locale } : undefined,
    ctx.media?.locale,
  );
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
