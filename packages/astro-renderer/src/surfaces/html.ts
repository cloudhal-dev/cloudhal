/**
 * A surface as HTML (RFC-0020 §1, §4): each node's markup with its wrappers (visibility, carousel
 * slides, preview ids) and the surface's own wrapper with its data and runtime modules. Previews
 * label unknown components and theme blocks. Worker-safe.
 */
import type { SurfaceSection } from "@cloudhal/core-contracts";
import {
  INPUT_MODEL,
  OVERLAY_COMPONENTS,
  surfaceLoops,
  usesMotion,
} from "@cloudhal/core-ts/surfaces";
import { builtInBlockHtml, isBuiltInBlock, missingBlockHtml } from "../block-html.ts";
import { CAROUSEL_SCRIPT } from "../carousel-client.ts";
import { escapeHtml, renderMarkdown } from "../markdown.ts";
import type { MediaContext } from "../media.ts";
import { MOTION_SCRIPT } from "../motion-client.ts";
import { OVERLAY_SCRIPT } from "../overlay-client.ts";
import { SURFACE_SCRIPT, scriptJson } from "../surface-client.ts";
import { CHILDREN, json } from "./markup.ts";
import { withMotion } from "./motion.ts";
import { primitiveHtml } from "./primitives/index.ts";
import { type SurfaceContext, type SurfaceNode, surfaceTree } from "./tree.ts";

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
 * RFC-0027: the box around a Carousel's i-th child (a named slide the markers link to); nothing
 * for other parents. Both renderers (`nodeHtml`, `SurfaceNode.astro`) wrap each child with it.
 */
export function slideWrapper(
  parent: Pick<SurfaceNode, "id" | "component" | "children">,
  index: number,
  scope: string,
  media?: MediaContext,
): [string, string] {
  if (parent.component !== "Carousel") return ["", ""];
  const tr = (media?.locale ?? "en").startsWith("tr");
  const n = parent.children.length;
  const id = escapeHtml(`${scope}-${parent.id}-${index + 1}`);
  return [
    `<div class="ch-carousel__slide" id="${id}" role="group" aria-roledescription="${tr ? "slayt" : "slide"}" aria-label="${tr ? `${index + 1} / ${n}` : `${index + 1} of ${n}`}">`,
    "</div>",
  ];
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
  const inner = node.children
    .map((c, i) => {
      const [open, close] = slideWrapper(node, i, scope, ctx.media);
      return open + nodeHtml(c, scope, ctx) + close;
    })
    .join("");
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
  const motion =
    (usesMotion(section)
      ? `${pause}<script type="module" src="${MOTION_SCRIPT.path}"></script>`
      : "") +
    // RFC-0025 §3: the overlay module, only for surfaces with an overlay.
    (section.components.some((c) => OVERLAY_COMPONENTS.has(c.component))
      ? `<script type="module" src="${OVERLAY_SCRIPT.path}"></script>`
      : "") +
    // RFC-0027 27b: the carousel module, only for surfaces with a carousel.
    (section.components.some((c) => c.component === "Carousel")
      ? `<script type="module" src="${CAROUSEL_SCRIPT.path}"></script>`
      : "");
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
