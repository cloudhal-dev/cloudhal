/** RFC-0015 §5: built-in block types render escaped, safe markup; misfits render nothing. */
import type { ComponentSection } from "@cloudhal/core-contracts";
import { defineBlockTypes } from "@cloudhal/core-ts/blocks";
import { describe, expect, it } from "vitest";
import { renderComponentSection, themeRegistry } from "../src/blocks.ts";
import { renderBodyParts, renderMarkdown } from "../src/markdown.ts";
import { renderSectionHtml } from "../src/preview.ts";

const section = (type: string, props: Record<string, unknown>): ComponentSection => ({
  id: "sec_block000001",
  kind: "component",
  type,
  props,
});

describe("component sections", () => {
  it("renders a callout with its title escaped and its markdown through the safe renderer", () => {
    const html = renderComponentSection(
      section("callout", {
        tone: "warning",
        title: "<script>alert(1)</script>",
        content: "Back up **first**. <img src=x onerror=alert(1)>",
      }),
    );
    expect(html).toContain('data-block-type="callout"');
    expect(html).toContain('class="ch-callout ch-callout--warning"');
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("<strong>first</strong>");
    expect(html).not.toContain("<img src=x");
  });

  it("renders buttons, video links and questions", () => {
    expect(
      renderComponentSection(
        section("button", { label: "Go", href: "/start", variant: "secondary" }),
      ),
    ).toContain('<a class="ch-button ch-button--secondary" href="/start">Go</a>');
    const video = renderComponentSection(
      section("embed", { url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ", title: "Bunny" }),
    );
    expect(video).toContain('href="https://www.youtube.com/watch?v=aqz-KE-bpKQ"');
    expect(video).toContain("youtube.com");
    expect(video).not.toContain("<iframe");
    const faq = renderComponentSection(
      section("faq", { items: [{ question: "Why?", answer: "Because **so**." }] }),
    );
    expect(faq).toContain('<details class="ch-faq__item"><summary>Why?</summary>');
    expect(faq).toContain("<strong>so</strong>");
  });

  it("renders nothing for misfitting props or unknown types, and says why in previews", () => {
    expect(renderComponentSection(section("button", { label: "Go", href: "javascript:x" }))).toBe(
      "",
    );
    expect(renderComponentSection(section("pricing-table", { plans: [] }))).toBe("");
    expect(renderSectionHtml(section("pricing-table", {}))).toContain(
      "pricing-table: unknown block type",
    );
    expect(renderSectionHtml(section("callout", { tone: "loud" }))).toContain(
      "callout: props do not fit the block type",
    );
  });
});

describe("body directives", () => {
  it("render built-ins like their sections, inner markdown through the same renderer", () => {
    const html = renderMarkdown(
      [
        "Intro.",
        "",
        ':::callout{tone="warning" title="<b>Careful</b>"}',
        "Back up **first**.",
        "",
        "[docs](javascript:alert(1)) <script>x</script>",
        ":::",
        "",
        '::button{label="Start" href="/start" variant="secondary"}',
      ].join("\n"),
    );
    expect(html).toContain('<div class="ch-block" data-block-type="callout">');
    expect(html).toContain("ch-callout--warning");
    expect(html).toContain("&lt;b&gt;Careful&lt;/b&gt;");
    expect(html).toContain("<strong>first</strong>");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<script>");
    expect(html).toContain('<a class="ch-button ch-button--secondary" href="/start">Start</a>');
    expect(html).not.toContain(":::");
  });

  it("render nothing for unknown or misfitting directives, and say why in previews", () => {
    const body =
      '::pricing-table{plan="pro"}\n\n::button{label="Go" href="javascript:x"}\n\nAfter.';
    const site = renderMarkdown(body);
    expect(site).not.toContain("pricing-table");
    expect(site).not.toContain("javascript");
    expect(site).toContain("<p>After.</p>");
    const preview = renderMarkdown(body, { preview: true });
    expect(preview).toContain("pricing-table: unknown block type");
    expect(preview).toContain("button: props do not fit the block type");
  });

  it("leave text that is not exactly a directive as ordinary markdown", () => {
    expect(renderMarkdown(":::callout\nnever closed")).toContain(":::callout");
  });
});

describe("theme block types (RFC-0015 §6)", () => {
  const testimonial = defineBlockTypes([
    {
      name: "testimonial",
      title: { en: "Testimonial" },
      where: ["section", "body"],
      content: "markdown",
      props: {
        type: "object",
        additionalProperties: false,
        required: ["author"],
        properties: { author: { type: "string", maxLength: 120 } },
      },
      example: { props: { author: "Ada" }, markdown: "Great." },
    },
  ]);
  const registry = themeRegistry(testimonial);

  it("cuts a body where the theme's own components go, after checking their props", () => {
    const parts = renderBodyParts(
      {
        format: "markdown",
        value:
          'Intro.\n\n:::testimonial{author="Ada"}\nIt **works**.\n:::\n\n:::testimonial{role="x"}\nNo author.\n:::\n\n::button{label="Go" href="/go"}\n',
      },
      undefined,
      { registry, components: new Set(["testimonial"]) },
    );
    expect(parts).toHaveLength(3);
    expect(parts[0]).toEqual({ html: "<p>Intro.</p>\n" });
    expect(parts[1]).toEqual({
      slot: {
        type: "testimonial",
        props: { author: "Ada" },
        content: "It **works**.",
        contentHtml: "<p>It <strong>works</strong>.</p>\n",
      },
    });
    // The misfit renders nothing; the built-in keeps its markup.
    expect((parts[2] as { html: string }).html).toContain("ch-button");
    expect((parts[2] as { html: string }).html).not.toContain("No author");
  });

  it("renders bodies in one part when the theme has no components, and builds a registry once", () => {
    expect(renderBodyParts({ format: "markdown", value: "Hi." }, undefined, undefined)).toEqual([
      { html: "<p>Hi.</p>\n" },
    ]);
    expect(themeRegistry(testimonial)).toBe(registry);
  });

  it("tells a theme's type from an unknown one in previews", () => {
    const html = renderMarkdown(
      '::pricing-table{plan="pro"}\n\n:::testimonial{author="Ada"}\nYes.\n:::',
      {
        preview: true,
        blocks: registry,
      },
    );
    expect(html).toContain("pricing-table: unknown block type");
    expect(html).toContain("testimonial: shown by the theme on the site");
  });
});
