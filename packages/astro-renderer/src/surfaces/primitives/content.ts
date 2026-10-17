/**
 * Content primitives (RFC-0020 §2): headings, text, images, buttons and links, badges, icons,
 * stats, quotes and lists.
 */
import { escapeHtml, renderMarkdown, safeHref } from "../../markdown.ts";
import { IMAGE_FITS, type ImageFit, imageAttributes, imgHtml } from "../../media.ts";
import {
  ALIGN,
  attr,
  iconOf,
  isBinding,
  json,
  type PrimitiveNode,
  type PrimitiveRenderer,
  str,
  text,
} from "../markup.ts";
import { headingInner, splitHtml } from "../motion.ts";

export const headingHtml: PrimitiveRenderer = (node) => {
  const p = node.props;
  const level = [1, 2, 3, 4].includes(Number(p.level)) ? Number(p.level) : 2;
  return `<h${level} class="ch-heading"${attr("align", p.align, ALIGN)}>${headingInner(node)}</h${level}>`;
};

export const textHtml: PrimitiveRenderer = (node, { media }) => {
  const p = node.props;
  // A bound or computed text in a live surface is plain text the runtime keeps in step
  // (RFC-0022: a keypad's display, a result); otherwise it is markdown.
  const live = node.live && isBinding(node.raw?.text);
  const body = node.split
    ? `<p>${splitHtml(str(p.text).replace(/[*_`#>]+/g, ""), node.split)}</p>`
    : live
      ? `<p>${text(node, "text")}</p>`
      : renderMarkdown(str(p.text), media);
  return `<div class="ch-text"${attr("size", p.size, ["s", "m", "l"])}${p.muted === true ? ' data-muted="yes"' : ""}${attr("align", p.align, ALIGN)}>${body}</div>`;
};

export const markdownHtml: PrimitiveRenderer = ({ props: p }, { media }) =>
  `<div class="ch-markdown ch-richtext">${renderMarkdown(str(p.content), media)}</div>`;

export const imageHtml: PrimitiveRenderer = (node, { media }) => {
  const p = node.props;
  const m = /^asset:([a-z]+_[A-Za-z0-9]{6,32})$/.exec(str(p.asset));
  const asset = m ? media?.assets?.get(m[1] as string) : undefined;
  if (!asset) {
    if (m) media?.onMiss?.(m[1] as string);
    return "";
  }
  const defaultLocale = media?.defaultLocale ?? media?.locale ?? "en";
  const fit = (IMAGE_FITS as readonly string[]).includes(str(p.fit))
    ? (str(p.fit) as ImageFit)
    : undefined;
  const img = imgHtml(
    imageAttributes(
      asset,
      { alt: str(p.alt) },
      {
        locale: media?.locale ?? defaultLocale,
        defaultLocale,
        transform: media?.transform ?? "none",
        ...(media?.budget ? { budget: media.budget } : {}),
        sizes: "(min-width: 64rem) 64rem, 100vw",
        ...(media?.preview ? { preview: true } : {}),
        ...(node.priority ? { priority: true } : {}),
        ...(fit ? { fit } : {}),
      },
    ),
  );
  const caption = str(p.caption);
  return `<figure class="ch-figure"${attr("ratio", p.ratio, ["auto", "16:9", "4:3", "1:1", "3:4"])}${fit ? ` data-fit="${fit}"` : ""}>${img}${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ""}</figure>`;
};

/**
 * RFC-0025 §3: a Button that opens or closes an overlay, the browser's own way (Invoker Commands;
 * popovers through popovertarget); a Dialog with a fallback page opens from a real link.
 */
function overlayButtonHtml(
  node: PrimitiveNode & { overlay: NonNullable<PrimitiveNode["overlay"]> },
  scope: string,
  parts: { cls: string; tip: string; label: string },
): string {
  const { cls, tip, label } = parts;
  const o = node.overlay;
  const dom = escapeHtml(`${scope}-${o.target}`);
  const opens = (node.props.onClick as { action?: unknown } | undefined)?.action === "open";
  if (o.kind === "Popover")
    return `<button type="button" class="${cls}" popovertarget="${dom}"${opens ? "" : ' popovertargetaction="hide"'}${tip}>${label}</button>`;
  if (!opens)
    return `<button type="button" class="${cls}" command="close" commandfor="${dom}"${tip}>${label}</button>`;
  const fallback = o.fallback ? safeHref(o.fallback) : undefined;
  if (fallback)
    return `<a class="${cls}" href="${escapeHtml(fallback)}" data-ch-open="${dom}" aria-haspopup="dialog" aria-controls="${dom}"${tip}>${label}</a>`;
  return `<button type="button" class="${cls}" command="show-modal" commandfor="${dom}" aria-haspopup="dialog" aria-controls="${dom}"${tip}>${label}</button>`;
}

/** Button and Link: a link, an action the runtime runs, or an overlay's opener. */
export const buttonLinkHtml: PrimitiveRenderer = (node, { scope, media }) => {
  const p = node.props;
  // RFC-0026: a button's icon, decorative (its label names it), before or after the label.
  const glyph =
    node.component === "Button" ? iconOf(str(p.icon), media, { className: "ch-button__icon" }) : "";
  const label = glyph
    ? p.iconPosition === "end"
      ? `${text(node, "label")}${glyph}`
      : `${glyph}${text(node, "label")}`
    : text(node, "label");
  const cls =
    node.component === "Link"
      ? "ch-link"
      : `ch-button ch-button--${["primary", "secondary", "ghost"].includes(str(p.variant)) ? str(p.variant) : "primary"}`;
  // RFC-0025 §3: a tooltip's trigger, described by it.
  const tip = node.tip
    ? ` interestfor="${escapeHtml(`${scope}-${node.tip}`)}" aria-describedby="${escapeHtml(`${scope}-${node.tip}`)}"`
    : "";
  if (node.component === "Button" && node.overlay)
    return overlayButtonHtml({ ...node, overlay: node.overlay }, scope, { cls, tip, label });
  // An action (RFC-0020 §4): a button the runtime acts on; without JavaScript it does nothing.
  const action = node.component === "Button" ? p.onClick : undefined;
  if (action && typeof action === "object" && !Array.isArray(action)) {
    const a = action as Record<string, unknown>;
    const safe = a.action !== "navigate" || (typeof a.href === "string" && safeHref(a.href));
    if (!safe) return "";
    return `<button type="button" class="${cls}" data-ch-action="${json(a)}"${tip}>${label}</button>`;
  }
  const href = typeof p.href === "string" ? safeHref(p.href) : undefined;
  if (!href) return "";
  return `<a class="${cls}" href="${escapeHtml(href)}"${tip}>${label}</a>`;
};

export const badgeHtml: PrimitiveRenderer = (node, { media }) =>
  `<span class="ch-badge"${attr("tone", node.props.tone, ["neutral", "info", "success", "warning", "danger"])}>${iconOf(str(node.props.icon), media)}${text(node, "label")}</span>`;

/** RFC-0026: an icon on its own; named only when it carries meaning alone. */
export const iconHtml: PrimitiveRenderer = ({ props: p }, { media }) => {
  const glyph = iconOf(str(p.name), media, { label: str(p.label) || undefined });
  return glyph
    ? `<span class="ch-icon-box"${attr("size", p.size, ["s", "m", "l", "xl"])}${attr("tone", p.tone, ["neutral", "brand", "accent", "success", "warning", "danger"])}>${glyph}</span>`
    : "";
};

export const statHtml: PrimitiveRenderer = (node, { media }) => {
  const p = node.props;
  return `<div class="ch-stat">${p.icon ? `<span class="ch-stat__icon">${iconOf(str(p.icon), media)}</span>` : ""}<span class="ch-stat__value">${text(node, "value")}</span><span class="ch-stat__label">${text(node, "label")}</span>${p.detail ? `<span class="ch-stat__detail">${text(node, "detail")}</span>` : ""}</div>`;
};

export const quoteHtml: PrimitiveRenderer = ({ props: p }, { media }) => {
  const cite = str(p.cite);
  const role = str(p.role);
  return `<figure class="ch-quote"><blockquote>${renderMarkdown(str(p.text), media)}</blockquote>${cite || role ? `<figcaption>${cite ? `<cite>${escapeHtml(cite)}</cite>` : ""}${role ? ` <span>${escapeHtml(role)}</span>` : ""}</figcaption>` : ""}</figure>`;
};

export const listHtml: PrimitiveRenderer = ({ props: p }, { media }) => {
  const items = Array.isArray(p.items) ? p.items.slice(0, 50) : [];
  const tag = p.ordered === true ? "ol" : "ul";
  // RFC-0026: an icon of the set as the bullet (decorative), drawn on each item.
  const glyph = iconOf(str(p.marker), media, { className: "ch-list__marker" });
  return `<${tag} class="ch-list"${glyph ? ' data-marker="icon"' : attr("marker", p.marker, ["bullet", "none"])}>${items.map((i) => `<li>${glyph}${escapeHtml(str(i))}</li>`).join("")}</${tag}>`;
};
