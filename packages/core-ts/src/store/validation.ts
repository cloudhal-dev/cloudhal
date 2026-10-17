/** Write-time checks the store runs that are not JSON Schema: paths, theme config, body blocks. */
import type { NodeRef, Page } from "@cloudhal/core-contracts";
import { BLOCK_LIMITS, type BlockRegistry, type PropsSchema, validateProps } from "../blocks.ts";
import { bodyDirectives } from "../body-blocks.ts";
import { checkDirective } from "../directives.ts";
import { InvariantError } from "../errors.ts";
import { isReservedMediaPath } from "../media/types.ts";
import { SEARCH_PATH } from "../search.ts";
import { checkBodySurfaces, checkPageSurfaces, createCatalog } from "../surfaces.ts";

import type { SnapshotDiff } from "./types.ts";

/**
 * Invariant 12 (RFC-0004): `/media/<16 hex>/…` belongs to the media route; RFC-0019 §3: `/search`
 * to the site's search page.
 */
export function checkReservedPath(path: string | undefined, current?: string): void {
  if (path && isReservedMediaPath(path))
    throw new InvariantError(
      "reserved_path",
      `${path} is reserved for media URLs (/media/<16 hex>/…); choose another path`,
    );
  // A page that already had the path (before search existed) keeps it; it wins over search.
  if (path === SEARCH_PATH && current !== SEARCH_PATH)
    throw new InvariantError(
      "reserved_path",
      `${path} is the site's search page; choose another path`,
    );
}

/** Set difference of node refs by id; a node is "changed" when its hash differs. */
export function diffNodeRefs(before: readonly NodeRef[], after: readonly NodeRef[]): SnapshotDiff {
  const b = new Map(before.map((n) => [n.id, n]));
  const a = new Map(after.map((n) => [n.id, n]));
  const added: NodeRef[] = [];
  const removed: NodeRef[] = [];
  const changed: Array<{ before: NodeRef; after: NodeRef }> = [];
  for (const [id, node] of a) {
    const prev = b.get(id);
    if (!prev) added.push(node);
    else if (prev.hash !== node.hash) changed.push({ before: prev, after: node });
  }
  for (const [id, node] of b) if (!a.has(id)) removed.push(node);
  return { added, removed, changed };
}

/**
 * RFC-0015 §7: every component section of a known type follows its props schema; unknown types
 * are kept (a theme may have removed them) but still capped at the prop limit.
 */
/** A site's design settings must fit the theme's schema when they change (RFC-0017 §1). */
export function checkThemeConfig(
  schema: PropsSchema | undefined,
  config: Record<string, unknown> | undefined,
  stored: Record<string, unknown> | undefined,
): void {
  if (!schema || config === undefined) return;
  if (stored !== undefined && JSON.stringify(stored) === JSON.stringify(config)) return;
  const issues = validateProps(schema, config);
  if (issues.length)
    throw new InvariantError(
      "invalid_props",
      `theme settings: ${issues.map((i) => `${i.path || "settings"} ${i.message}`).join("; ")}`,
      { type: "theme", issues },
    );
}

/** Body directives of known types must fit them (RFC-0015 §7); unknown ones are kept. */
/** RFC-0020 §5: a body's ```surface fences follow the same rules as page surfaces. */
export function checkBodyFences(blocks: BlockRegistry, markdown: string, where: string): void {
  if (!markdown.includes("surface")) return;
  const issues = checkBodySurfaces(markdown, createCatalog({ blocks }));
  if (issues.length)
    throw new InvariantError(
      "invalid_surface",
      `${where}: ${issues.map((i) => `${i.path} ${i.message}`).join("; ")}`,
      { issues },
    );
}

export function checkBodyDirectives(blocks: BlockRegistry, markdown: string, where: string): void {
  checkBodyFences(blocks, markdown, where);
  if (!markdown.includes("::")) return;
  for (const d of bodyDirectives(markdown)) {
    const issues = checkDirective(blocks, d);
    if (issues?.length)
      throw new InvariantError(
        "invalid_props",
        `${where}: ${d.name}: ${issues.map((i) => `${i.path || "props"} ${i.message}`).join("; ")}`,
        { type: d.name, issues },
      );
  }
}

export function checkComponentSections(blocks: BlockRegistry, page: Page): void {
  // RFC-0020 §1: surfaces must hold together; unknown components are kept, not refused.
  const surfaceIssues = page.sections.some((s) => s.kind === "surface")
    ? checkPageSurfaces(page.sections, createCatalog({ blocks }))
    : [];
  if (surfaceIssues.length)
    throw new InvariantError(
      "invalid_surface",
      `page ${page.id}: ${surfaceIssues.map((i) => `${i.path} ${i.message}`).join("; ")}`,
      { issues: surfaceIssues },
    );
  for (const section of page.sections) {
    if (section.kind === "richText" && section.format === "markdown")
      checkBodyDirectives(blocks, section.body, `section ${section.id}`);
    if (section.kind !== "component") continue;
    const issues =
      Object.keys(section.props).length > BLOCK_LIMITS.props
        ? [{ path: "", message: `at most ${BLOCK_LIMITS.props} props` }]
        : (blocks.checkSection(section.type, section.props) ?? []);
    if (issues.length)
      throw new InvariantError(
        "invalid_props",
        `section ${section.id} (${section.type}): ${issues.map((i) => `${i.path || "props"} ${i.message}`).join("; ")}`,
        { sectionId: section.id, type: section.type, issues },
      );
  }
}
