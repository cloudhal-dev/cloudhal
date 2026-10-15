// @vitest-environment happy-dom
/**
 * RFC-0020 §4: live surfaces. The server renders inputs, actions, bound text and conditional
 * components with the data as inert JSON; the interaction runtime (a constant module) keeps them
 * live in the browser. Its functions and conditions must equal `@cloudhal/core-ts/surfaces`.
 */
import { createHash } from "node:crypto";
import type { SurfaceComponent, SurfaceSection } from "@cloudhal/core-contracts";
import { evaluateCondition, resolveValue } from "@cloudhal/core-ts/surfaces";
import { afterEach, describe, expect, it } from "vitest";
import { SURFACE_SCRIPT, scriptJson } from "../src/surface-client.ts";
import { renderSurface } from "../src/surfaces.ts";

/** The bits of the happy-dom globals these tests use (the package's types have no DOM lib). */
interface El {
  textContent: string | null;
  hidden: boolean;
  value: string;
  checked: boolean;
  click(): void;
  setAttribute(name: string, value: string): void;
  dispatchEvent(event: unknown): boolean;
}
const dom = globalThis as unknown as {
  document: {
    body: El & {
      innerHTML: string;
      querySelector(s: string): El | null;
      querySelectorAll(s: string): El[];
    };
    documentElement: { lang: string };
  };
  location: { href: string };
  Event: new (type: string, init?: { bubbles?: boolean }) => unknown;
};
const document = dom.document;
const location = dom.location;
const DomEvent = dom.Event;

const surface = (
  components: SurfaceComponent[],
  data: Record<string, unknown>,
): SurfaceSection => ({
  id: "sec_live000001",
  kind: "surface",
  catalog: "blog@1",
  components: components as SurfaceSection["components"],
  data,
});

const pricing = surface(
  [
    {
      id: "root",
      component: "Stack",
      children: ["billing", "seats", "price", "more", "reset", "yearly-note"],
    },
    {
      id: "billing",
      component: "Toggle",
      props: { options: ["monthly", "yearly"], value: { path: "/billing" } },
    },
    {
      id: "seats",
      component: "Slider",
      props: { label: "Seats", min: 1, max: 50, value: { path: "/seats" } },
    },
    {
      id: "price",
      component: "Stat",
      props: {
        value: {
          call: "pluralize",
          args: { count: { path: "/seats" }, one: "# seat", other: "# seats" },
        },
        label: { path: "/billing" },
      },
    },
    {
      id: "more",
      component: "Button",
      props: { label: "+1 seat", onClick: { action: "increment", path: "/seats", by: 1 } },
    },
    {
      id: "reset",
      component: "Button",
      props: { label: "Reset", variant: "ghost", onClick: { action: "reset" } },
    },
    {
      id: "yearly-note",
      component: "Badge",
      props: { label: "Two months free", tone: "success" },
      visible: { eq: [{ path: "/billing" }, "yearly"] },
    },
  ],
  { billing: "monthly", seats: 5, note: "</script><script>alert(1)</script>" },
);

/** Puts server HTML on the page and runs the runtime module's code against it. */
function mount(html: string) {
  document.body.innerHTML = html;
  // The module is a constant string we ship; running it here is what the browser does with it.
  new Function(SURFACE_SCRIPT.code)();
  return document.body;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("live surface markup", () => {
  it("marks inputs, actions, bound text and conditional components, and embeds inert data", () => {
    const html = renderSurface(pricing);
    expect(html).toContain('data-ch-surface="ch-sec_live000001"');
    expect(html).toContain(
      'type="radio" name="ch-sec_live000001-billing" value="monthly" data-ch-model="/billing" checked',
    );
    expect(html).toContain(
      'type="range" min="1" max="50" step="1" value="5" data-ch-model="/seats"',
    );
    expect(html).toContain(
      'data-ch-action="{&quot;action&quot;:&quot;increment&quot;,&quot;path&quot;:&quot;/seats&quot;,&quot;by&quot;:1}"',
    );
    expect(html).toContain('<span data-ch-text="');
    expect(html).toMatch(/<div class="ch-node" data-ch-visible="[^"]+" hidden>/);
    expect(html).toContain('<script type="module" src="/_cloudhal/surface.1.js"></script>');
    // The data cannot end its script element.
    expect(html).not.toContain("</script><script>alert");
    expect(html).toContain("\\u003c/script\\u003e");
  });

  it("stays plain HTML for a surface without inputs or actions", () => {
    const still = surface([{ id: "root", component: "Heading", props: { text: { path: "/t" } } }], {
      t: "Hi",
    });
    const html = renderSurface(still);
    expect(html).not.toContain("data-ch-surface");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("data-ch-text");
  });
});

describe("interaction runtime", () => {
  it("writes inputs to the data, runs actions and keeps text and visibility in step", () => {
    const page = mount(renderSurface(pricing));
    const price = () => page.querySelector(".ch-stat__value")?.textContent;
    const label = () => page.querySelector(".ch-stat__label")?.textContent;
    const note = () => page.querySelector("[data-ch-visible]");
    expect(price()).toBe("5 seats");
    expect(note()?.hidden).toBe(true);

    const yearly = page.querySelector('input[value="yearly"]') as El;
    yearly.checked = true;
    yearly.dispatchEvent(new DomEvent("change", { bubbles: true }));
    expect(label()).toBe("yearly");
    expect(note()?.hidden).toBe(false);

    const slider = page.querySelector('input[type="range"]') as El;
    slider.value = "1";
    slider.dispatchEvent(new DomEvent("input", { bubbles: true }));
    expect(price()).toBe("1 seat");

    page.querySelector("button.ch-button--primary")?.click();
    expect(price()).toBe("2 seats");
    expect(slider.value).toBe("2");

    page.querySelector("button.ch-button--ghost")?.click();
    expect(price()).toBe("5 seats");
    expect(label()).toBe("monthly");
    expect(note()?.hidden).toBe(true);
  });

  it("refuses unsafe navigation and paths that reach the prototype", () => {
    const evil = surface(
      [
        { id: "root", component: "Stack", children: ["go", "poison"] },
        {
          id: "go",
          component: "Button",
          props: { label: "Go", onClick: { action: "navigate", href: "/docs" } },
        },
        {
          id: "poison",
          component: "Button",
          props: {
            label: "x",
            onClick: { action: "set", path: "/__proto__/polluted", value: "yes" },
          },
        },
      ],
      {},
    );
    const page = mount(renderSurface(evil));
    // A tampered action on the page: the runtime still refuses a script URL.
    const go = page.querySelector("button") as El;
    go.setAttribute(
      "data-ch-action",
      JSON.stringify({ action: "navigate", href: "javascript:alert(1)" }),
    );
    const before = location.href;
    go.click();
    expect(location.href).toBe(before);
    page.querySelectorAll("button")[1]?.click();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("matches the server's functions and conditions", () => {
    const data = { n: 1234.5, d: "2026-10-15T00:00:00Z", s: "hello", list: [1, 2], b: "yearly" };
    const values: unknown[] = [
      { call: "formatNumber", args: { value: { path: "/n" }, digits: 1 } },
      { call: "formatCurrency", args: { value: { path: "/n" }, currency: "EUR" } },
      { call: "formatDate", args: { value: { path: "/d" }, style: "long" } },
      { call: "pluralize", args: { count: 2, one: "# post", other: "# posts" } },
      { call: "concat", args: { parts: ["a", { path: "/s" }] } },
      { call: "length", args: { value: { path: "/list" } } },
      { call: "email", args: { value: "a@b.co" } },
      { call: "range", args: { value: { path: "/n" }, min: 0, max: 10 } },
    ];
    const conditions: unknown[] = [
      { eq: [{ path: "/b" }, "yearly"] },
      { gt: [{ path: "/n" }, 1000] },
      { and: [{ path: "/s" }, { not: { path: "/missing" } }] },
      { or: [{ lt: [{ path: "/n" }, 0] }, { ne: [{ path: "/s" }, "hello"] }] },
    ];
    const html = `<section data-ch-surface="x"><script type="application/json" data-ch-state>${scriptJson(data)}</script>${values
      .map((v, i) => `<span id="v${i}" data-ch-text='${JSON.stringify(v)}'></span>`)
      .join("")}${conditions
      .map((c, i) => `<div id="c${i}" data-ch-visible='${JSON.stringify(c)}'></div>`)
      .join("")}</section>`;
    document.documentElement.lang = "en";
    const page = mount(html);
    values.forEach((v, i) => {
      expect(page.querySelector(`#v${i}`)?.textContent).toBe(
        String(resolveValue(v, data, { locale: "en" })),
      );
    });
    conditions.forEach((c, i) => {
      expect(page.querySelector(`#c${i}`)?.hidden).toBe(!evaluateCondition(c, data));
    });
  });

  it("pins the module's code to its versioned name", () => {
    // Bump `surface.<n>.js` with any change to the code (`/_cloudhal/*` is cached as immutable).
    expect(createHash("sha256").update(SURFACE_SCRIPT.code).digest("hex").slice(0, 12)).toBe(
      "7ad7ec695bda",
    );
    expect(SURFACE_SCRIPT.path).toBe("/_cloudhal/surface.1.js");
    expect(SURFACE_SCRIPT.code.length).toBeLessThan(6_500);
  });
});
