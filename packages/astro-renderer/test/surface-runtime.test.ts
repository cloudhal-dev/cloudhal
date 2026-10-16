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
import { SURFACE_SCRIPT, SURFACE_SCRIPT_ALIASES, scriptJson } from "../src/surface-client.ts";
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
    expect(html).toContain('<script type="module" src="/_cloudhal/surface.10.js"></script>');
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
  it("computes from typed fields, ticks and radio choices, and runs a keypad (RFC-0022 22b)", () => {
    const call = (name: string, args: Record<string, unknown>) => ({ call: name, args });
    const tool = surface(
      [
        {
          id: "root",
          component: "Stack",
          children: ["w", "vat", "plan", "total", "display", "seven", "times", "eq", "warn"],
        },
        {
          id: "w",
          component: "NumberField",
          props: {
            label: "Seats",
            value: { path: "/seats" },
            unit: "seats",
            help: "1 to 50",
            invalid: call("if", {
              cond: { gt: [{ path: "/seats" }, 50] },
              ifTrue: true,
              ifFalse: false,
            }) as unknown as boolean,
          },
        },
        {
          id: "vat",
          component: "Checkbox",
          props: { label: "Include VAT", checked: { path: "/vat" } },
        },
        {
          id: "plan",
          component: "RadioGroup",
          props: {
            label: "Plan",
            value: { path: "/plan" },
            variant: "buttons",
            options: [
              { value: "basic", label: "Basic" },
              { value: "pro", label: "Pro" },
            ],
          },
        },
        {
          id: "total",
          component: "Stat",
          props: {
            label: "Total",
            value: call("multiply", {
              values: [
                { path: "/seats" },
                call("choose", { value: { path: "/plan" }, cases: { basic: 9, pro: 19 } }),
                call("if", { cond: { path: "/vat" }, ifTrue: 1.2, ifFalse: 1 }),
              ],
            }),
          },
        },
        { id: "display", component: "Text", props: { text: { path: "/display" } } },
        {
          id: "seven",
          component: "Button",
          props: { label: "7", onClick: { action: "append", path: "/display", value: "7" } },
        },
        {
          id: "times",
          component: "Button",
          props: { label: "×", onClick: { action: "append", path: "/display", value: "×6" } },
        },
        {
          id: "eq",
          component: "Button",
          props: {
            label: "=",
            onClick: {
              action: "set",
              path: "/display",
              value: call("calculate", { expression: { path: "/display" } }),
            },
          },
        },
        {
          id: "warn",
          component: "Text",
          props: { text: "Too many" },
          visible: { gt: [{ path: "/seats" }, 50] },
        },
      ],
      { seats: "", vat: false, plan: "basic", display: "" },
    );
    const html = renderSurface(tool, { media: { locale: "tr" } as never });
    expect(html).toContain(
      '<input class="ch-input" type="number" inputmode="decimal" id="ch-sec_live000001-w" step="any" value="" data-ch-model="/seats" aria-describedby="ch-sec_live000001-w-help"',
    );
    expect(html).toContain('<fieldset class="ch-radio" data-variant="buttons">');
    expect(html).toContain("Bu araç hesaplamak için JavaScript gerektirir.");
    const page = mount(html);
    const total = () => page.querySelector(".ch-stat__value")?.textContent;
    expect(total()).toBe("");
    const field = page.querySelector('input[type="number"]') as El;
    field.value = "10";
    field.dispatchEvent(new DomEvent("input", { bubbles: true }));
    expect(total()).toBe("90");
    const vat = page.querySelector('input[type="checkbox"]') as El;
    vat.checked = true;
    vat.dispatchEvent(new DomEvent("change", { bubbles: true }));
    expect(total()).toBe("108");
    const pro = page.querySelector('input[value="pro"]') as El;
    pro.checked = true;
    pro.dispatchEvent(new DomEvent("change", { bubbles: true }));
    expect(total()).toBe("228");
    field.value = "";
    field.dispatchEvent(new DomEvent("input", { bubbles: true }));
    expect(total()).toBe("");
    field.value = "60";
    field.dispatchEvent(new DomEvent("input", { bubbles: true }));
    expect((field as unknown as Element).getAttribute("aria-invalid")).toBe("true");
    const buttons = [...page.querySelectorAll("button")] as El[];
    const display = () => page.querySelectorAll(".ch-text")[0]?.textContent;
    buttons[0]?.click();
    buttons[1]?.click();
    expect(display()).toBe("7×6");
    buttons[2]?.click();
    expect(display()).toBe("42");
  });

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
    const data = {
      n: 1234.5,
      d: "2026-10-15T00:00:00Z",
      s: "hello",
      list: [1, 2],
      b: "yearly",
      blank: "",
      comma: "2,5",
      rows: [{ p: 9 }, { p: 19 }, { p: "" }],
      expr: "(1 + 2) × 3 ÷ 4",
    };
    const call = (name: string, args: Record<string, unknown>) => ({ call: name, args });
    const values: unknown[] = [
      { call: "formatNumber", args: { value: { path: "/n" }, digits: 1 } },
      { call: "formatCurrency", args: { value: { path: "/n" }, currency: "EUR" } },
      { call: "formatDate", args: { value: { path: "/d" }, style: "long" } },
      { call: "pluralize", args: { count: 2, one: "# post", other: "# posts" } },
      { call: "concat", args: { parts: ["a", { path: "/s" }] } },
      { call: "length", args: { value: { path: "/list" } } },
      { call: "email", args: { value: "a@b.co" } },
      { call: "range", args: { value: { path: "/n" }, min: 0, max: 10 } },
      // RFC-0022 §1
      call("add", { values: [0.1, 0.2] }),
      call("add", { values: [1, { path: "/blank" }] }),
      call("subtract", { a: { path: "/n" }, b: { path: "/comma" } }),
      call("multiply", { values: [{ path: "/n" }, 3] }),
      call("divide", { a: 1, b: 3 }),
      call("divide", { a: 1, b: 0, fallback: "–" }),
      call("round", { value: 1.005, digits: 2 }),
      call("floor", { value: -1.5 }),
      call("ceil", { value: 1.01, digits: 1 }),
      call("abs", { value: -3 }),
      call("min", { values: [3, 1, 2] }),
      call("max", { values: [3, 1, 2] }),
      call("clamp", { value: 70, min: 1, max: 50 }),
      call("power", { base: 1.005, exponent: -360 }),
      call("formatNumber", { value: { path: "/blank" }, digits: 0 }),
      call("formatCurrency", { value: { path: "/blank" }, currency: "USD" }),
      call("power", { base: 2, exponent: 2000 }),
      call("number", { value: "", fallback: 0 }),
      call("if", { cond: { gte: [{ path: "/n" }, 1000] }, ifTrue: "big", ifFalse: "small" }),
      call("if", { cond: { lte: [{ path: "/n" }, 1000] }, ifTrue: "x" }),
      call("choose", { value: { path: "/b" }, cases: { monthly: 9, yearly: 90 }, default: 0 }),
      call("sum", { list: { path: "/rows" }, field: "p" }),
      call("average", { list: { path: "/rows" }, field: "p" }),
      call("count", { list: { path: "/rows" }, field: "p" }),
      call("formatPercent", { value: 0.256, digits: 1 }),
      call("calculate", { expression: { path: "/expr" } }),
      call("calculate", { expression: "alert(1)" }),
      call("calculate", {
        expression: "a * 2^b - (n / 1000)",
        vars: { a: 3, b: 3, n: { path: "/n" } },
      }),
      call("calculate", { expression: "x + 1", vars: { x: { path: "/blank" } } }),
      call("calculate", { expression: "2 ^ -2 + unknown", vars: {} }),
      call("formatNumber", {
        digits: 0,
        value: call("multiply", { values: [call("add", { values: [1, 2] }), 1.5] }),
      }),
    ];
    const conditions: unknown[] = [
      { eq: [{ path: "/b" }, "yearly"] },
      { gt: [{ path: "/n" }, 1000] },
      { and: [{ path: "/s" }, { not: { path: "/missing" } }] },
      { or: [{ lt: [{ path: "/n" }, 0] }, { ne: [{ path: "/s" }, "hello"] }] },
      { gte: [{ path: "/n" }, 1234.5] },
      { lte: [{ path: "/n" }, 1000] },
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

  it("takes the step a scroll story is on from a ch:set event (RFC-0024 24b)", () => {
    const page = mount(
      renderSurface(
        surface(
          [
            {
              id: "root",
              component: "Scrolly",
              props: { step: { path: "/step" } },
              children: ["media", "s1", "s2"],
            },
            { id: "media", component: "Stack", children: ["one", "two"] },
            {
              id: "one",
              component: "Text",
              props: { text: "Chart one" },
              visible: { eq: [{ path: "/step" }, 1] },
            },
            {
              id: "two",
              component: "Text",
              props: { text: "Chart two" },
              visible: { eq: [{ path: "/step" }, 2] },
            },
            { id: "s1", component: "Step", children: ["t1"] },
            { id: "t1", component: "Text", props: { text: "First" } },
            { id: "s2", component: "Step", children: ["t2"] },
            { id: "t2", component: "Text", props: { text: "Second" } },
          ],
          { step: 1 },
        ),
      ),
    );
    const shown = () =>
      Array.from(page.querySelectorAll("[data-ch-visible]"), (el) =>
        el.hidden ? "-" : el.textContent?.trim(),
      );
    expect(shown()).toEqual(["Chart one", "-"]);
    const Custom = (
      globalThis as unknown as { CustomEvent: new (t: string, i: unknown) => unknown }
    ).CustomEvent;
    page
      .querySelector("[data-ch-surface]")
      ?.dispatchEvent(new Custom("ch:set", { detail: { path: "/step", value: 2 } }));
    expect(shown()).toEqual(["-", "Chart two"]);
    // only a JSON Pointer and a plain value are taken
    page
      .querySelector("[data-ch-surface]")
      ?.dispatchEvent(new Custom("ch:set", { detail: { path: "step", value: 1 } }));
    expect(shown()).toEqual(["-", "Chart two"]);
  });

  it("pins the module's code to its versioned name", () => {
    // Bump `surface.<n>.js` with any change to the code (`/_cloudhal/*` is cached as immutable).
    expect(createHash("sha256").update(SURFACE_SCRIPT.code).digest("hex").slice(0, 12)).toBe(
      "fc0f2c39714e",
    );
    expect(SURFACE_SCRIPT.path).toBe("/_cloudhal/surface.10.js");
    // RFC-0022: pages cached with the first name get the same (compatible) code
    expect(SURFACE_SCRIPT_ALIASES).toEqual([
      "/_cloudhal/surface.1.js",
      "/_cloudhal/surface.2.js",
      "/_cloudhal/surface.3.js",
      "/_cloudhal/surface.4.js",
      "/_cloudhal/surface.5.js",
      "/_cloudhal/surface.6.js",
      "/_cloudhal/surface.7.js",
      "/_cloudhal/surface.8.js",
      "/_cloudhal/surface.9.js",
    ]);
    // RFC-0025 25d: a copy says so in the page's toast region.
    expect(SURFACE_SCRIPT.code).toContain('.then(()=>toast("copied"))');
    // live charts load the drawer from its own versioned file
    expect(SURFACE_SCRIPT.code).toContain('import("/_cloudhal/chart.1.js")');
    // 11,000 until RFC-0025 25d added the copy toast (about 230 characters).
    expect(SURFACE_SCRIPT.code.length).toBeLessThan(11_500);
  });
});
