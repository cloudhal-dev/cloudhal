/**
 * Block types as HTML (RFC-0015 §5): the built-ins render to escaped, framework-free markup used
 * by `Block.astro` (unless the theme maps the type to its own component) and by `preview.ts`, so
 * agents' previews match the site. Props are validated before render; text props are escaped,
 * markdown props go through the safe markdown renderer, links through `safeHref`. No raw HTML
 * ever comes from props.
 *
 * `embed` renders a link card to the video (no third-party request until the reader follows it);
 * an in-page player needs a first-party script and a per-page CSP and comes later.
 */
import type { ComponentSection } from "@cloudhal/core-contracts";
import {
  type BlockRegistry,
  BUILT_IN_BLOCK_TYPES,
  createBlockRegistry,
} from "@cloudhal/core-ts/blocks";
import { escapeHtml, type MediaContext, renderMarkdown, safeHref } from "./markdown.ts";

const builtIns = createBlockRegistry();
const BUILT_IN = new Set(BUILT_IN_BLOCK_TYPES.map((t) => t.name));

const str = (v: unknown) => (typeof v === "string" ? v : "");

/** A video page's host, for the card's label ("youtube.com"). */
function videoHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^(www|m)\./, "");
  } catch {
    return "";
  }
}

function render(type: string, props: Record<string, unknown>, media?: MediaContext): string {
  switch (type) {
    case "callout": {
      const tone = ["info", "success", "warning", "danger"].includes(str(props.tone))
        ? str(props.tone)
        : "info";
      const title = str(props.title);
      return `<aside class="ch-callout ch-callout--${tone}" role="note" data-block="callout">${
        title ? `<p class="ch-callout__title"><strong>${escapeHtml(title)}</strong></p>` : ""
      }<div class="ch-callout__body">${renderMarkdown(str(props.content), media)}</div></aside>`;
    }
    case "button": {
      const href = safeHref(str(props.href));
      const variant = props.variant === "secondary" ? "secondary" : "primary";
      const label = escapeHtml(str(props.label));
      return href
        ? `<p class="ch-button-row" data-block="button"><a class="ch-button ch-button--${variant}" href="${escapeHtml(href)}">${label}</a></p>`
        : "";
    }
    case "embed": {
      const href = safeHref(str(props.url));
      const title = escapeHtml(str(props.title));
      return href
        ? `<figure class="ch-embed" data-block="embed"><a class="ch-embed__link" href="${escapeHtml(href)}" rel="noopener noreferrer" target="_blank"><span class="ch-embed__play" aria-hidden="true">▶</span><span class="ch-embed__title">${title}</span><span class="ch-embed__host">${escapeHtml(videoHost(href))}</span></a></figure>`
        : "";
    }
    case "faq": {
      const items = Array.isArray(props.items) ? (props.items as Record<string, unknown>[]) : [];
      return `<div class="ch-faq" data-block="faq">${items
        .map(
          (item) =>
            `<details class="ch-faq__item"><summary>${escapeHtml(str(item.question))}</summary><div class="ch-faq__answer">${renderMarkdown(str(item.answer), media)}</div></details>`,
        )
        .join("")}</div>`;
    }
    default:
      return "";
  }
}

/** Is `type` rendered by Cloudhal itself (a built-in)? Themes may still map it to their own. */
export const isBuiltInBlock = (type: string) => BUILT_IN.has(type);

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
    known && issues.length === 0 ? render(section.type, section.props, options.media) : "";
  const attrs = `data-section-id="${escapeHtml(section.id)}" data-kind="component" data-block-type="${escapeHtml(section.type)}"`;
  if (html) return `<section class="ch-block" ${attrs}>${html}</section>`;
  if (!options.preview) return "";
  const why =
    issues === undefined || !known ? "unknown block type" : "props do not fit the block type";
  return `<section class="ch-block ch-block--missing" ${attrs}><p>${escapeHtml(`${section.type}: ${why}`)}</p></section>`;
}
