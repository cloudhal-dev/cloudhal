/**
 * RFC-0021 §4: render_page's checks in the local Chrome, on a page with one of each problem.
 * Skipped where this machine has no Chrome (set CHROME_PATH).
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { renderPage } from "@cloudhal/mcp-server/render";
import { afterAll, describe, expect, it } from "vitest";
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
      { widths: [1440, 390], fullPage: true },
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
  }, 60_000);
});

describe("localRender", () => {
  it("is off with CLOUDHAL_RENDER=off or without a Chrome", () => {
    expect(localRender({ CLOUDHAL_RENDER: "off" })).toBeUndefined();
    expect(localRender({ CHROME_PATH: "/nonexistent/chrome" })).toBeUndefined();
  });
});
