/**
 * A surface as a tree to draw (RFC-0020 §1–§3): bindings and named functions applied, visibility
 * evaluated against the initial data, entry sources loaded; unknown and hidden components left
 * out. Worker-safe.
 */
import type { ContentEntry, SurfaceSection } from "@cloudhal/core-contracts";
import { entryPath, type PermalinkSite } from "@cloudhal/core-ts";
import type { BlockRegistry } from "@cloudhal/core-ts/blocks";
import {
  type Catalog,
  type CatalogEntry,
  checkSurface,
  createCatalog,
  evaluateCondition,
  isInteractive,
  MOTION_STAGGER,
  OVERLAY_COMPONENTS,
  resolveProps,
} from "@cloudhal/core-ts/surfaces";
import type { MediaContext } from "../media.ts";
import { type MotionFields, motionAttrs } from "./motion.ts";

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
  /**
   * RFC-0025 §3: the overlay a Button opens or closes (its component, and a Dialog's fallback
   * page), and the tooltip a Button or Link shows (component ids).
   */
  overlay?: { target: string; kind: string; fallback?: string };
  tip?: string;
  /** RFC-0027: on a hero carousel's first slide, its images load first (not lazy). */
  priority?: boolean;
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

export function surfaceEntryCard(
  site: PermalinkSite | undefined,
  e: ContentEntry,
): SurfaceEntryCard {
  return {
    id: e.id,
    href: entryPath(site, e),
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
  site?: PermalinkSite,
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
    .map((e) => surfaceEntryCard(site, e));
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
/**
 * What keeps a surface from drawing, as "path message" lines (fence problems first): a preview
 * shows them where an invalid ```surface would otherwise draw nothing.
 */
export function surfaceProblems(
  section: SurfaceSection,
  fenceIssues: readonly { path: string; message: string }[] = [],
  registry?: BlockRegistry,
): string[] {
  const check = checkSurface(section, catalogFor(registry));
  return [...fenceIssues, ...check.issues]
    .map((i) => `${i.path} ${i.message}`)
    .concat(check.unknown.map((id) => `/components/${id} unknown component`));
}

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
  // RFC-0025 §3: tooltips by the component they describe.
  const tips = new Map<string, string>();
  for (const c of section.components)
    if (c.component === "Tooltip" && typeof c.props?.for === "string") tips.set(c.props.for, c.id);
  // What a parent hands its child: a staggered reveal, the overlay it sits in, image priority.
  const node = (
    id: string,
    depth: number,
    from: {
      stagger?: { reveal: string; index: number } | undefined;
      within?: string | undefined;
      priority?: boolean | undefined;
    } = {},
  ): SurfaceNode | undefined => {
    const { stagger, within, priority } = from;
    const c = byId.get(id);
    if (!c || unknown.has(id) || depth > 8) return undefined;
    const index = section.components.indexOf(c);
    if (invalidProps.has(String(index))) return undefined;
    // A live surface keeps hidden components (the runtime shows them when their condition holds).
    const shown = evaluateCondition(c.visible, data, { locale });
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
    const inside = OVERLAY_COMPONENTS.has(c.component) && c.component !== "Tooltip" ? id : within;
    const children = (c.children ?? [])
      .map((k) =>
        node(k, depth + 1, {
          stagger: staggers
            ? { reveal: motion?.reveal ?? "rise", index: Math.min(i++, 12) }
            : undefined,
          within: inside,
          // RFC-0027: a hero carousel's first slide is what the reader sees first.
          priority:
            priority ||
            (c.component === "Carousel" && c.props?.variant === "hero" && k === c.children?.[0]),
        }),
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
    // RFC-0025 §3: what a Button opens or closes (a close without target closes its own overlay).
    const click =
      c.component === "Button"
        ? (c.props?.onClick as Record<string, unknown> | undefined)
        : undefined;
    const target =
      click?.action === "open" || click?.action === "close"
        ? typeof click.target === "string"
          ? click.target
          : click.action === "close"
            ? within
            : undefined
        : undefined;
    const targetC = target ? byId.get(target) : undefined;
    const fallback = targetC?.component === "Dialog" ? targetC.props?.fallbackHref : undefined;
    const overlay = targetC
      ? {
          target: targetC.id,
          kind: targetC.component,
          ...(typeof fallback === "string" ? { fallback } : {}),
        }
      : undefined;
    const tip = c.component === "Button" || c.component === "Link" ? tips.get(id) : undefined;
    return {
      id,
      component: c.component,
      entry,
      ...(overlay ? { overlay } : {}),
      ...(tip ? { tip } : {}),
      ...(priority ? { priority: true } : {}),
      props: resolveProps(c.props, data, { locale }),
      raw: { ...(c.props ?? {}) },
      ...(live ? { live: true } : {}),
      ...(live && c.visible !== undefined ? { visible: c.visible, hidden: !shown } : {}),
      ...(attrs ? { motion: attrs } : {}),
      ...(split ? { split } : {}),
      children,
    };
  };
  const root = node("root", 1);
  // RFC-0028 §3: a gallery's images show whole, their sides filled with themselves blurred.
  const galleryFit = (n: SurfaceNode, inGallery: boolean) => {
    if (inGallery && n.component === "Image" && n.props.fit === undefined)
      n.props = { ...n.props, fit: "blur-fill" };
    const g = inGallery || (n.component === "Carousel" && n.props.variant === "gallery");
    for (const k of n.children) galleryFit(k, g);
  };
  if (root) galleryFit(root, false);
  return { section, root, unknown: check.unknown, data, live };
}

/** What a page's source offers for entry sources (`GraphSource`). */
export interface SurfaceEntrySource {
  site(): Promise<PermalinkSite>;
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
  const site = sections.some((s) => s.kind === "surface") ? await source.site() : undefined;
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
      loaded[q.key] = pickEntries(list, q, site);
    }
    out[section.id] = loaded;
  }
  return out;
}
