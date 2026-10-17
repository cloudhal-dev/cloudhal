/** Findings of the body rendering audit (docs/reports/2026-10-body-rendering-audit.md). */
import { describe, expect, it } from "vitest";
import { renderInlineMarkdown, renderMarkdown } from "../src/markdown.ts";

const ctx = { locale: "en", defaultLocale: "en" } as never;

describe("body rendering (audit 2026-10)", () => {
  it("never shows a block of raw HTML as text: tags go, words stay; inline <…> shows as typed", () => {
    const html = renderMarkdown(
      '<div class="x">raw html</div>\n\n<details><summary>More</summary>Hidden</details>\n\n<!-- note -->\n\n<script>alert(1)</script>\n\nText <kbd>Ctrl</kbd> for <you>.',
      ctx,
    );
    expect(html).not.toMatch(/&lt;div|<div class|<details|&lt;details|<script|alert\(1\)|note/);
    expect(html).toContain("raw html");
    expect(html).toContain("Hidden");
    expect(html).toContain("&lt;kbd&gt;Ctrl&lt;/kbd&gt; for &lt;you&gt;");
    expect(renderInlineMarkdown("<b>x</b>")).toContain("&lt;b&gt;");
  });

  it("says in a preview why a ```surface draws nothing, and stays silent on the site", () => {
    const md =
      '```surface {"id":"Bad Id","catalog":"blog@1"}\n{"id":"root","component":"Nope"}\n```';
    expect(renderMarkdown(md, ctx)).not.toContain("ch-surface-problem");
    const preview = renderMarkdown(md, {
      locale: "tr",
      defaultLocale: "tr",
      preview: true,
    } as never);
    expect(preview).toContain('class="ch-surface-problem" role="note"');
    expect(preview).toContain("Bu etkileşimli blok gösterilemiyor");
    expect(preview).toContain("/info/id");
  });

  it("numbers footnotes in order of use and lists them at the end with a way back", () => {
    const html = renderMarkdown(
      "Second[^b] and first[^a], again[^b], `[^code]` and a stray[^none].\n\n[^a]: Note **A**.\n[^b]: Note B,\n  continued.\n",
      ctx,
    );
    expect(html).toContain(
      '<a href="#ch-fn-b" id="ch-fnref-b" aria-describedby="ch-footnotes-label">1</a>',
    );
    expect(html).toContain(
      '<a href="#ch-fn-a" id="ch-fnref-a" aria-describedby="ch-footnotes-label">2</a>',
    );
    expect(html).toContain("<code>[^code]</code>");
    expect(html).toContain("stray[^none]");
    expect(html).toMatch(
      /<section class="ch-footnotes">.*<li id="ch-fn-b">Note B, continued\. <a href="#ch-fnref-b"/s,
    );
    expect(html).toContain("<strong>A</strong>");
    expect(html).not.toContain("\uE000");
    expect(renderMarkdown("No notes here.", ctx)).not.toContain("ch-footnotes");
  });
});
