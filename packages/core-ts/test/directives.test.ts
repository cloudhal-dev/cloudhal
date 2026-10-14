/** RFC-0015 §2: body directives — syntax, splitting, props and the store's checks. */
import { describe, expect, it } from "vitest";
import { createBlockRegistry } from "../src/blocks.ts";
import { bodyDirectives, splitMarkdown } from "../src/body-blocks.ts";
import {
  checkDirective,
  directiveProps,
  matchDirective,
  parseDirective,
  writeDirective,
} from "../src/directives.ts";
import { InvariantError } from "../src/errors.ts";

const registry = createBlockRegistry();

describe("directive syntax", () => {
  it("parses containers and leaves with their attributes", () => {
    expect(
      parseDirective(':::callout{tone="warning" title="Say \\"hi\\""}\nBack **up**.\n:::'),
    ).toEqual({
      name: "callout",
      attrs: { tone: "warning", title: 'Say "hi"' },
      content: "Back **up**.",
      fence: 3,
    });
    expect(parseDirective('::button{label="Go" href="/start" wide}')).toEqual({
      name: "button",
      attrs: { label: "Go", href: "/start", wide: true },
      fence: 2,
    });
    expect(parseDirective("::embed")).toEqual({ name: "embed", attrs: {}, fence: 2 });
  });

  it("rejects anything that does not parse exactly", () => {
    for (const bad of [
      ":::callout{tone=warning}\nx\n:::", // unquoted value
      ':::callout{tone="a" tone="b"}\nx\n:::', // duplicate key
      ":::callout\nnever closed",
      "::Callout",
      "::x", // name too short
      '::button{label="Go"} trailing',
      ':::callout{title="a\\nb"}\nx\n:::', // unknown escape
    ])
      expect(parseDirective(bad), bad).toBeUndefined();
  });

  it("closes a container only on its own fence, never inside code or a deeper container", () => {
    const src = [
      "::::callout",
      "```",
      ":::",
      "```",
      ":::callout",
      "inner",
      ":::",
      "::::",
      "after",
    ].join("\n");
    const m = matchDirective(src);
    expect(m?.raw.split("\n").at(-1)).toBe("::::");
    expect(m?.directive.content).toContain(":::callout\ninner\n:::");
  });

  it("writes directives that read back the same, with a fence deeper than any inside", () => {
    const leaf = writeDirective("button", {
      label: 'A "quoted" \\ label',
      href: "/x",
      n: 3,
      on: true,
      off: false,
    });
    expect(leaf).toBe('::button{label="A \\"quoted\\" \\\\ label" href="/x" n="3" on off="false"}');
    expect(parseDirective(leaf)?.attrs.label).toBe('A "quoted" \\ label');
    const outer = writeDirective("callout", {}, ":::callout\ninner\n:::");
    expect(outer).toBe("::::callout\n:::callout\ninner\n:::\n::::");
    expect(parseDirective(outer)?.content).toBe(":::callout\ninner\n:::");
    expect(writeDirective("callout", { tone: "info" }, "")).toBe(':::callout{tone="info"}\n:::');
  });
});

describe("directives in bodies", () => {
  it("are one block each, typed directive:<name>, even with blank lines inside", () => {
    const body =
      'Intro.\n\n:::callout{tone="info"}\nFirst.\n\nSecond.\n:::\n\n::embed{url="https://vimeo.com/1" title="A"}\n\nEnd.\n';
    const { prefix, units } = splitMarkdown(body);
    expect(units.map((u) => u.type)).toEqual([
      "paragraph",
      "directive:callout",
      "directive:embed",
      "paragraph",
    ]);
    expect(prefix + units.map((u) => u.text).join("")).toBe(body);
    expect(bodyDirectives(body).map((d) => d.name)).toEqual(["callout", "embed"]);
  });

  it("coerces attributes by the type's schema and checks them", () => {
    const callout = registry.get("callout");
    expect(directiveProps(callout, { tone: "warning", extra: true })).toEqual({
      tone: "warning",
      extra: true,
    });
    const ok = parseDirective(':::callout{tone="success"}\nYes.\n:::');
    expect(ok && checkDirective(registry, ok)).toEqual([]);
    const bad = parseDirective(':::callout{tone="loud"}\nNo.\n:::');
    expect(bad && checkDirective(registry, bad)?.[0]?.path).toBe("tone");
    const leafed = parseDirective("::callout");
    expect(leafed && checkDirective(registry, leafed)?.[0]?.message).toMatch(/wraps text/);
    const faq = parseDirective("::faq");
    expect(faq && checkDirective(registry, faq)?.[0]?.message).toMatch(/section block/);
    const unknown = parseDirective('::pricing-table{plan="pro"}');
    expect(unknown && checkDirective(registry, unknown)).toBeUndefined();
  });
});

describe("store: body directives (RFC-0015 §7)", () => {
  it("refuses directives that do not fit their type and keeps unknown ones", async () => {
    const { MemoryBlobStore } = await import("@cloudhal/storage");
    const { BetterSqlite3Driver } = await import("@cloudhal/storage/sqlite");
    const { SiteGraphStore, seedStarterSite } = await import("../src/index.ts");
    const sql = await BetterSqlite3Driver.open(":memory:");
    const store = new SiteGraphStore({ sql, blobs: new MemoryBlobStore() });
    await store.init();
    const site = await seedStarterSite(store, { name: "Directives", slug: "directives" });
    const entry = (await store.listContentEntries(site.id))[0];
    if (!entry) throw new Error("no entry");
    const write = (value: string) =>
      store.updateContentEntry({ ...entry, body: { format: "markdown", value } });
    const bad = write('Text.\n\n::button{label="Go" href="javascript:alert(1)"}\n');
    await expect(bad).rejects.toBeInstanceOf(InvariantError);
    await expect(bad).rejects.toMatchObject({
      code: "invalid_props",
      details: { type: "button", issues: [{ path: "href" }] },
    });
    const saved = await write('Text.\n\n::pricing-table{plan="pro"}\n');
    expect(saved.body.value).toContain("::pricing-table");
    // Rich-text sections of pages too.
    const home = (await store.listPages(site.id)).find((p) => p.path === "/");
    if (!home) throw new Error("no home page");
    await expect(
      store.updatePage({
        ...home,
        sections: [
          ...home.sections,
          {
            id: "sec_dir0000001",
            kind: "richText",
            format: "markdown",
            body: ':::callout{tone="loud"}\nx\n:::',
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "invalid_props" });
  });
});

describe("directives next to other text", () => {
  it("interrupt a paragraph only where a whole directive starts", () => {
    expect(splitMarkdown('Text\n::button{label="Go" href="/"}').units.map((u) => u.type)).toEqual([
      "paragraph",
      "directive:button",
    ]);
    expect(splitMarkdown("Text\n::not a directive\n:::callout").units.map((u) => u.type)).toEqual([
      "paragraph",
    ]);
    expect(splitMarkdown(":::callout\nnever closed").units.map((u) => u.type)).toEqual([
      "paragraph",
    ]);
  });
});
