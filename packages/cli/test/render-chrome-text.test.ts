/**
 * render_page's text checks in the local Chrome: a column's line length (`long-line`) and a body
 * button's contrast under the blog starter's own link rule. Skipped where this machine has no
 * Chrome (set CHROME_PATH).
 */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { renderPage } from "@cloudhal/mcp-server/render";
import { afterAll, describe, expect, it } from "vitest";
import { chromeRenderer, findChrome } from "../src/render-chrome.ts";

const chrome = findChrome();

describe.skipIf(!chrome)("render_page text checks in Chrome", () => {
  let dir: string;
  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("a primary surface Button in an article body keeps on-brand text (the starter's link rule)", async () => {
    dir ??= await mkdtemp(path.join(os.tmpdir(), "cloudhal-render-test-"));
    const tokens = await readFile(
      path.join(import.meta.dirname, "../../../starters/blog/src/styles/features/tokens.css"),
      "utf8",
    );
    const linkRule = /\.ch-richtext a[^{]*\{[^}]*\}/.exec(tokens)?.[0];
    expect(linkRule).toBeDefined();
    // The button rule as blocks.css applies it; the link colour is the brand, as on cloudhal.com.
    const html = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"><style>
:root{--ch-color-link:#0b5cd5;--ch-color-brand:#0b5cd5;--ch-color-on-brand:#fff}body{margin:0;font:16px/1.5 sans-serif}
.ch-button{display:inline-block;padding:8px 16px}.ch-button--primary{color:var(--ch-color-on-brand);background:var(--ch-color-brand)}
${linkRule}</style></head><body><main><h1>Post</h1><div class="ch-richtext"><p>Read <a href="/more">more</a>.</p>
<section class="ch-surface" data-section-id="cta"><a class="ch-button ch-button--primary" data-component-id="go" href="/start">Start now</a></section></div></main></body></html>`;
    const file = path.join(dir, "body-button.html");
    await writeFile(file, html);
    const r = await renderPage(
      chromeRenderer(chrome as string, { idleMs: 10 }),
      pathToFileURL(file).href,
      {
        widths: [1440],
        fullPage: false,
        timeoutMs: 50_000,
      },
    );
    expect(r.checks.find((c) => c.id === "contrast")).toMatchObject({ ok: true });
  }, 90_000);

  it("long-line gives a column one verdict, whatever its paragraphs' last lines hold", async () => {
    dir ??= await mkdtemp(path.join(os.tmpdir(), "cloudhal-render-test-"));
    // A monospace font: every character is as wide as the next, so a column's measure is exact.
    const para = (chars: number) =>
      `<p>${"abcd "
        .repeat(Math.ceil(chars / 5))
        .slice(0, chars)
        .trim()}</p>`;
    const page = (width: number) =>
      `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"><style>body{margin:0;font:16px/1.5 monospace}main{width:${width}ch}p{margin:0 0 1em}</style></head><body><main><h1>L</h1>${
        // The same column, last lines from nearly empty to nearly full.
        [3 * 95 + 2, 3 * 95 + 90, 4 * 95 + 40].map(para).join("")
      }</main></body></html>`;
    const render = async (name: string, html: string) => {
      const file = path.join(dir, name);
      await writeFile(file, html);
      const r = await renderPage(
        chromeRenderer(chrome as string, { idleMs: 10 }),
        pathToFileURL(file).href,
        {
          widths: [1440],
          fullPage: false,
          timeoutMs: 50_000,
        },
      );
      return r.checks.find((c) => c.id === "long-line");
    };
    const wide = await render("long-wide.html", page(95));
    expect(wide).toMatchObject({ ok: false, count: 1 });
    expect(wide?.examples[0]).toMatch(
      /about 9[45] characters a line in this \d+ px column \(3 paragraphs\)$/,
    );
    expect(await render("long-narrow.html", page(80))).toMatchObject({ ok: true });
  }, 90_000);
});
