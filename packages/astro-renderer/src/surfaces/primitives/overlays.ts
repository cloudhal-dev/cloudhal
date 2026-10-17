/**
 * RFC-0025 §3: overlays, closed until the reader opens them (top layer when open): dialogs and
 * drawers, popovers, tooltips and lightboxes.
 */
import { escapeHtml } from "../../markdown.ts";
import { imageAttributes, imgHtml, type MediaContext } from "../../media.ts";
import { attr, CHILDREN, closeButton, iconOf, type PrimitiveRenderer, str } from "../markup.ts";

/**
 * RFC-0025 §3: a Lightbox's thumbnails, each a link to its image (the way in without JavaScript),
 * and its modal dialog with every image, one shown at a time (the overlay module moves through them).
 */
function lightboxHtml(id: string, p: Record<string, unknown>, media?: MediaContext): string {
  const defaultLocale = media?.defaultLocale ?? media?.locale ?? "en";
  const locale = media?.locale ?? defaultLocale;
  const tr = locale.startsWith("tr");
  const opts = {
    locale,
    defaultLocale,
    transform: media?.transform ?? "none",
    ...(media?.budget ? { budget: media.budget } : {}),
    ...(media?.preview ? { preview: true } : {}),
  } as const;
  const items = (Array.isArray(p.items) ? p.items : []).slice(0, 24).flatMap((raw) => {
    const it = (raw ?? {}) as Record<string, unknown>;
    const m = /^asset:([a-z]+_[A-Za-z0-9]{6,32})$/.exec(str(it.asset));
    const asset = m ? media?.assets?.get(m[1] as string) : undefined;
    if (!asset) {
      if (m) media?.onMiss?.(m[1] as string);
      return [];
    }
    return [{ asset, alt: str(it.alt), caption: str(it.caption) }];
  });
  if (items.length === 0) return "";
  const start = Math.min(Math.max(Number(p.start) || 0, 0), items.length - 1);
  const title = str(p.title) || (tr ? "Görseller" : "Images");
  const thumbs = items
    .map((it, i) => {
      const full = imageAttributes(it.asset, { alt: it.alt }, { ...opts, sizes: "100vw" });
      const thumb = imgHtml(
        imageAttributes(it.asset, { alt: it.alt }, { ...opts, sizes: "12rem" }),
      );
      return `<li><a class="ch-lightbox__thumb" href="${escapeHtml(full.src)}" data-ch-lightbox="${id}" data-index="${i}">${thumb}</a></li>`;
    })
    .join("");
  const figures = items
    .map((it, i) => {
      const img = imgHtml(
        imageAttributes(it.asset, { alt: it.alt }, { ...opts, sizes: "100vw", fit: "blur-fill" }),
      );
      return `<figure class="ch-lightbox__item" data-index="${i}"${i === start ? "" : " hidden"}>${img}${it.caption ? `<figcaption>${escapeHtml(it.caption)}</figcaption>` : ""}</figure>`;
    })
    .join("");
  const nav =
    items.length > 1
      ? `<div class="ch-lightbox__nav"><button type="button" class="ch-lightbox__prev" command="--prev" commandfor="${id}" aria-label="${tr ? "Önceki" : "Previous"}">${iconOf("chevron-left", media)}</button><button type="button" class="ch-lightbox__next" command="--next" commandfor="${id}" aria-label="${tr ? "Sonraki" : "Next"}">${iconOf("chevron-right", media)}</button></div>`
      : "";
  return `<div class="ch-lightbox"><ul class="ch-lightbox__grid" aria-label="${escapeHtml(title)}">${thumbs}</ul><dialog id="${id}" class="ch-dialog ch-lightbox__dialog" closedby="any" aria-label="${escapeHtml(title)}"><header class="ch-dialog__head"><span class="ch-lightbox__count" aria-live="polite">${start + 1} / ${items.length}</span>${closeButton(id, tr, media)}</header><div class="ch-lightbox__stage">${figures}</div>${nav}</dialog></div>`;
}

/** Dialog and Drawer: a modal `<dialog>` with a title and a close button. */
export const dialogHtml: PrimitiveRenderer = (node, { id, media }) => {
  const p = node.props;
  const tr = (media?.locale ?? "en").startsWith("tr");
  const closedby = { any: "any", closerequest: "closerequest", explicit: "none" }[
    str(p.dismiss) as "any"
  ];
  const drawer = node.component === "Drawer";
  return `<dialog id="${id}" class="ch-dialog${drawer ? " ch-drawer" : ""}"${attr("size", p.size, ["s", "m", "l"])}${drawer ? attr("placement", p.placement ?? "end", ["start", "end", "bottom"]) : ""} closedby="${closedby ?? "any"}" aria-labelledby="${id}-title"><header class="ch-dialog__head"><h2 class="ch-dialog__title" id="${id}-title">${escapeHtml(str(p.title))}</h2>${closeButton(id, tr, media)}</header><div class="ch-dialog__body">${CHILDREN}</div></dialog>`;
};

export const popoverHtml: PrimitiveRenderer = ({ props: p }, { id }) =>
  `<div popover="auto" id="${id}" class="ch-popover"${attr("placement", p.placement ?? "bottom", ["bottom", "top", "start", "end"])}${attr("width", p.width, ["s", "m", "l"])}>${CHILDREN}</div>`;

export const tooltipHtml: PrimitiveRenderer = ({ props: p }, { id }) =>
  `<div popover="hint" id="${id}" class="ch-tooltip" role="tooltip">${escapeHtml(str(p.text))}</div>`;

export const lightboxNodeHtml: PrimitiveRenderer = ({ props: p }, { id, media }) =>
  lightboxHtml(id, p, media);
