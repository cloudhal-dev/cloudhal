/**
 * Sight for agents (RFC-0021 §4): renders a page in a real browser at a few widths and returns
 * screenshots plus automatic checks (overflow, alt text, broken images, heading order, contrast,
 * empty sections, tap targets, line length). The browser is a DevTools socket: local Chrome under
 * Node (`@cloudhal/cli`), Cloudflare Browser Rendering on Workers (`@cloudhal/cloudflare`). One
 * small DevTools client serves both, so there is no browser library to bundle.
 *
 * Worker-safe: no Node imports.
 */

/** The widths `render_page` renders at, and the viewport height used at each. */
export const RENDER_WIDTHS = [1440, 768, 390] as const;
export type RenderWidth = (typeof RENDER_WIDTHS)[number];
const VIEWPORT_HEIGHT: Record<RenderWidth, number> = { 1440: 900, 768: 1024, 390: 844 };

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Renders `url` at each width: checks first (they load lazy images), then the screenshots. */
export async function renderPage(
  renderer: PageRenderer,
  url: string,
  options: RenderOptions,
): Promise<RenderResult> {
  const timeoutMs = options.timeoutMs ?? 20_000;
  let session: RenderSession | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let done = false;
  // Where a slow render was when it timed out, for the error.
  let stage = "starting a browser";
  const work = (async () => {
    const opened = await renderer.session();
    if (done) {
      await opened.close().catch(() => {});
      throw new RenderError("timed out");
    }
    session = opened;
    const shots: RenderShot[] = [];
    const perWidth: { width: number; checks: PageCheck[] }[] = [];
    for (const width of options.widths) {
      if (done) throw new RenderError("timed out");
      const vh = VIEWPORT_HEIGHT[width];
      stage = `opening the page at ${width} px`;
      const tab = await session.open(url, {
        width,
        height: vh,
        scheme: options.scheme ?? "light",
        reducedMotion: (options.motion ?? "static") !== "full",
      });
      try {
        stage = `checking the page at ${width} px`;
        const checks = await tab.evaluate<PageCheck[]>(RENDER_CHECK_SCRIPT);
        perWidth.push({ width, checks: Array.isArray(checks) ? checks : [] });
        const height = Math.max(vh, Math.ceil((await tab.evaluate<number>(PAGE_HEIGHT)) ?? vh));
        const max = Math.max(1, options.maxImages ?? 4);
        const frames = options.frames ? Math.min(6, Math.max(1, Math.round(options.frames))) : 0;
        const count = frames || (options.fullPage ? Math.min(max, Math.ceil(height / vh)) : 1);
        const images: Uint8Array[] = [];
        stage = `taking screenshots at ${width} px`;
        for (let i = 0; i < count; i++) {
          // Frames spread over the whole page; otherwise one viewport after another, the last
          // ending at the page's end so nothing is cut in half there.
          const y = frames
            ? Math.round((Math.max(0, height - vh) * i) / Math.max(1, count - 1))
            : i === count - 1 && count * vh >= height
              ? Math.max(0, height - vh)
              : i * vh;
          const at = await tab.evaluate<number>(`(window.scrollTo(0, ${y}), window.scrollY)`);
          // A phone layout that overflows sideways may not scroll at all: stop rather than repeat.
          if (i > 0 && Math.abs((at ?? 0) - y) > 2) break;
          await sleep(frames ? 450 : 150);
          images.push(await tab.screenshot(options.quality ?? 60));
        }
        const seen = frames ? height : images.length >= count ? count * vh : images.length * vh;
        shots.push({ width, height, truncated: seen < height, images });
      } finally {
        await tab.close().catch(() => {});
      }
    }
    return { shots, checks: mergeChecks(perWidth) };
  })();
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(new RenderError(`the page did not render within ${timeoutMs / 1000} s (${stage})`)),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    done = true;
    clearTimeout(timer);
    work.catch(() => {});
    await (session as RenderSession | undefined)?.close().catch(() => {});
  }
}

/**
 * The content's height. Not the document's scrollHeight: a phone layout that overflows sideways
 * widens the layout viewport and stretches it.
 */
const PAGE_HEIGHT = `(() => {
  const b = document.body;
  if (!b) return document.documentElement.scrollHeight;
  const s = getComputedStyle(b);
  return b.scrollHeight + parseFloat(s.marginTop) + parseFloat(s.marginBottom);
})()`;

/** What the in-page script returns for one width. */
interface PageCheck {
  id: RenderCheckId;
  count: number;
  examples: string[];
}

function mergeChecks(perWidth: readonly { width: number; checks: PageCheck[] }[]): RenderCheck[] {
  const multi = perWidth.length > 1;
  return RENDER_CHECK_IDS.map((id) => {
    const merged: RenderCheck = { id, ok: true, count: 0, examples: [], widths: [] };
    for (const { width, checks } of perWidth) {
      const c = checks.find((x) => x.id === id);
      if (!c || c.count === 0) continue;
      merged.ok = false;
      merged.count += c.count;
      merged.widths.push(width);
      for (const e of c.examples) {
        if (merged.examples.length >= 6) break;
        merged.examples.push(multi ? `@${width}: ${e}` : e);
      }
    }
    return merged;
  });
}

/**
 * The checks, run inside the page (kept as source text: Workers bundlers rename functions, and
 * this must stay self-contained). Returns `PageCheck[]` in `RENDER_CHECK_IDS` order.
 */
export const RENDER_CHECK_SCRIPT = `(async () => {
  const W = document.documentElement.clientWidth || window.innerWidth, H = window.innerHeight, MAX = 5;
  const ids = ${JSON.stringify(RENDER_CHECK_IDS)};
  const out = Object.fromEntries(ids.map((id) => [id, { id, count: 0, examples: [] }]));
  const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
  const describe = (el) => {
    if (el === document.body || el === document.documentElement) return "the page";
    const parts = [];
    const sec = el.closest && el.closest("[data-section-id]");
    const comp = el.closest && el.closest("[data-component-id]");
    if (sec) parts.push("section " + sec.getAttribute("data-section-id"));
    else {
      const mark = el.closest && el.closest("header,footer,nav,aside");
      if (mark) parts.push("theme " + mark.tagName.toLowerCase() + " (not a section)");
    }
    if (comp) parts.push("component " + comp.getAttribute("data-component-id"));
    let tag = el.tagName.toLowerCase();
    if (el.id) tag += "#" + el.id;
    else if (typeof el.className === "string" && el.className.trim())
      tag += "." + el.className.trim().split(/\\s+/).slice(0, 2).join(".");
    parts.push(tag);
    const text = ((el.innerText || "").trim() || el.getAttribute("alt") || el.getAttribute("src") || "").replace(/\\s+/g, " ");
    if (text) parts.push(JSON.stringify(clip(text, 48)));
    return parts.join(" ");
  };
  const add = (id, el, note) => {
    const c = out[id];
    c.count++;
    if (c.examples.length < MAX) c.examples.push(describe(el) + (note ? " — " + note : ""));
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    const s = getComputedStyle(el);
    // RFC-0024: content waiting for its reveal (.ch-pre) is content, whatever its opacity now.
    const waiting = el.closest && el.closest(".ch-pre");
    return s.visibility !== "hidden" && s.display !== "none" && (Number(s.opacity) > 0 || !!waiting);
  };

  // Lazy images load first, so broken ones show and the screenshots are complete.
  const imgs = [...document.images];
  // (which ones the page asked to be lazy is kept for carousel-lcp)
  const wasLazy = new Set(imgs.filter((i) => i.loading === "lazy"));
  for (const img of imgs) if (img.loading === "lazy") img.loading = "eager";
  await Promise.race([
    Promise.all(imgs.map((i) => i.complete ? null : new Promise((r) => {
      i.addEventListener("load", r, { once: true });
      i.addEventListener("error", r, { once: true });
    }))),
    new Promise((r) => setTimeout(r, 4000)),
  ]);
  if (document.fonts) await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 2000))]);
  // RFC-0024: entrances that play on load finish first, so checks see the page's final state.
  if (document.getAnimations)
    await Promise.race([
      Promise.all(document.getAnimations().map((a) => a.finished.catch(() => null))),
      new Promise((r) => setTimeout(r, 2500)),
    ]);

  // overflow-x: the outermost elements that stick out past the screen's right edge.
  const sw = document.documentElement.scrollWidth;
  if (sw > W + 1) {
    const clipped = (el) => {
      for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) {
        const o = getComputedStyle(e).overflowX;
        if (o !== "visible") return true;
      }
      return false;
    };
    for (const el of document.body.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.right <= W + 1) continue;
      const p = el.parentElement && el.parentElement.getBoundingClientRect();
      if (p && p.right > W + 1) continue;
      if (clipped(el)) continue;
      add("overflow-x", el, Math.round(r.right - W) + " px past the edge");
    }
    if (out["overflow-x"].count === 0) add("overflow-x", document.body, "the page is " + (sw - W) + " px wider than the screen");
  }

  // img-alt / img-broken
  for (const img of imgs) {
    if (!img.hasAttribute("alt") && img.getAttribute("role") !== "presentation" && img.getAttribute("aria-hidden") !== "true")
      add("img-alt", img, "no alt attribute");
    if (img.getAttribute("src") && img.complete && img.naturalWidth === 0) add("img-broken", img, "did not load");
  }

  // heading-order
  const hs = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].filter(visible);
  const h1 = hs.filter((h) => h.tagName === "H1");
  if (h1.length === 0) add("heading-order", document.body, "no level-1 heading");
  for (const h of h1.slice(1)) add("heading-order", h, "a second level-1 heading");
  let prev = 0;
  for (const h of hs) {
    const level = Number(h.tagName[1]);
    if (prev && level > prev + 1) add("heading-order", h, "h" + prev + " → h" + level + " skips a level");
    prev = level;
  }

  // contrast: text against what is painted beneath it (elementsFromPoint), band by band.
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const g = canvas.getContext("2d", { willReadFrequently: true });
  const rgba = (css) => {
    g.clearRect(0, 0, 1, 1);
    g.fillStyle = "rgba(0,0,0,0)";
    g.fillStyle = css;
    g.fillRect(0, 0, 1, 1);
    const d = g.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  };
  const over = (top, under) => [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3]));
  const lum = (c) => {
    const [r, gg, b] = c.map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * gg + 0.0722 * b;
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  const texts = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  while (walker.nextNode() && texts.length < 800) {
    const n = walker.currentNode;
    const el = n.parentElement;
    if (!el || seen.has(el) || !n.nodeValue.trim()) continue;
    if (el.closest("script,style,noscript,template,svg")) continue;
    seen.add(el);
    if (visible(el)) texts.push(el);
  }
  const pending = new Set(texts);
  const page = Math.max(document.documentElement.scrollHeight, H);
  for (let y = 0; y < page && pending.size; y += H) {
    window.scrollTo(0, y);
    for (const el of [...pending]) {
      const r = el.getBoundingClientRect();
      const cx = r.left + Math.min(r.width / 2, 12), cy = r.top + Math.min(r.height / 2, 10);
      if (cy < 0 || cy >= H || cx < 0 || cx >= W) continue;
      const stack = document.elementsFromPoint(cx, cy);
      const at = stack.indexOf(el);
      if (at < 0) continue;
      pending.delete(el);
      const layers = [];
      let known = true;
      for (const e of stack.slice(at)) {
        const s = getComputedStyle(e);
        if (/^(IMG|VIDEO|CANVAS|IFRAME|PICTURE)$/.test(e.tagName) || e.tagName.toLowerCase() === "svg" || s.backgroundImage !== "none") { known = false; break; }
        const c = rgba(s.backgroundColor);
        if (c[3] > 0) { layers.push(c); if (c[3] >= 1) break; }
      }
      if (!known) continue;
      let bg = [255, 255, 255];
      for (const c of layers.reverse()) bg = over(c, bg);
      const s = getComputedStyle(el);
      const fg = over(rgba(s.color), bg);
      const size = parseFloat(s.fontSize), weight = Number(s.fontWeight) || 400;
      const need = size >= 24 || (size >= 18.66 && weight >= 700) ? 3 : 4.5;
      const got = ratio(fg, bg);
      if (got < need) add("contrast", el, got.toFixed(1) + ":1, needs " + need + ":1");
    }
  }
  window.scrollTo(0, 0);

  // empty-section
  for (const s of document.querySelectorAll("[data-section-id]")) {
    if (getComputedStyle(s).display === "none") continue;
    const text = (s.innerText || "").trim();
    const media = s.querySelector("img,video,iframe,svg,canvas,input,select,textarea,picture");
    const r = s.getBoundingClientRect();
    if (!text && !media) add("empty-section", s, "no text or media");
    else if (r.height < 8) add("empty-section", s, Math.round(r.height) + " px tall");
  }

  // tap-target: on small screens, controls under 24 × 24 px that sit too close to another one
  // (WCAG 2.5.8: a 24 px circle on each must not touch another target; links inside sentences are exempt).
  if (W < 768) {
    const targets = [...document.querySelectorAll("a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button]")]
      .filter(visible)
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      // screen-reader-only controls (1 × 1 px) are not tapped
      .filter((t) => t.r.width > 2 || t.r.height > 2);
    const small = (t) => t.r.width < 24 || t.r.height < 24;
    const centre = (r) => [r.left + r.width / 2, r.top + r.height / 2];
    const toRect = (p, r) => Math.hypot(Math.max(r.left - p[0], 0, p[0] - r.right), Math.max(r.top - p[1], 0, p[1] - r.bottom));
    for (const t of targets) {
      if (!small(t)) continue;
      if (t.el.tagName === "A" && getComputedStyle(t.el).display === "inline") {
        const block = t.el.closest("p,li,td,dd,blockquote,figcaption");
        if (block && (block.innerText || "").trim().length > (t.el.innerText || "").trim().length + 20) continue;
      }
      const c = centre(t.r);
      const near = targets.find((o) => o !== t && !o.el.contains(t.el) && !t.el.contains(o.el) &&
        (toRect(c, o.r) < 12 || (small(o) && Math.hypot(c[0] - centre(o.r)[0], c[1] - centre(o.r)[1]) < 24)));
      if (near) add("tap-target", t.el, Math.round(t.r.width) + " × " + Math.round(t.r.height) + " px, too close to " + JSON.stringify(clip((near.el.innerText || near.el.getAttribute("aria-label") || near.el.tagName.toLowerCase()).trim(), 24)));
    }
  }

  // input-label: form controls without an accessible name (a label, aria-label or aria-labelledby).
  for (const el of document.querySelectorAll("input:not([type=hidden]):not([type=submit]):not([type=button]),select,textarea")) {
    if (!visible(el) && !(el.type === "radio" || el.type === "checkbox")) continue;
    const named = [...(el.labels || [])].some((l) => (l.innerText || l.textContent || "").trim()) ||
      (el.getAttribute("aria-label") || "").trim() ||
      (el.getAttribute("aria-labelledby") || "").split(/s+/).some((id) => id && (document.getElementById(id)?.textContent || "").trim());
    if (!named) add("input-label", el, "no label a screen reader can announce");
  }

  // chart-empty: a chart whose data has no rows.
  for (const el of document.querySelectorAll("[data-ch-chart-empty]")) add("chart-empty", el, "no rows in its data");

  // long-line: paragraphs averaging more than 90 characters a line.
  for (const p of document.querySelectorAll("p,li,dd,blockquote")) {
    if (!visible(p) || p.querySelector("p,li")) continue;
    const text = (p.innerText || "").trim();
    if (text.length < 180) continue;
    const s = getComputedStyle(p);
    const lh = s.lineHeight === "normal" ? parseFloat(s.fontSize) * 1.2 : parseFloat(s.lineHeight);
    const lines = Math.round(p.getBoundingClientRect().height / lh);
    if (lines < 3) continue;
    const per = Math.round(text.length / lines);
    if (per > 90) add("long-line", p, "about " + per + " characters a line");
  }

  // RFC-0024 §8: scroll through the page once, as a reader would, so reveals play, then measure.
  let shift = 0;
  let po;
  try {
    po = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (!e.hadRecentInput) shift += e.value;
    });
    po.observe({ type: "layout-shift", buffered: true });
  } catch {}
  const pageH = document.documentElement.scrollHeight;
  for (let y = 0; y < pageH; y += Math.round(H * 0.8)) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 90));
  }
  window.scrollTo(0, pageH);
  await new Promise((r) => setTimeout(r, 700));
  if (po) {
    for (const e of po.takeRecords()) if (!e.hadRecentInput) shift += e.value;
    po.disconnect();
  }
  // motion-cls: more layout shift than Core Web Vitals' "good" threshold.
  if (shift > 0.1) add("motion-cls", document.body, "layout shift " + shift.toFixed(2) + " while loading and scrolling (good is 0.1 or less)");
  // reduced-motion: with the reader asking for less, nothing stays hidden and nothing travels.
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    for (const el of document.querySelectorAll("[data-ch-reveal]"))
      if (el.classList.contains("ch-pre") || Number(getComputedStyle(el).opacity) === 0)
        add("reduced-motion", el, "stays hidden for readers who ask for reduced motion");
    const moving = /transform|translate|scale|rotate|^top$|^left$|^right$|^bottom$|offset/;
    for (const a of document.getAnimations ? document.getAnimations() : []) {
      if (a.playState !== "running" || !a.effect || !a.effect.getKeyframes) continue;
      const props = a.effect.getKeyframes().flatMap((k) => Object.keys(k));
      if (!props.some((p) => moving.test(p))) continue;
      const el = a.effect.target;
      if (el) add("reduced-motion", el, "moves for readers who ask for reduced motion");
    }
  }
  // motion-budget: a page carries a few scroll effects and one scroll story, not a show.
  const scrolls = document.querySelectorAll("[data-ch-scroll]");
  if (scrolls.length > 6) add("motion-budget", scrolls[6], scrolls.length + " scroll effects on the page; keep to 6 or fewer, the strongest ones");
  const stories = document.querySelectorAll(".ch-scrolly");
  if (stories.length > 1) add("motion-budget", stories[1], stories.length + " scroll stories on the page; keep to one");
  const splits = document.querySelectorAll('[data-ch-reveal^="split-"]');
  if (splits.length > 2) add("motion-budget", splits[2], splits.length + " split headings or texts; keep to 2, for the lines that matter most");
  const ambients = document.querySelectorAll("[data-ch-ambient]");
  if (ambients.length > 2) add("motion-budget", ambients[2], ambients.length + " ambient backgrounds on the page; keep to 2, best one on the hero");
  const loops = document.querySelectorAll("[data-ch-loop], .ch-marquee, [data-ch-rotate]");
  if (loops.length > 2) add("motion-budget", loops[2], loops.length + " things that loop on the page; keep to 2");
  // flash: a running animation that repeats faster than three times a second and changes how
  // bright something is (opacity, color, background, filter, visibility).
  const bright = /opacity|color|background|filter|visibility|fill/i;
  for (const a of document.getAnimations ? document.getAnimations() : []) {
    if (a.playState !== "running" || !a.effect || !a.effect.getComputedTiming) continue;
    const t = a.effect.getComputedTiming();
    const each = Number(t.duration) / Math.max(0.0001, Math.abs(a.playbackRate || 1));
    if (!(t.iterations > 1) || !(each > 0) || each >= 1000 / 3) continue;
    const props = a.effect.getKeyframes ? a.effect.getKeyframes().flatMap((k) => Object.keys(k)) : [];
    if (props.some((p) => bright.test(p)) && a.effect.target) add("flash", a.effect.target, "repeats " + Math.round(1000 / each) + " times a second");
  }
  window.scrollTo(0, 0);
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  await frame();

  // skip-link: the first focusable element is a link to the main content (or inside it).
  const shown = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== "hidden";
  const focusables = [...document.querySelectorAll('a[href],button,input,select,textarea,summary,[tabindex]:not([tabindex="-1"])')]
    .filter((e) => !e.disabled && !e.closest("[inert],dialog:not([open]),[popover]:not(:popover-open)") && shown(e));
  const firstFocus = focusables[0];
  if (firstFocus) {
    const href = firstFocus.tagName === "A" ? firstFocus.getAttribute("href") || "" : "";
    const target = href.startsWith("#") && href.length > 1 ? document.getElementById(decodeURIComponent(href.slice(1))) : null;
    if (!target) add("skip-link", firstFocus, "the first thing Tab reaches is not a link to the main content");
    else if (!target.matches("main,[role=main]") && !target.closest("main,[role=main]")) add("skip-link", firstFocus, "it points at #" + target.id + ", outside the main content");
  }

  // landmarks: one banner header, one main, one footer (outside articles and sections), named menus.
  const top = (sel) => [...document.querySelectorAll(sel)].filter((e) => shown(e) && !(e.parentElement && e.parentElement.closest("article,aside,main,nav,section,dialog")));
  const banners = top("header"), mains = [...document.querySelectorAll("main,[role=main]")].filter(shown), infos = top("footer");
  if (banners.length !== 1) add("landmarks", banners[1] || document.body, banners.length + " page headers (one is right)");
  if (mains.length !== 1) add("landmarks", mains[1] || document.body, mains.length + " main regions (one is right)");
  if (infos.length !== 1) add("landmarks", infos[1] || document.body, infos.length + " page footers (one is right)");
  const navs = [...document.querySelectorAll("nav")].filter(shown);
  if (navs.length > 1) for (const n of navs) if (!n.getAttribute("aria-label") && !n.getAttribute("aria-labelledby")) add("landmarks", n, "a menu without a name (aria-label), among " + navs.length);

  // header-contrast: a transparent header's text against what is under it, at the top of the page.
  const clear = document.querySelector("header[data-transparent]");
  if (clear && !clear.hasAttribute("data-ch-scrolled")) {
    const done = new Set();
    const tw = document.createTreeWalker(clear, NodeFilter.SHOW_TEXT);
    while (tw.nextNode()) {
      const el = tw.currentNode.parentElement;
      if (!el || done.has(el) || !tw.currentNode.nodeValue.trim() || !visible(el)) continue;
      done.add(el);
      if (el.closest("[popover],dialog,.ch-menu__panel")) continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 1 || r.height <= 1) continue;
      const cx = r.left + Math.min(r.width / 2, 12), cy = r.top + Math.min(r.height / 2, 10);
      if (cy < 0 || cy >= H || cx < 0 || cx >= W) continue;
      // Text on a fill of its own inside the header (a button, a field) is the contrast check's.
      let own = false;
      for (let e = el; e && e !== clear; e = e.parentElement) if (rgba(getComputedStyle(e).backgroundColor)[3] > 0.5) { own = true; break; }
      if (own) continue;
      let bg = null;
      for (const e of document.elementsFromPoint(cx, cy)) {
        if (clear.contains(e)) continue;
        if (/^(IMG|VIDEO|CANVAS|IFRAME|PICTURE)$/.test(e.tagName)) break;
        const c = rgba(getComputedStyle(e).backgroundColor);
        if (c[3] > 0) { bg = over(c, [255, 255, 255]); break; }
      }
      if (!bg) bg = [255, 255, 255];
      const st = getComputedStyle(el);
      const got = ratio(over(rgba(st.color), bg), bg);
      const big = parseFloat(st.fontSize) >= 24 || (parseFloat(st.fontSize) >= 18.66 && Number(st.fontWeight) >= 700);
      if (got < (big ? 3 : 4.5)) add("header-contrast", el, got.toFixed(1) + ":1 over the first band, needs " + (big ? 3 : 4.5) + ":1");
    }
  }

  // focus-obscured: tabbing back up the page, a sticky or fixed header never covers the focused element.
  const stuck = [...document.querySelectorAll("header,[data-ch-bar]")].filter((e) => shown(e) && /sticky|fixed/.test(getComputedStyle(e).position));
  if (stuck.length) {
    const targets = [...document.querySelectorAll("main a[href],main button,main input,main summary,body > footer a[href]")]
      .filter((e) => shown(e) && visible(e)).slice(-40).reverse();
    window.scrollTo(0, document.documentElement.scrollHeight);
    await frame();
    for (const el of targets) {
      el.focus();
      await frame();
      const r = el.getBoundingClientRect();
      const cx = Math.min(Math.max(r.left + r.width / 2, 0), W - 1), cy = Math.min(Math.max(r.top + r.height / 2, 0), H - 1);
      const at = document.elementFromPoint(cx, cy);
      const cover = at && !el.contains(at) && stuck.find((s) => s.contains(at));
      if (cover) add("focus-obscured", el, "under the " + (cover.tagName === "HEADER" ? "sticky header" : "bar") + " when it has focus");
    }
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    window.scrollTo(0, 0);
  }

  // carousel-label and carousel-lcp: named carousels and slides; a hero's first slide not lazy.
  for (const c of document.querySelectorAll('[aria-roledescription="carousel"], [aria-roledescription="kaydırmalı alan"]')) {
    const name = (c.getAttribute("aria-label") || "").trim();
    if (!name) add("carousel-label", c, "a carousel without a name (aria-label)");
    else if (/carousel|karusel/i.test(name)) add("carousel-label", c, "its name says carousel; name what it shows");
    const slides = [...c.querySelectorAll('[aria-roledescription="slide"], [aria-roledescription="slayt"]')];
    for (const s of slides) if (!(s.getAttribute("aria-label") || "").trim()) add("carousel-label", s, "a slide without a name");
    if (c.querySelector('[data-ch-carousel="prev"][data-ch-pending],[data-ch-carousel="next"][data-ch-pending]'))
      add("carousel-focus", c, "its arrows never appeared: the carousel module did not run");
    if (c.getAttribute("data-variant") === "hero")
      for (const s of slides.slice(1)) {
        if (s.closest("[inert]")) continue;
        const f = s.querySelector('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])');
        if (f) add("carousel-focus", f, "Tab can land in a slide out of view (make off-screen slides inert)");
      }
    if (c.hasAttribute("data-autoplay")) {
      const first = c.querySelector('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])');
      if (!first || first.getAttribute("data-ch-carousel") !== "rotate")
        add("carousel-autoplay", c, "it plays on its own without a rotation control first in Tab order");
      else if (!(first.getAttribute("aria-label") || "").trim())
        add("carousel-autoplay", first, "its rotation control has no name");
    }
    if (c.getAttribute("data-variant") === "hero")
      slides.forEach((s, i) => {
        for (const img of s.querySelectorAll("img")) {
          const lazy = wasLazy.has(img);
          if (i === 0 && lazy) add("carousel-lcp", img, "the first hero slide's image is lazy; it is what the reader sees first");
          if (i > 0 && !lazy) add("carousel-lcp", img, "slide " + (i + 1) + "'s image loads before anyone sees it; make it lazy");
        }
      });
  }

  const playing = document.querySelectorAll("[data-autoplay]");
  if (playing.length > 1) add("carousel-autoplay", playing[1], "a second carousel plays on its own; one per page at most");

  // overlay-open: every overlay of the page's sections, opened the way a reader would.
  const isOpen = (t) => !!t.open || t.matches(":popover-open");
  const overlaysOf = [...document.querySelectorAll("[data-section-id] dialog.ch-dialog, [data-section-id] [popover].ch-popover")];
  for (const t of overlaysOf) {
    const sel = '[commandfor="' + t.id + '"]:not([command="close"]),[popovertarget="' + t.id + '"]:not([popovertargetaction="hide"]),[data-ch-open="' + t.id + '"],[data-ch-lightbox="' + t.id + '"]';
    const trigger = [...document.querySelectorAll(sel)].find(shown);
    if (!trigger) { add("overlay-open", t, "nothing on the page opens it"); continue; }
    trigger.scrollIntoView({ block: "center" });
    trigger.focus();
    trigger.click();
    await frame();
    if (!isOpen(t)) { add("overlay-open", trigger, "did not open its overlay"); continue; }
    const modal = t.tagName === "DIALOG";
    if (modal && !t.contains(document.activeElement)) add("overlay-open", t, "focus stayed outside when it opened");
    if (modal && t.getAttribute("closedby") === "none" && !t.querySelector('[command="close"]'))
      add("overlay-open", t, "it closes only by a button, and has none");
    // Its text against its own paint (an overlay is opaque).
    const tw = document.createTreeWalker(t, NodeFilter.SHOW_TEXT);
    const doneT = new Set();
    while (tw.nextNode()) {
      const el = tw.currentNode.parentElement;
      if (!el || doneT.has(el) || !tw.currentNode.nodeValue.trim() || !visible(el)) continue;
      doneT.add(el);
      // The first opaque fill between the text and the overlay's edge.
      let bg = null;
      for (let e = el; e && !bg; e = e === t ? null : e.parentElement) {
        const c = rgba(getComputedStyle(e).backgroundColor);
        if (c[3] >= 1) bg = c.slice(0, 3);
      }
      if (!bg) continue;
      const st = getComputedStyle(el);
      const got = ratio(over(rgba(st.color), bg), bg);
      const big = parseFloat(st.fontSize) >= 24 || (parseFloat(st.fontSize) >= 18.66 && Number(st.fontWeight) >= 700);
      if (got < (big ? 3 : 4.5)) add("overlay-open", el, got.toFixed(1) + ":1 inside the overlay, needs " + (big ? 3 : 4.5) + ":1");
    }
    if (modal) t.close(); else t.hidePopover();
    await frame();
    if (document.activeElement !== trigger) add("overlay-open", trigger, "focus did not come back when it closed");
  }
  window.scrollTo(0, 0);

  return ids.map((id) => out[id]);
})()`;

/** Per key per minute and per site per day, in memory (each Worker isolate counts on its own). */
export class RenderLimiter {
  readonly #perKeyPerMinute: number;
  readonly #perSitePerDay: number;
  readonly #keys = new Map<string, number[]>();
  readonly #sites = new Map<string, { day: string; count: number }>();
  constructor(limits: { perKeyPerMinute?: number; perSitePerDay?: number } = {}) {
    this.#perKeyPerMinute = limits.perKeyPerMinute ?? 10;
    this.#perSitePerDay = limits.perSitePerDay ?? 200;
  }
  /** Counts one render, or says why not. */
  take(key: string, site: string, now: Date): string | undefined {
    const t = now.getTime();
    const recent = (this.#keys.get(key) ?? []).filter((x) => t - x < 60_000);
    if (recent.length >= this.#perKeyPerMinute)
      return `at most ${this.#perKeyPerMinute} renders a minute per key; try again in a minute`;
    const day = now.toISOString().slice(0, 10);
    const used = this.#sites.get(site);
    const count = used?.day === day ? used.count : 0;
    if (count >= this.#perSitePerDay)
      return `at most ${this.#perSitePerDay} renders a day per site; use preview_page until tomorrow (UTC)`;
    recent.push(t);
    this.#keys.set(key, recent);
    this.#sites.set(site, { day, count: count + 1 });
    return undefined;
  }
}

/**
 * A minimal DevTools client over a browser-level socket (flat sessions). Enough for
 * `render_page`: a browser context per session, one page per width, evaluate and screenshot.
 */
export class Cdp {
  #id = 0;
  readonly #pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();
  readonly #listeners = new Set<(m: CdpEvent) => void>();
  readonly #socket: CdpSocket;
  #closed = false;
  constructor(socket: CdpSocket) {
    this.#socket = socket;
    socket.onMessage((raw) => {
      let m: { id?: number; result?: unknown; error?: { message?: string } } & CdpEvent;
      try {
        m = JSON.parse(raw);
      } catch {
        return;
      }
      if (m.id !== undefined) {
        const p = this.#pending.get(m.id);
        if (!p) return;
        this.#pending.delete(m.id);
        if (m.error) p.reject(new RenderError(m.error.message ?? "DevTools error"));
        else p.resolve(m.result);
      } else if (m.method) {
        for (const l of this.#listeners) l(m);
      }
    });
    socket.onClose(() => {
      this.#closed = true;
      for (const p of this.#pending.values()) p.reject(new RenderError("the browser went away"));
      this.#pending.clear();
    });
  }
  send<T = Record<string, unknown>>(
    method: string,
    params: Record<string, unknown> = {},
    sessionId?: string,
  ): Promise<T> {
    if (this.#closed) return Promise.reject(new RenderError("the browser went away"));
    return new Promise<T>((resolve, reject) => {
      const id = ++this.#id;
      this.#pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.#socket.send(
        JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }),
      );
    });
  }
  /** Resolves on the next event `method` of `sessionId` (or after `ms`, whichever comes first). */
  waitFor(method: string, sessionId: string, ms: number): Promise<void> {
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this.#listeners.delete(listener);
        resolve();
      };
      const listener = (m: CdpEvent) => {
        if (m.method === method && m.sessionId === sessionId) done();
      };
      const timer = setTimeout(done, ms);
      this.#listeners.add(listener);
    });
  }
  close(): void {
    if (!this.#closed) this.#socket.close();
    this.#closed = true;
  }
}

interface CdpEvent {
  method?: string;
  sessionId?: string;
  params?: Record<string, unknown>;
}

/**
 * A render session over a DevTools socket: an isolated browser context (no cookies shared
 * between calls). `closeBrowser` also closes the browser (Browser Rendering sessions).
 */
export async function cdpSession(
  socket: CdpSocket,
  options: { closeBrowser?: boolean; loadTimeoutMs?: number } = {},
): Promise<RenderSession> {
  const cdp = new Cdp(socket);
  const { browserContextId } = await cdp.send<{ browserContextId: string }>(
    "Target.createBrowserContext",
    { disposeOnDetach: true },
  );
  return {
    async open(url, viewport) {
      const { targetId } = await cdp.send<{ targetId: string }>("Target.createTarget", {
        url: "about:blank",
        browserContextId,
      });
      const { sessionId } = await cdp.send<{ sessionId: string }>("Target.attachToTarget", {
        targetId,
        flatten: true,
      });
      const s = (method: string, params: Record<string, unknown> = {}) =>
        cdp.send(method, params, sessionId);
      await s("Page.enable");
      await s("Emulation.setDeviceMetricsOverride", {
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: 1,
        mobile: viewport.width < 768,
      });
      if (viewport.width < 768) await s("Emulation.setTouchEmulationEnabled", { enabled: true });
      // The same render on every machine: the scheme asked for, whatever the host prefers.
      await s("Emulation.setEmulatedMedia", {
        features: [
          { name: "prefers-color-scheme", value: viewport.scheme ?? "light" },
          {
            name: "prefers-reduced-motion",
            value: viewport.reducedMotion === false ? "no-preference" : "reduce",
          },
        ],
      });
      const loaded = cdp.waitFor("Page.loadEventFired", sessionId, options.loadTimeoutMs ?? 12_000);
      const nav = await s("Page.navigate", { url });
      if (typeof nav.errorText === "string" && nav.errorText)
        throw new RenderError(`could not open the page: ${nav.errorText}`);
      await loaded;
      // Phones zoom out to fit a page that is too wide; stay at 100 % so the screenshot shows
      // what overflows (the overflow-x check names it).
      if (viewport.width < 768) await s("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
      return {
        async evaluate<T>(expression: string): Promise<T> {
          const r = await cdp.send<{
            result?: { value?: T };
            exceptionDetails?: { exception?: { description?: string }; text?: string };
          }>(
            "Runtime.evaluate",
            { expression, awaitPromise: true, returnByValue: true },
            sessionId,
          );
          if (r.exceptionDetails)
            throw new RenderError(
              r.exceptionDetails.exception?.description ??
                r.exceptionDetails.text ??
                "script failed",
            );
          return r.result?.value as T;
        },
        async screenshot(quality) {
          const r = await cdp.send<{ data: string }>(
            "Page.captureScreenshot",
            { format: "jpeg", quality },
            sessionId,
          );
          return base64ToBytes(r.data);
        },
        async close() {
          await cdp.send("Target.closeTarget", { targetId });
        },
      };
    },
    async close() {
      try {
        await cdp.send("Target.disposeBrowserContext", { browserContextId });
        if (options.closeBrowser) await cdp.send("Browser.close");
      } catch {
        // already gone
      } finally {
        cdp.close();
      }
    },
  };
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
