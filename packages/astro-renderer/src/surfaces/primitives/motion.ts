/** Motion primitives (RFC-0024 §3, 24c): marquees, counters, scroll stories and progress. */
import { escapeHtml } from "../../markdown.ts";
import { attr, CHILDREN, isBinding, type PrimitiveRenderer, SPACE, str, text } from "../markup.ts";

/** RFC-0024 24c: a row the motion module sets moving (a still, wrapping row until then). */
export const marqueeHtml: PrimitiveRenderer = ({ props: p }) =>
  `<div class="ch-marquee"${attr("speed", p.speed, ["slow", "normal", "fast"])}${attr("direction", p.direction, ["start", "end"])}${p.pauseOnHover === false ? "" : " data-hover-pause"}${attr("gap", p.gap, SPACE)}><div class="ch-marquee__track">${CHILDREN}</div></div>`;

/** RFC-0024 24c: the final number is in the page; the motion module counts up to it once. */
export const counterHtml: PrimitiveRenderer = (node, { media }) => {
  const p = node.props;
  const bound = node.live && isBinding(node.raw?.value);
  const to = Number(p.value);
  const decimals = Number.isInteger(p.decimals)
    ? Math.min(3, Math.max(0, p.decimals as number))
    : 0;
  const shown = Number.isFinite(to)
    ? new Intl.NumberFormat(media?.locale ?? "en", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(to)
    : "";
  const from = Number.isFinite(Number(p.from)) ? Number(p.from) : 0;
  const prefix = escapeHtml(str(p.prefix));
  const suffix = escapeHtml(str(p.suffix));
  const value = bound
    ? text(node, "value")
    : // The final number twice in one grid cell: a hidden copy holds the width while the
      // other counts (no layout shift, whatever the font's digits and separators).
      `<span class="sr-only">${escapeHtml(shown)}</span><span class="ch-counter__num" aria-hidden="true"><span class="ch-counter__hold">${escapeHtml(shown)}</span><span class="ch-counter__live"${Number.isFinite(to) ? ` data-ch-count="${to}" data-ch-from="${from}" data-ch-decimals="${decimals}"` : ""}${attr("ch-speed", p.duration, ["fast", "normal", "slow"])}>${escapeHtml(shown)}</span></span>`;
  return `<div class="ch-counter"><span class="ch-counter__value">${prefix}${value}${suffix}</span>${p.label ? `<span class="ch-counter__label">${text(node, "label")}</span>` : ""}</div>`;
};

/** RFC-0024 §3: scroll storytelling; the motion module writes the step being read to `step`. */
export const scrollyHtml: PrimitiveRenderer = (node) => {
  const p = node.props;
  const bound = node.raw?.step as { path?: unknown } | undefined;
  const step = bound && typeof bound === "object" ? str(bound.path) : "";
  return `<div class="ch-scrolly"${attr("side", p.side, ["start", "end"])}${attr("ratio", p.ratio, ["1-1", "2-1", "1-2"])}${/^\/[^\s"<>]{0,199}$/.test(step) ? ` data-ch-step-path="${escapeHtml(step)}"` : ""}>${CHILDREN}</div>`;
};

export const stepHtml: PrimitiveRenderer = () => `<div class="ch-step">${CHILDREN}</div>`;

export const scrollProgressHtml: PrimitiveRenderer = ({ props: p }) =>
  `<div class="ch-progress"${attr("placement", p.placement ?? "page", ["page", "section"])}${attr("tone", p.tone, ["brand", "accent", "neutral"])} aria-hidden="true"><span class="ch-progress__bar"></span></div>`;
