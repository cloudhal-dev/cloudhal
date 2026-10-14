/**
 * The built-in block types' markup (RFC-0015 §5), shared by component sections (`blocks.ts`) and
 * body directives (`markdown.ts`), so a block looks the same in both. Text props are escaped,
 * markdown props go through the caller's safe markdown renderer, links through `safeHref`; no raw
 * HTML ever comes from props.
 *
 * `embed` renders a link card to the video; the first-party player module (`embed-client.ts`)
 * turns it into the player when the reader follows it, so the video host sees nothing before.
 */
import { BUILT_IN_BLOCK_TYPES } from "@cloudhal/core-ts/blocks";
import { EMBED_SCRIPT, embedPlayerSrc } from "./embed-client.ts";
import { safeHref } from "./safe-urls.ts";

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const BUILT_IN = new Set(BUILT_IN_BLOCK_TYPES.map((t) => t.name));

/** Is `type` rendered by Cloudhal itself (a built-in)? Themes may still map it to their own. */
export const isBuiltInBlock = (type: string) => BUILT_IN.has(type);

const str = (v: unknown) => (typeof v === "string" ? v : "");

/** A video page's host, for the card's label ("youtube.com"). */
function videoHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^(www|m)\./, "");
  } catch {
    return "";
  }
}

export interface BlockHtmlContext {
  /** Renders a markdown prop safely (asset links resolved). */
  markdown: (source: string) => string;
  /** A container's inner text, already rendered; else `props.content` goes through `markdown`. */
  contentHtml?: string;
}

/** A built-in block's markup for valid props; "" for a type that is not built in. */
export function builtInBlockHtml(
  type: string,
  props: Readonly<Record<string, unknown>>,
  ctx: BlockHtmlContext,
): string {
  switch (type) {
    case "callout": {
      const tone = ["info", "success", "warning", "danger"].includes(str(props.tone))
        ? str(props.tone)
        : "info";
      const title = str(props.title);
      const body = ctx.contentHtml ?? ctx.markdown(str(props.content));
      return `<aside class="ch-callout ch-callout--${tone}" role="note" data-block="callout">${
        title ? `<p class="ch-callout__title"><strong>${escapeHtml(title)}</strong></p>` : ""
      }<div class="ch-callout__body">${body}</div></aside>`;
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
      if (!href) return "";
      // The link card works without JavaScript; the first-party player module swaps it for the
      // video's iframe when followed (`embed-client.ts`), so nothing loads from the host before.
      const player = embedPlayerSrc(href);
      const data = player
        ? ` data-embed-src="${escapeHtml(player)}" data-embed-title="${title}"`
        : "";
      return `<figure class="ch-embed" data-block="embed"${data}><a class="ch-embed__link" href="${escapeHtml(href)}" rel="noopener noreferrer" target="_blank"><span class="ch-embed__play" aria-hidden="true">▶</span><span class="ch-embed__title">${title}</span><span class="ch-embed__host">${escapeHtml(videoHost(href))}</span></a>${
        player ? `<script type="module" src="${EMBED_SCRIPT.path}"></script>` : ""
      }</figure>`;
    }
    case "faq": {
      const items = Array.isArray(props.items) ? (props.items as Record<string, unknown>[]) : [];
      return `<div class="ch-faq" data-block="faq">${items
        .map(
          (item) =>
            `<details class="ch-faq__item"><summary>${escapeHtml(str(item.question))}</summary><div class="ch-faq__answer">${ctx.markdown(str(item.answer))}</div></details>`,
        )
        .join("")}</div>`;
    }
    default:
      return "";
  }
}

/** What previews show in place of a block that renders nothing on the site (RFC-0015 §6). */
export function missingBlockHtml(
  tag: "section" | "div",
  attrs: string,
  type: string,
  why: "unknown block type" | "props do not fit the block type" | "shown by the theme on the site",
): string {
  return `<${tag} class="ch-block ch-block--missing" ${attrs}><p>${escapeHtml(`${type}: ${why}`)}</p></${tag}>`;
}

export { escapeHtml as escapeBlockHtml };
