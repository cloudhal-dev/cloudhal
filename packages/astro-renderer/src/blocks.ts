/**
 * Component sections as HTML (RFC-0015 §5): the built-ins' markup (`block-html.ts`, shared with
 * body directives) used by `Block.astro` (unless the theme maps the type to its own component)
 * and by `preview.ts`, so agents' previews match the site. Props are validated before render.
 */
import type { ComponentSection } from "@cloudhal/core-contracts";
import { type BlockRegistry, createBlockRegistry } from "@cloudhal/core-ts/blocks";
import {
  builtInBlockHtml,
  escapeBlockHtml,
  isBuiltInBlock,
  missingBlockHtml,
} from "./block-html.ts";
import { type MediaContext, renderMarkdown } from "./markdown.ts";

export { isBuiltInBlock };

const builtIns = createBlockRegistry();

/**
 * A component section's markup. Invalid props, or a type no one renders, give nothing on the
 * site and a labelled placeholder in previews (RFC-0015 §6).
 */
export function renderComponentSection(
  section: ComponentSection,
  options: { media?: MediaContext; registry?: BlockRegistry; preview?: boolean } = {},
): string {
  const registry = options.registry ?? builtIns;
  const issues = registry.checkSection(section.type, section.props);
  const known = issues !== undefined && isBuiltInBlock(section.type);
  const html =
    known && issues.length === 0
      ? builtInBlockHtml(section.type, section.props, {
          markdown: (source) => renderMarkdown(source, options.media),
        })
      : "";
  const attrs = `data-section-id="${escapeBlockHtml(section.id)}" data-kind="component" data-block-type="${escapeBlockHtml(section.type)}"`;
  if (html) return `<section class="ch-block" ${attrs}>${html}</section>`;
  if (!options.preview) return "";
  return missingBlockHtml(
    "section",
    attrs,
    section.type,
    issues === undefined || !known ? "unknown block type" : "props do not fit the block type",
  );
}
