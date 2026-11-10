/**
 * A2UI `updateDataModel` paths come from agent and MCP input: reserved keys are refused at every
 * level with an `InteropError`, and nothing reaches `Object.prototype` (CodeQL
 * js/prototype-polluting-assignment, alerts 42–44).
 */
import { afterEach, describe, expect, it } from "vitest";
import { A2UI_BASIC_CATALOG, fromA2ui, InteropError } from "../src/surface-interop.ts";
import { checkSurface, createCatalog } from "../src/surfaces.ts";

const catalog = createCatalog({ name: "blog", major: 1 });
const v = "v0.9";

const withData = (path: string, value: unknown) => [
  { version: v, createSurface: { surfaceId: "s", catalogId: A2UI_BASIC_CATALOG } },
  {
    version: v,
    updateComponents: {
      surfaceId: "s",
      components: [{ id: "root", component: "Text", text: { path: "/title" } }],
    },
  },
  { version: v, updateDataModel: { surfaceId: "s", path, value } },
];

const convert = (path: string, value: unknown = { polluted: true }) =>
  fromA2ui(withData(path, value), { sectionId: "sec_pollute001", catalog: catalog.id });

const POINTERS = [
  "/__proto__/x",
  "/__proto__",
  "/constructor/prototype/x",
  "/a/__proto__/x",
  "/a/b/constructor/prototype/x",
  "/list/0/__proto__/x",
  "/prototype/x",
  // `~1` decodes to `/`, `~0` to `~`: the decoded segment is what is checked
  "/a~1b/__proto__/x",
];

afterEach(() => {
  // Belt and braces: never leave a polluted prototype behind for other tests.
  for (const k of ["x", "polluted"]) delete (Object.prototype as Record<string, unknown>)[k];
});

describe("A2UI data paths with reserved keys", () => {
  it.each(POINTERS)("refuses %s with an error and leaves Object.prototype alone", (pointer) => {
    expect(() => convert(pointer)).toThrow(InteropError);
    expect(() => convert(pointer)).toThrow(/reserved key/);
    expect(({} as Record<string, unknown>).x).toBeUndefined();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.getPrototypeOf({})).toBe(Object.prototype);
  });

  it("refuses a delete (no value) through a reserved key too", () => {
    expect(() => convert("/__proto__/hasOwnProperty", undefined)).toThrow(InteropError);
    expect(typeof Object.prototype.hasOwnProperty).toBe("function");
  });

  it("refuses a non-index step into an array", () => {
    const messages = [
      ...withData("/list", ["a"]),
      { version: v, updateDataModel: { surfaceId: "s", path: "/list/length", value: 0 } },
    ];
    expect(() => fromA2ui(messages, { sectionId: "sec_pollute001", catalog: catalog.id })).toThrow(
      /not an array index/,
    );
  });

  it("still writes ordinary paths, inherited names included, as own data", () => {
    const r = fromA2ui(
      [
        ...withData("/title", "Hello"),
        { version: v, updateDataModel: { surfaceId: "s", path: "/toString/y", value: 1 } },
        { version: v, updateDataModel: { surfaceId: "s", path: "/list/1/name", value: "Pro" } },
      ],
      { sectionId: "sec_pollute001", catalog: catalog.id },
    );
    expect(r.surface.data).toEqual({
      title: "Hello",
      toString: { y: 1 },
      list: [undefined, { name: "Pro" }],
    });
    expect(Object.hasOwn(r.surface.data as object, "toString")).toBe(true);
    expect(checkSurface(r.surface, catalog).issues).toEqual([]);
  });
});

describe("surface pointers with reserved keys", () => {
  it.each(["/__proto__/x", "/constructor/prototype/x", "/a/__proto__"])(
    "checkSurface reports %s",
    (path) => {
      const surface = {
        id: "sec_pollute002",
        kind: "surface" as const,
        catalog: catalog.id,
        data: {},
        components: [
          { id: "root", component: "TextField", props: { label: "N", value: { path } } },
        ],
      };
      expect(checkSurface(surface as never, catalog).issues).toContainEqual(
        expect.objectContaining({ message: expect.stringMatching(/reserved keys/) }),
      );
    },
  );
});
