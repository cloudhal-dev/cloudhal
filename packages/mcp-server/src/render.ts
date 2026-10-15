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
  open(url: string, viewport: { width: number; height: number }): Promise<RenderTab>;
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

export interface RenderOptions {
  widths: readonly RenderWidth[];
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
      const tab = await session.open(url, { width, height: vh });
      try {
        stage = `checking the page at ${width} px`;
        const checks = await tab.evaluate<PageCheck[]>(RENDER_CHECK_SCRIPT);
        perWidth.push({ width, checks: Array.isArray(checks) ? checks : [] });
        const height = Math.max(vh, Math.ceil((await tab.evaluate<number>(PAGE_HEIGHT)) ?? vh));
        const max = Math.max(1, options.maxImages ?? 4);
        const count = options.fullPage ? Math.min(max, Math.ceil(height / vh)) : 1;
        const images: Uint8Array[] = [];
        stage = `taking screenshots at ${width} px`;
        for (let i = 0; i < count; i++) {
          // The last viewport ends at the page's end, so nothing is cut in half there.
          const y = i === count - 1 && count * vh >= height ? Math.max(0, height - vh) : i * vh;
          const at = await tab.evaluate<number>(`(window.scrollTo(0, ${y}), window.scrollY)`);
          // A phone layout that overflows sideways may not scroll at all: stop rather than repeat.
          if (i > 0 && Math.abs((at ?? 0) - y) > 2) break;
          await sleep(150);
          images.push(await tab.screenshot(options.quality ?? 60));
        }
        const seen = images.length >= count ? count * vh : images.length * vh;
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
    return s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0;
  };

  // Lazy images load first, so broken ones show and the screenshots are complete.
  const imgs = [...document.images];
  for (const img of imgs) if (img.loading === "lazy") img.loading = "eager";
  await Promise.race([
    Promise.all(imgs.map((i) => i.complete ? null : new Promise((r) => {
      i.addEventListener("load", r, { once: true });
      i.addEventListener("error", r, { once: true });
    }))),
    new Promise((r) => setTimeout(r, 4000)),
  ]);
  if (document.fonts) await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 2000))]);

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
