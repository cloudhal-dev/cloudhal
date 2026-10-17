/** `renderPage`: checks at each width (one page per width), then the screenshots. */
import { RENDER_CHECK_SCRIPT } from "./checks/index.ts";
import {
  type PageRenderer,
  RENDER_CHECK_IDS,
  type RenderCheck,
  type RenderCheckId,
  RenderError,
  type RenderOptions,
  type RenderResult,
  type RenderSession,
  type RenderShot,
  VIEWPORT_HEIGHT,
} from "./types.ts";

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
export const PAGE_HEIGHT = `(() => {
  const b = document.body;
  if (!b) return document.documentElement.scrollHeight;
  const s = getComputedStyle(b);
  return b.scrollHeight + parseFloat(s.marginTop) + parseFloat(s.marginBottom);
})()`;

/** What the in-page script returns for one width. */
export interface PageCheck {
  id: RenderCheckId;
  count: number;
  examples: string[];
}

export function mergeChecks(
  perWidth: readonly { width: number; checks: PageCheck[] }[],
): RenderCheck[] {
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
