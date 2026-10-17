/**
 * Motion on a surface (RFC-0024 §2, §7): a component's motion as `data-ch-*` attributes, kinetic
 * type (split text, heading effects) and placing the attributes on a markup's outer element.
 * Worker-safe.
 */
import {
  MOTION_HOVERS,
  MOTION_LOOPS,
  MOTION_REVEALS,
  MOTION_SCROLLS,
  MOTION_SPEEDS,
} from "@cloudhal/core-ts/surfaces";
import { escapeHtml } from "../markdown.ts";
import { str, text } from "./markup.ts";
import type { SurfaceNode } from "./tree.ts";

export interface MotionFields {
  morph?: string;
  reveal?: string | undefined;
  scroll?: string;
  depth?: number;
  loop?: string;
  hover?: string;
  speed?: string;
  delay?: number;
  stagger?: boolean;
  replay?: boolean;
}

/**
 * A component's motion as attributes the theme's motion layer styles: the reveal (its own, or
 * the one a staggered parent hands down), speed, delay in stagger steps (`data-ch-d`), hover and
 * replay. Only known values pass, so nothing a model wrote reaches the page as free text.
 */
export function motionAttrs(
  motion: MotionFields | undefined,
  stagger?: { reveal: string; index: number },
): string {
  const out: string[] = [];
  const reveal = motion?.reveal ?? stagger?.reveal;
  if (reveal && (MOTION_REVEALS as readonly string[]).includes(reveal))
    out.push(` data-ch-reveal="${reveal}"`);
  if (motion?.speed && (MOTION_SPEEDS as readonly string[]).includes(motion.speed))
    out.push(` data-ch-speed="${motion.speed}"`);
  const delay =
    (Number.isInteger(motion?.delay) ? Math.min(4, Math.max(0, motion?.delay as number)) : 0) +
    (stagger?.index ?? 0);
  if (reveal && delay > 0) out.push(` data-ch-d="${Math.min(delay, 16)}"`);
  if (motion?.hover && (MOTION_HOVERS as readonly string[]).includes(motion.hover))
    out.push(` data-ch-hover="${motion.hover}"`);
  if (reveal && motion?.replay === true) out.push(" data-ch-replay");
  // RFC-0024 24b: moves with the scroll instead (never together with a reveal).
  if (!reveal && motion?.scroll && (MOTION_SCROLLS as readonly string[]).includes(motion.scroll)) {
    out.push(` data-ch-scroll="${motion.scroll}"`);
    const depth = motion.depth;
    if (Number.isInteger(depth) && depth !== 0 && Math.abs(depth as number) <= 3)
      out.push(` data-ch-dep="${depth}"`);
  }
  // RFC-0024 §5: a morph key becomes the element's view-transition name (the same key on two
  // pages moves one into the other on navigation).
  if (typeof motion?.morph === "string" && /^[a-z][a-z0-9-]{0,30}$/.test(motion.morph))
    out.push(` style="view-transition-name:ch-m-${motion.morph}"`);
  // RFC-0024 24c: a loop decorates on its own (never with a reveal or a scroll effect).
  if (
    !reveal &&
    !motion?.scroll &&
    motion?.loop &&
    (MOTION_LOOPS as readonly string[]).includes(motion.loop)
  )
    out.push(` data-ch-loop="${motion.loop}"`);
  return out.join("");
}

/**
 * RFC-0024 24c: a text split into pieces for kinetic type: words (or, for `chars`, words of
 * characters), each with its place in the sequence as `--ch-i`, hidden from screen readers,
 * which read the whole text once from a visually hidden copy. `lines` are numbered in the page,
 * once the line breaks are known (the motion module).
 */
export function splitHtml(text: string, mode: "words" | "chars" | "lines"): string {
  const words = text.split(/\s+/).filter(Boolean);
  let i = 0;
  const pieces = words.map((w) => {
    if (mode !== "chars")
      return `<span class="ch-w"${mode === "words" ? ` style="--ch-i:${i++}"` : ""}>${escapeHtml(w)}</span>`;
    const chars = Array.from(w)
      .map((c) => `<span class="ch-c" style="--ch-i:${i++}">${escapeHtml(c)}</span>`)
      .join("");
    return `<span class="ch-w">${chars}</span>`;
  });
  return `<span class="sr-only">${escapeHtml(text)}</span><span class="ch-split" data-mode="${mode}" aria-hidden="true">${pieces.join(" ")}</span>`;
}

/** RFC-0024 24c: a heading's text with its effect (highlight, gradient text or rotating words). */
export function headingInner(
  node: Pick<SurfaceNode, "props"> & Partial<Pick<SurfaceNode, "raw" | "live" | "split">>,
): string {
  const p = node.props;
  const raw = str(p.text);
  if (node.split) return splitHtml(raw.replace(/\*/g, ""), node.split);
  const words = Array.isArray(p.words) ? p.words.slice(0, 6).map(str).filter(Boolean) : [];
  if (p.effect === "rotate-words" && words.length >= 2) {
    const [before, after = ""] = raw.includes("{words}")
      ? raw.split("{words}", 2)
      : [`${raw} `, ""];
    const turns = words
      .map(
        (w, i) =>
          `<span class="ch-rotate__word"${i === 0 ? " data-active" : ""}>${escapeHtml(w)}</span>`,
      )
      .join("");
    return `${escapeHtml(before ?? "")}<span class="sr-only">${escapeHtml(words.join(", "))}</span><span class="ch-rotate" data-ch-rotate aria-hidden="true">${turns}</span>${escapeHtml(after)}`;
  }
  if (p.effect === "highlight") {
    const marked = /\*([^*]+)\*/.exec(raw);
    if (marked)
      return `${escapeHtml(raw.slice(0, marked.index))}<span class="ch-hl">${escapeHtml(marked[1] as string)}</span>${escapeHtml(raw.slice(marked.index + marked[0].length).replace(/\*/g, ""))}`;
    const at = raw.trimEnd().lastIndexOf(" ");
    return at < 0
      ? `<span class="ch-hl">${escapeHtml(raw)}</span>`
      : `${escapeHtml(raw.slice(0, at + 1))}<span class="ch-hl">${escapeHtml(raw.slice(at + 1))}</span>`;
  }
  if (p.effect === "gradient-text")
    return `<span class="ch-gradient-text">${escapeHtml(raw)}</span>`;
  return text(node, "text");
}

/** The node's motion attributes on the outer element of its markup. */
export function withMotion(html: string, motion: string | undefined): string {
  if (!motion) return html;
  return html.replace(/^<([a-z][a-z0-9-]*)(?=[\s>/])/, `<$1${motion}`);
}
