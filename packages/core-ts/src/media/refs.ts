/**
 * Where nodes refer to assets (RFC-0004 §2.2–§2.3, §4.4): `ImageRef.assetId` in every image slot,
 * and `asset:<id>` link and image targets in markdown bodies, found with marked's lexer (the
 * renderer's tokenizer), so references inside code blocks or inline code do not count. Worker-safe.
 */
import type { Asset, ContentEntry, ImageRef, Page, Site, Term } from "@cloudhal/core-contracts";
import { Lexer, type Token, type Tokens } from "marked";
import { assetUrl } from "./types.ts";

/** `asset:<id>`, exactly: lower-case scheme, no path, query, fragment or whitespace (§7.6). */
export const ASSET_HREF = /^asset:(asset_[A-Za-z0-9]{6,32})$/;

export interface AssetRefUse {
  readonly assetId: string;
  /** The slot: `coverImage`, `seo.ogImage`, `sections.<id>.image`, `body`, `brand.logo`… */
  readonly field: string;
}

/** The site counts for its brand's logos (RFC-0025). */
type RefKind = "page" | "contentEntry" | "term" | "site";
type RefNode = Page | ContentEntry | Term | Site;

/** Asset ids linked or embedded by a markdown text (code spans and blocks excluded). */
export function markdownAssetIds(markdown: string): string[] {
  const ids = new Set<string>();
  const walk = (tokens: readonly Token[] | undefined) => {
    for (const t of tokens ?? []) {
      if (t.type === "link" || t.type === "image") {
        const m = ASSET_HREF.exec((t as Tokens.Link | Tokens.Image).href.trim());
        if (m) ids.add(m[1] as string);
      }
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
  return [...ids];
}

/** Every ImageRef slot of a node with its field name (§2.2 table). */
export function imageSlots(
  kind: RefKind,
  node: RefNode,
): { field: string; ref: ImageRef; set(next: ImageRef): void }[] {
  const out: { field: string; ref: ImageRef; set(next: ImageRef): void }[] = [];
  if (kind === "site") {
    const brand = (node as Site).brand;
    if (brand?.logo)
      out.push({ field: "brand.logo", ref: brand.logo, set: (r) => (brand.logo = r) });
    if (brand?.logoDark)
      out.push({ field: "brand.logoDark", ref: brand.logoDark, set: (r) => (brand.logoDark = r) });
  } else if (kind === "contentEntry") {
    const e = node as ContentEntry;
    if (e.coverImage)
      out.push({ field: "coverImage", ref: e.coverImage, set: (r) => (e.coverImage = r) });
  } else if (kind === "page") {
    const p = node as Page;
    const seo = p.seo;
    if (seo?.ogImage)
      out.push({ field: "seo.ogImage", ref: seo.ogImage, set: (r) => (seo.ogImage = r) });
    for (const s of p.sections)
      if ((s.kind === "hero" || s.kind === "image") && s.image) {
        const section = s;
        out.push({
          field: `sections.${s.id}.image`,
          ref: s.image,
          set: (r) => {
            section.image = r;
          },
        });
      }
  } else {
    const t = node as Term;
    if (t.image) out.push({ field: "image", ref: t.image, set: (r) => (t.image = r) });
    for (const [locale, label] of Object.entries(t.labels)) {
      const seo = label?.seo;
      if (seo?.ogImage)
        out.push({
          field: `labels.${locale}.seo.ogImage`,
          ref: seo.ogImage,
          set: (r) => (seo.ogImage = r),
        });
    }
  }
  return out;
}

/** Markdown bodies of a node with their field names (html bodies are trusted and not scanned). */
export function markdownSlots(kind: RefKind, node: RefNode): { field: string; text: string }[] {
  if (kind === "site") return [];
  if (kind === "contentEntry") {
    const e = node as ContentEntry;
    return e.body.format === "markdown" ? [{ field: "body", text: e.body.value }] : [];
  }
  if (kind === "page")
    return (node as Page).sections.flatMap((s) =>
      s.kind === "richText" && s.format === "markdown"
        ? [{ field: `sections.${s.id}.body`, text: s.body }]
        : [],
    );
  return Object.entries((node as Term).labels).flatMap(([locale, l]) =>
    l?.description ? [{ field: `labels.${locale}.description`, text: l.description }] : [],
  );
}

/** Every asset reference of a node, deduplicated by (asset, field), in a stable order. */
export function assetRefsOf(kind: string, node: unknown): AssetRefUse[] {
  if (kind !== "page" && kind !== "contentEntry" && kind !== "term" && kind !== "site") return [];
  const n = node as RefNode;
  const seen = new Set<string>();
  const out: AssetRefUse[] = [];
  const add = (assetId: string, field: string) => {
    const key = `${assetId}\n${field}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ assetId, field });
  };
  for (const slot of imageSlots(kind, n)) if (slot.ref.assetId) add(slot.ref.assetId, slot.field);
  for (const slot of markdownSlots(kind, n))
    for (const id of markdownAssetIds(slot.text)) add(id, slot.field);
  return out.sort((a, b) => a.assetId.localeCompare(b.assetId) || a.field.localeCompare(b.field));
}

/**
 * API and MCP inputs may send `{ assetId, alt? }` without `src` (§2.2): give such refs a
 * placeholder `src` (and `alt: ""`) so the document validates; the store then writes the real URL.
 * Defensive: an input of the wrong shape is left for schema validation to reject.
 */
export function fillMissingSrc(kind: string, node: unknown): void {
  if (kind !== "page" && kind !== "contentEntry" && kind !== "term" && kind !== "site") return;
  try {
    for (const slot of imageSlots(kind, node as RefNode)) {
      const ref = slot.ref as Partial<ImageRef> | null;
      if (!ref || typeof ref !== "object" || typeof ref.assetId !== "string") continue;
      if (typeof ref.src !== "string" || ref.src === "")
        slot.set({ ...ref, src: `asset:${ref.assetId}`, alt: ref.alt ?? "" } as ImageRef);
      else if (ref.alt === undefined) slot.set({ ...ref, alt: "" } as ImageRef);
    }
  } catch {
    // not a valid node; validation reports it
  }
}

/**
 * Invariant 8: an ImageRef with `assetId` carries the asset's URL in `src` and its intrinsic size
 * in `width`/`height` (as of the write), for readers that do not resolve assets. Mutates `node`
 * (pass a copy). Unknown ids are left alone; the store refuses them separately.
 */
export function canonicalImageRefs(
  kind: RefKind,
  node: RefNode,
  assets: ReadonlyMap<string, Asset>,
): void {
  for (const slot of imageSlots(kind, node)) {
    const id = slot.ref.assetId;
    const asset = id ? assets.get(id) : undefined;
    if (!asset) continue;
    const { width, height, ...rest } = slot.ref;
    const size = asset.image
      ? { width: asset.image.width, height: asset.image.height }
      : {
          ...(width !== undefined ? { width } : {}),
          ...(height !== undefined ? { height } : {}),
        };
    slot.set({ ...rest, alt: slot.ref.alt ?? "", src: assetUrl(asset), ...size });
  }
}
