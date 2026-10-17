/** The `render_page` contract: widths, check ids, options and results, the DevTools socket shapes. */

/** The widths `render_page` renders at, and the viewport height used at each. */
export const RENDER_WIDTHS = [1440, 768, 390] as const;
export type RenderWidth = (typeof RENDER_WIDTHS)[number];
export const VIEWPORT_HEIGHT: Record<RenderWidth, number> = { 1440: 900, 768: 1024, 390: 844 };

/** A text socket to a browser's DevTools endpoint (browser-level, not a single page). */
export interface CdpSocket {
  send(message: string): void;
  /** Called with each complete message. */
  onMessage(listener: (message: string) => void): void;
  onClose(listener: () => void): void;
  close(): void;
}

/** A browser for one `render_page` call; `close` releases it. */
export interface RenderSession {
  open(
    url: string,
    viewport: { width: number; height: number; scheme?: RenderScheme; reducedMotion?: boolean },
  ): Promise<RenderTab>;
  close(): Promise<void>;
}

export interface RenderTab {
  /** Evaluates an expression in the page, awaiting promises; the value comes back as JSON. */
  evaluate<T>(expression: string): Promise<T>;
  /** A JPEG of the viewport as it is now. */
  screenshot(quality: number): Promise<Uint8Array>;
  close(): Promise<void>;
}

/** Where `render_page` gets its browsers from. */
export interface PageRenderer {
  session(): Promise<RenderSession>;
}

/** One automatic check (RFC-0021 §4). `examples` name the section and component where known. */
export interface RenderCheck {
  id: RenderCheckId;
  ok: boolean;
  count: number;
  examples: string[];
  /** The widths it failed at. */
  widths: number[];
}

export const RENDER_CHECK_IDS = [
  "overflow-x",
  "img-alt",
  "img-broken",
  "heading-order",
  "contrast",
  "empty-section",
  "tap-target",
  "long-line",
  // RFC-0022 §2: a form control a reader cannot identify.
  "input-label",
  // RFC-0022 §3: a chart with no rows to draw.
  "chart-empty",
  // RFC-0024 §8: content hidden or moving for a reader who asked for reduced motion.
  "reduced-motion",
  // RFC-0024 §8: layout shift while the page loads and scrolls (reveals included).
  "motion-cls",
  // RFC-0024 §2: more scroll effects or scroll stories than a page should carry.
  "motion-budget",
  // RFC-0024 §8, WCAG 2.3.1: something that flashes more than three times a second.
  "flash",
  // RFC-0025 §4: the first thing Tab reaches skips to the main content.
  "skip-link",
  // RFC-0025 §4: one banner header, one main, one footer, and every menu named.
  "landmarks",
  // RFC-0025 §2: a transparent header's text against the band under it.
  "header-contrast",
  // RFC-0025 §4, WCAG 2.4.11: a sticky or fixed header covering what has focus.
  "focus-obscured",
  // RFC-0025 §3: each overlay opens from its trigger, takes focus, closes and gives focus back.
  "overlay-open",
  // RFC-0027: carousels and their slides are named (and not just "carousel").
  "carousel-label",
  // RFC-0027: a hero carousel's first slide loads first; the others wait.
  "carousel-lcp",
  // RFC-0027: Tab never lands in a hero slide out of view; the controls are working.
  "carousel-focus",
  // RFC-0027 27d: a playing carousel has its rotation control first; at most one plays per page.
  "carousel-autoplay",
  // RFC-0028: an image cropped hard by cover with no focal point to keep its subject in view.
  "image-fit",
] as const;
export type RenderCheckId = (typeof RENDER_CHECK_IDS)[number];

export interface RenderShot {
  width: number;
  /** The page's full height at this width. */
  height: number;
  /** The screenshots stop before the end of the page. */
  truncated: boolean;
  /** JPEGs, top to bottom, one viewport each. */
  images: Uint8Array[];
}

export interface RenderResult {
  shots: RenderShot[];
  checks: RenderCheck[];
}

/** The `prefers-color-scheme` a page is rendered in (RFC-0023: sites with a dark or auto mode). */
export const RENDER_SCHEMES = ["light", "dark"] as const;
export type RenderScheme = (typeof RENDER_SCHEMES)[number];
/**
 * How the page may move while it renders (RFC-0024 §8): `static` (the default) and `reduce`
 * render with `prefers-reduced-motion: reduce`, so screenshots show final states and the
 * `reduced-motion` check runs; `full` lets every preset play, for `motion-cls`.
 */
export const RENDER_MOTIONS = ["static", "reduce", "full"] as const;
export type RenderMotion = (typeof RENDER_MOTIONS)[number];

export interface RenderOptions {
  widths: readonly RenderWidth[];
  /** Default light. */
  scheme?: RenderScheme;
  /** Default `static`. */
  motion?: RenderMotion;
  /**
   * RFC-0024 §8: screenshots at this many evenly spaced scroll positions (at most 6), each after
   * the page settles, in place of one per viewport, to show a scroll story or scroll effects.
   */
  frames?: number;
  /** Screenshots down the page (up to `maxImages` viewports per width); otherwise the first one. */
  fullPage: boolean;
  maxImages?: number;
  /** JPEG quality, 1–100. */
  quality?: number;
  timeoutMs?: number;
}

export class RenderError extends Error {
  override readonly name = "RenderError";
}
