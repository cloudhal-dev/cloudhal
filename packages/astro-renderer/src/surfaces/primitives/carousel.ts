/**
 * RFC-0027: a Carousel, a scroll-snap track of slides (each child wrapped by `slideWrapper`),
 * markers as links to the slides and arrows the carousel module reveals; all of it works without
 * it.
 */
import { escapeHtml } from "../../markdown.ts";
import { imageAttributes, imgHtml, type MediaContext } from "../../media.ts";
import { attr, CHILDREN, iconOf, type PrimitiveRenderer, SPACE, str } from "../markup.ts";
import type { SurfaceNode } from "../tree.ts";

/** RFC-0027 27c: a gallery's markers can be its slides' first images, small. */
function thumbHtml(slide: SurfaceNode | undefined, i: number, media?: MediaContext): string {
  const find = (n: SurfaceNode | undefined, depth: number): SurfaceNode | undefined =>
    !n || depth > 3
      ? undefined
      : n.component === "Image"
        ? n
        : n.children.map((c) => find(c, depth + 1)).find(Boolean);
  const img = find(slide, 0);
  const m = /^asset:([a-z]+_[A-Za-z0-9]{6,32})$/.exec(str(img?.props.asset));
  const asset = m ? media?.assets?.get(m[1] as string) : undefined;
  if (!asset) return String(i + 1);
  const defaultLocale = media?.defaultLocale ?? media?.locale ?? "en";
  return imgHtml(
    imageAttributes(
      asset,
      { alt: "" },
      {
        locale: media?.locale ?? defaultLocale,
        defaultLocale,
        transform: media?.transform ?? "none",
        ...(media?.budget ? { budget: media.budget } : {}),
        sizes: "5rem",
        ...(media?.preview ? { preview: true } : {}),
      },
    ),
  ).replace(/ alt="[^"]*"/, ' alt=""');
}

/** The markers: links to the slides, as dots, numbers or (a gallery's) thumbnails. */
function markersHtml(
  slides: readonly SurfaceNode[],
  o: { id: string; style: string; tr: boolean; media?: MediaContext | undefined },
): string {
  const { id, style, tr, media } = o;
  return `<nav class="ch-carousel__markers" data-style="${style}" aria-label="${tr ? "Slaytlar" : "Slides"}">${slides
    .map(
      (c, i) =>
        `<a href="#${id}-${i + 1}" aria-label="${tr ? "Slayt" : "Slide"} ${i + 1}">${style === "dots" ? "" : style === "thumbs" ? thumbHtml(c, i, media) : i + 1}</a>`,
    )
    .join("")}</nav>`;
}

/**
 * RFC-0027 27d: a hero that plays on its own puts its rotation control first in Tab order; the
 * module shows it only where motion may play, and swaps its words and icon.
 */
function rotateHtml(tr: boolean, media?: MediaContext): string {
  const stopWord = tr ? "Slayt geçişini durdur" : "Stop slide rotation";
  const startWord = tr ? "Slayt geçişini başlat" : "Start slide rotation";
  return `<button type="button" class="ch-carousel__rotate" data-ch-carousel="rotate" data-ch-pending data-state="playing" data-stop="${stopWord}" data-start="${startWord}" aria-label="${stopWord}"><span data-when="playing">${iconOf("pause", media)}</span><span data-when="stopped">${iconOf("play", media)}</span></button>`;
}

export const carouselHtml: PrimitiveRenderer = (node, { id, media }) => {
  const p = node.props;
  const tr = (media?.locale ?? "en").startsWith("tr");
  const n = node.children.length;
  const variant = ["hero", "gallery", "testimonials"].includes(str(p.variant))
    ? str(p.variant)
    : "rail";
  const controls = ["arrows", "markers", "none"].includes(str(p.controls))
    ? str(p.controls)
    : "both";
  const arrows = controls === "both" || controls === "arrows";
  const arrow = (dir: "prev" | "next") =>
    `<button type="button" class="ch-carousel__arrow" data-ch-carousel="${dir}" data-ch-pending aria-controls="${id}-track" aria-label="${dir === "prev" ? (tr ? "Önceki slayt" : "Previous slide") : tr ? "Sonraki slayt" : "Next slide"}">${iconOf(dir === "prev" ? "chevron-left" : "chevron-right", media)}</button>`;
  const style =
    p.markers === "dots"
      ? "dots"
      : p.markers === "thumbs" && variant === "gallery"
        ? "thumbs"
        : "numbers";
  const markers =
    controls === "both" || controls === "markers"
      ? markersHtml(node.children, { id, style, tr, media })
      : "";
  const autoplay =
    variant === "hero" && (p.autoplay === "slow" || p.autoplay === "normal") ? str(p.autoplay) : "";
  const rotate = autoplay ? rotateHtml(tr, media) : "";
  const bar =
    arrows || markers
      ? `<div class="ch-carousel__controls">${arrows ? arrow("prev") : ""}${markers}${arrows ? arrow("next") : ""}</div>`
      : "";
  return `<section class="ch-carousel" id="${id}" data-variant="${variant}"${attr("per-view", p.perView === undefined ? undefined : String(p.perView), ["1", "2", "3", "4"])}${attr("item", p.itemWidth, ["s", "m", "l"])}${attr("peek", p.peek, ["none", "s", "m"])}${attr("align", p.align, ["start", "center"])}${attr("gap", p.gap, SPACE)}${attr("aspect", p.aspect, ["16:9", "21:9", "4:3", "1:1", "3:4"])}${variant === "hero" && p.loop === true ? " data-loop" : ""}${autoplay ? ` data-autoplay="${autoplay}"` : ""} data-count="${n}" role="region" aria-roledescription="${tr ? "kaydırmalı alan" : "carousel"}" aria-label="${escapeHtml(str(p.label))}">${rotate}<div class="ch-carousel__track" id="${id}-track" tabindex="0">${CHILDREN}</div>${bar}</section>`;
};
