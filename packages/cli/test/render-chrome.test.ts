/**
 * RFC-0021 §4: render_page's checks in the local Chrome, on a page with one of each problem.
 * Skipped where this machine has no Chrome (set CHROME_PATH).
 */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { renderPage } from "@cloudhal/mcp-server/render";
import { afterAll, describe, expect, it } from "vitest";
import { CAROUSEL_SCRIPT } from "../../astro-renderer/src/carousel-client.ts";
import { renderPagePreview } from "../../astro-renderer/src/preview.ts";
import { chromeRenderer, findChrome, localRender } from "../src/render-chrome.ts";

const chrome = findChrome();

const PAGE = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width">
<style>body{margin:0;font:16px/1.5 sans-serif}.wide{width:1600px}.low{color:#bbb}.hero{background:#111;color:#fff;padding:40px}</style></head><body>
<section data-section-id="sec_hero" class="hero"><h2 data-component-id="c_title">A page without a level-1 heading</h2><p>White on black is fine.</p></section>
<section data-section-id="sec_wide"><div class="wide" data-component-id="c_wide">Too wide</div></section>
<section data-section-id="sec_imgs"><img src="missing.png"><img src="missing-too.png" alt="A missing picture"></section>
<section data-section-id="sec_low"><p class="low">Light grey text on white.</p><h4>Skips a level</h4>
<nav><a href="/a" style="font-size:10px">a</a> <a href="/b" style="font-size:10px">b</a></nav></section>
<section data-section-id="sec_form"><label>Weight <input type="number"></label><input type="text" placeholder="Name"></section>
<section data-section-id="sec_empty"></section>
<section data-section-id="sec_long"><p style="max-width:1400px">${"A sentence that goes on for a while. ".repeat(40)}</p></section>
</body></html>`;

describe.skipIf(!chrome)("render_page checks in Chrome", () => {
  let dir: string;
  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("finds each problem and names the section and component", async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "cloudhal-render-test-"));
    const file = path.join(dir, "page.html");
    await writeFile(file, PAGE);
    const r = await renderPage(
      chromeRenderer(chrome as string, { idleMs: 10 }),
      pathToFileURL(file).href,
      // Two widths, full page: the 20 s default is tight on a loaded CI runner (#35).
      { widths: [1440, 390], fullPage: true, timeoutMs: 50_000 },
    );
    const check = (id: string) => r.checks.find((c) => c.id === id);
    expect(r.shots.map((s) => s.width)).toEqual([1440, 390]);
    expect(r.shots.every((s) => s.images.length >= 1 && s.images[0]?.[0] === 0xff)).toBe(true);
    expect(check("overflow-x")?.examples[0]).toMatch(
      /^@1440: section sec_wide component c_wide div\.wide "Too wide" — 160 px past the edge$/,
    );
    expect(check("img-alt")).toMatchObject({ count: 2, widths: [1440, 390] });
    expect(check("img-broken")).toMatchObject({ count: 4 });
    expect(check("heading-order")?.examples).toEqual(
      expect.arrayContaining([
        "@1440: the page — no level-1 heading",
        '@1440: section sec_low h4 "Skips a level" — h2 → h4 skips a level',
      ]),
    );
    expect(check("contrast")?.examples[0]).toMatch(
      /section sec_low p\.low .* — 1\.\d:1, needs 4\.5:1/,
    );
    expect(check("empty-section")?.examples[0]).toBe(
      "@1440: section sec_empty section — no text or media",
    );
    expect(check("tap-target")).toMatchObject({ widths: [390] });
    expect(check("long-line")).toMatchObject({ widths: [1440] });
    expect(check("input-label")?.examples[0]).toMatch(/^@1440: section sec_form input — no label/);
    expect(check("input-label")?.count).toBe(2);
    expect(check("overflow-x")?.widths).toEqual([1440, 390]);
    // RFC-0025: no skip link, no header, main or footer, and two unnamed menus.
    expect(check("skip-link")?.examples[0]).toMatch(/not a link to the main content/);
    expect(check("landmarks")?.examples).toEqual(
      expect.arrayContaining(["@1440: the page — 0 page headers (one is right)"]),
    );
    // The first test starts Chrome: up to two 20 s launch attempts (render-chrome.ts) plus the render.
  }, 120_000);

  it("checks the chrome: skip link, landmarks, a transparent header's contrast, focus under it", async () => {
    dir ??= await mkdtemp(path.join(os.tmpdir(), "cloudhal-render-test-"));
    const links = Array.from(
      { length: 30 },
      (_, i) => `<p><a href="#x${i}">Link ${i}</a></p>`,
    ).join("");
    const bad = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width">
<style>body{margin:0;font:16px/1.5 sans-serif}header{position:sticky;top:0;height:80px;color:#eee}header a{color:inherit}
header[data-ch-scrolled]{background:#fff}.band{background:#fafafa;padding:120px 20px}</style></head><body>
<a href="#nowhere">Skip</a><header data-transparent><nav><a href="/">Home</a></nav><nav><a href="/b">B</a></nav></header>
<main id="main"><div class="band"><h1>Title</h1></div>${links}</main><footer>f</footer></body></html>`;
    const good = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width">
<style>html{scroll-padding-top:96px}body{margin:0;font:16px/1.5 sans-serif}.skip{position:absolute;left:-999px}
header{position:sticky;top:0;height:80px;color:#fff;margin-bottom:-80px}header a{color:inherit}.band{background:#111;color:#fff;padding:120px 20px}</style></head><body>
<a class="skip" href="#main">Skip to content</a><header data-transparent><nav aria-label="Main"><a href="/">Home</a></nav><nav aria-label="Second"><a href="/b">B</a></nav></header>
<main id="main"><div class="band"><h1>Title</h1></div>${links}</main><footer>f</footer></body></html>`;
    const run = async (name: string, html: string, widths: (1440 | 768 | 390)[] = [1440]) => {
      const file = path.join(dir, name);
      await writeFile(file, html);
      const r = await renderPage(
        chromeRenderer(chrome as string, { idleMs: 10 }),
        pathToFileURL(file).href,
        { widths, fullPage: false, timeoutMs: 50_000 },
      );
      return (id: string) => r.checks.find((c) => c.id === id);
    };
    const b = await run("bad.html", bad);
    expect(b("skip-link")?.examples[0]).toMatch(/points at|not a link/);
    expect(b("landmarks")?.examples).toEqual(
      expect.arrayContaining([expect.stringMatching(/a menu without a name/)]),
    );
    expect(b("header-contrast")?.examples[0]).toMatch(/1\.\d:1 over the first band, needs 4\.5:1/);
    expect(b("focus-obscured")?.count).toBeGreaterThan(0);
    const g = await run("good.html", good);
    for (const id of ["skip-link", "landmarks", "header-contrast", "focus-obscured"])
      expect(g(id)).toMatchObject({ ok: true });
    // RFC-0025 §3: overlays opened through their triggers.
    const overlays = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width">
<style>body{margin:0;font:16px/1.5 sans-serif}.ch-dialog,.ch-popover{background:#fff;color:#111}.pale{color:#ddd}</style></head><body>
<a href="#main">Skip</a><header>h</header><main id="main"><h1>Overlays</h1><section data-section-id="sec_o">
<button command="show-modal" commandfor="ok">Open</button>
<dialog id="ok" class="ch-dialog" closedby="any"><h2>Fine</h2><button command="close" commandfor="ok">Close</button></dialog>
<dialog id="lost" class="ch-dialog"><h2>Nobody opens me</h2></dialog>
<button popovertarget="pop">More</button><div id="pop" popover="auto" class="ch-popover"><p class="pale">Pale text</p></div>
</section></main><footer>f</footer></body></html>`;
    const o = await run("overlays.html", overlays);
    expect(o("overlay-open")?.examples).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/dialog#lost .* nothing on the page opens it/),
        expect.stringMatching(/Pale text.* inside the overlay, needs 4\.5:1/),
      ]),
    );
    expect(o("overlay-open")?.count).toBe(2);
    // RFC-0027: carousels named, a hero's first slide not lazy, the others lazy.
    const carousels = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"></head><body>
<a href="#main">Skip</a><header>h</header><main id="main"><h1>C</h1>
<section role="region" aria-roledescription="carousel" aria-label="Our carousel" data-variant="hero">
<div role="group" aria-roledescription="slide" aria-label="1 of 2"><img src="a.png" alt="A" loading="lazy" width="10" height="10"></div>
<div role="group" aria-roledescription="slide"><img src="b.png" alt="B" width="10" height="10"></div></section>
</main><footer>f</footer></body></html>`;
    const k = await run("carousels.html", carousels);
    expect(k("carousel-label")?.examples).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/its name says carousel/),
        expect.stringMatching(/a slide without a name/),
      ]),
    );
    expect(k("carousel-lcp")?.examples).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/the first hero slide's image is lazy/),
        expect.stringMatching(/slide 2's image loads before anyone sees it/),
      ]),
    );
    // RFC-0027 27b: without the module, arrows stay hidden and Tab reaches slides out of view;
    // with it, neither. (A classic script here: Chrome loads no module from file://.)
    await writeFile(path.join(dir, "carousel.js"), CAROUSEL_SCRIPT.code);
    const hero = (
      module: string,
    ) => `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width">
<style>.ch-carousel__track{display:grid;grid-auto-flow:column;grid-auto-columns:100%;overflow-x:auto}.ch-carousel__arrow[data-ch-pending]{visibility:hidden}</style></head><body>
<a href="#main">Skip</a><header>h</header><main id="main"><h1>C</h1>
<section class="ch-carousel" data-variant="hero" role="region" aria-roledescription="carousel" aria-label="Spring">
<div class="ch-carousel__track" tabindex="0">
<div class="ch-carousel__slide" role="group" aria-roledescription="slide" aria-label="1 of 2"><a href="/a">One</a></div>
<div class="ch-carousel__slide" role="group" aria-roledescription="slide" aria-label="2 of 2"><a href="/b">Two</a></div></div>
<div><button type="button" class="ch-carousel__arrow" data-ch-carousel="prev" data-ch-pending aria-label="Previous slide">‹</button>
<button type="button" class="ch-carousel__arrow" data-ch-carousel="next" data-ch-pending aria-label="Next slide">›</button></div>
</section></main><footer>f</footer>${module}</body></html>`;
    const without = await run("hero-bare.html", hero(""));
    expect(without("carousel-focus")?.examples).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/the carousel module did not run/),
        expect.stringMatching(/Tab can land in a slide out of view/),
      ]),
    );
    const withModule = await run(
      "hero-module.html",
      hero('<script defer src="carousel.js"></script>'),
    );
    expect(withModule("carousel-focus")).toMatchObject({ ok: true });
    expect(withModule("carousel-autoplay")).toMatchObject({ ok: true });
    // RFC-0027 27d: a playing hero needs its rotation control first, and one per page.
    const playing = hero('<script defer src="carousel.js"></script>')
      .replace('data-variant="hero"', 'data-variant="hero" data-autoplay="slow"')
      .replace(
        "</main>",
        '<section aria-roledescription="carousel" aria-label="More" data-autoplay="slow"></section></main>',
      );
    const p = await run("hero-playing.html", playing);
    expect(p("carousel-autoplay")?.examples).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/without a rotation control first/),
        expect.stringMatching(/one per page at most/),
      ]),
    );
    // Build chat's fallback and the eval look at the static preview: a proper shell, and no
    // complaint that a carousel's module did not run (previews run no scripts by design).
    const preview = renderPagePreview(
      {
        schemaVersion: 1,
        id: "site_PREVIEW0001",
        name: "Preview",
        slug: "preview",
        defaultLocale: "en",
        locales: ["en"],
      } as never,
      {
        path: "/p",
        title: "P",
        sections: [
          {
            id: "sec_previewcar1",
            kind: "surface",
            catalog: "blog@1",
            components: [
              { id: "root", component: "Stack", children: ["h", "car", "rail"] },
              { id: "h", component: "Heading", props: { text: "Offers", level: 1 } },
              {
                id: "car",
                component: "Carousel",
                props: { label: "Offers", variant: "hero", aspect: "16:9" },
                children: ["a", "b"],
              },
              {
                id: "rail",
                component: "Carousel",
                props: { label: "Cafés", peek: "s" },
                children: ["c1", "c2", "c3", "c4"],
              },
              { id: "c1", component: "Text", props: { text: "Mavi" } },
              { id: "c2", component: "Text", props: { text: "Kahve" } },
              { id: "c3", component: "Text", props: { text: "Liman" } },
              { id: "c4", component: "Text", props: { text: "Köşe" } },
              { id: "a", component: "Text", props: { text: "Spring" } },
              { id: "b", component: "Link", props: { label: "Order", href: "/order" } },
            ],
          },
        ],
      } as never,
    );
    const pv = await run("preview.html", preview.html, [1440, 390]);
    for (const id of ["skip-link", "landmarks", "carousel-focus", "tap-target", "overflow-x"])
      expect(pv(id), id).toMatchObject({ ok: true });
    // RFC-0028: a wide picture in a square cover frame is cut to a quarter; a focal point excuses it.
    await writeFile(
      path.join(dir, "wide.svg"),
      `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="100"><rect width="400" height="100" fill="#369"/></svg>`,
    );
    const crops = await run(
      "crops.html",
      `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"><style>img{width:200px;height:200px;object-fit:cover}</style></head><body><main><h1>C</h1>
<section data-section-id="sec_crop"><img src="wide.svg" alt="Blind"><img src="wide.svg" alt="Steered" style="object-position:20% 50%"></section></main></body></html>`,
    );
    expect(crops("image-fit")?.examples).toEqual([
      expect.stringMatching(/keeps 25% of the picture with no focal point/),
    ]);
    // RFC-0023 §2: a web font straight onto a system font moves the text when it loads; one
    // followed by its metric-matched fallback does not. (A data URL: file:// pages load no font files.)
    const woff2 = await readFile(
      path.join(
        import.meta.dirname,
        "../../../starters/blog/public/fonts/v1/inter-latin-wght-normal.woff2",
      ),
      "base64",
    );
    const src = `url(data:font/woff2;base64,${woff2}) format("woff2")`;
    const fonts = await run(
      "fonts.html",
      `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"><style>
@font-face{font-family:Bare;src:${src}}@font-face{font-family:Tuned;src:${src}}
@font-face{font-family:"Tuned Fallback";src:local("Arial");size-adjust:107%;ascent-override:90%}
</style></head><body><main><h1 style="font-family:Tuned,'Tuned Fallback',sans-serif">Matched</h1>
<p style="font-family:Bare,sans-serif">Jumps</p></main></body></html>`,
    );
    expect(fonts("font-fallback")?.examples).toEqual([
      expect.stringMatching(/p "Jumps" — "bare" has no metric-matched fallback/),
    ]);
  }, 90_000);
});

describe("localRender", () => {
  it("is off with CLOUDHAL_RENDER=off or without a Chrome", () => {
    expect(localRender({ CLOUDHAL_RENDER: "off" })).toBeUndefined();
    expect(localRender({ CHROME_PATH: "/nonexistent/chrome" })).toBeUndefined();
  });
});

describe("chromeRenderer", () => {
  it.skipIf(process.platform === "win32")(
    "launches a Chrome that fails to start once more, with a new profile",
    async () => {
      const tmp = await mkdtemp(path.join(os.tmpdir(), "cloudhal-render-retry-"));
      const log = path.join(tmp, "launches");
      const fake = path.join(tmp, "chrome");
      await writeFile(fake, `#!/bin/sh\necho "$@" >> "${log}"\nexit 1\n`, { mode: 0o755 });
      try {
        await expect(chromeRenderer(fake).session()).rejects.toThrow("Chrome exited");
        const launches = (await readFile(log, "utf8")).trim().split("\n");
        expect(launches).toHaveLength(2);
        const profile = (line?: string) => /--user-data-dir=(\S+)/.exec(line ?? "")?.[1];
        expect(profile(launches[0])).not.toBe(profile(launches[1]));
      } finally {
        await rm(tmp, { recursive: true, force: true });
      }
    },
  );
});
