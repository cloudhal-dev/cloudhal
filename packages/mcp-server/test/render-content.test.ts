// @vitest-environment happy-dom
/**
 * render_page's content checks (src/render/checks/content.ts) on their own: the prelude's helpers
 * are stubbed and a fake monospace layout stands in for Chrome's, in which a collapsed blank is
 * drawn on the line of the character before it. They must see whitespace as whitespace:
 * `long-line` counts a run of blanks once and the letter "s" as text, `input-label` splits
 * `aria-labelledby` on blanks.
 */
import { afterEach, describe, expect, it } from "vitest";
import { CONTENT_CHECKS } from "../src/render/checks/content.ts";

interface TextNode {
  data: string;
}
/** The happy-dom globals this test uses (the package's types have no DOM lib). */
interface Doc {
  body: { innerHTML: string };
  querySelectorAll(selector: string): Iterable<unknown>;
  createTreeWalker(root: unknown, what: number): { nextNode(): unknown; currentNode: TextNode };
}
const dom = globalThis as unknown as { document: Doc };

const LINE = 24;
const SHOW_TEXT = 4;

/** Lays every paragraph out `cols` characters a line, a run of blanks drawn as one. */
function layout(cols: number): Map<TextNode, number[]> {
  const at = new Map<TextNode, number[]>();
  for (const p of dom.document.querySelectorAll("p")) {
    const tw = dom.document.createTreeWalker(p, SHOW_TEXT);
    let drawn = 0;
    let blankBefore = true;
    while (tw.nextNode()) {
      const node = tw.currentNode;
      const lines: number[] = [];
      for (const c of node.data) {
        const blank = /\s/.test(c);
        if (!(blank && blankBefore)) drawn++;
        blankBefore = blank;
        lines.push(Math.floor(Math.max(0, drawn - 1) / cols));
      }
      at.set(node, lines);
    }
  }
  return at;
}

/** Runs the content checks on `html` laid out `cols` characters a line: `id: note` per finding. */
async function run(html: string, cols: number): Promise<string[]> {
  dom.document.body.innerHTML = html;
  const lines = layout(cols);
  const createRange = () => {
    let node: TextNode | undefined;
    let offset = 0;
    return {
      setStart(n: TextNode, i: number) {
        node = n;
        offset = i;
      },
      setEnd() {},
      getClientRects: () => [
        { top: ((node && lines.get(node)?.[offset]) ?? 0) * LINE, width: 8, height: LINE },
      ],
    };
  };
  const document = new Proxy(dom.document, {
    get(target, key) {
      if (key === "createRange") return createRange;
      const value: unknown = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const style = () => ({
    display: "block",
    lineHeight: `${LINE}px`,
    fontSize: "16px",
    fontFamily: "monospace",
  });
  const found: string[] = [];
  const add = (id: string, _el: unknown, note: string) => found.push(`${id}: ${note}`);
  // Constructing a Function from the part's source (tests only; Workers forbid eval).
  const checks = new Function(
    "document",
    "getComputedStyle",
    "NodeFilter",
    "W",
    "add",
    "visible",
    "clip",
    `return (async () => {${CONTENT_CHECKS}})();`,
  );
  await checks(
    document,
    style,
    { SHOW_TEXT },
    1440,
    add,
    () => true,
    (s: string) => s,
  );
  return found;
}

const words = (word: string, n: number) => Array.from({ length: n }, () => word).join(" ");
const only = (found: string[], id: string) => found.filter((f) => f.startsWith(`${id}: `));

afterEach(() => {
  dom.document.body.innerHTML = "";
});

describe("content checks see whitespace as whitespace", () => {
  it("long-line counts an unminified template's line breaks and indentation once", async () => {
    // 85 drawn characters a line; the source breaks and indents every 11 words.
    const text = words("abcd", 120).replace(/((?:abcd ){11})/g, "$1\n        ");
    const found = await run(`<p>\n        ${text}\n      </p>`, 85);
    expect(only(found, "long-line")).toEqual([]);
  });

  it("long-line counts the letter s as text", async () => {
    const found = only(await run(`<p>${words("less", 120)}</p>`, 95), "long-line");
    expect(found).toHaveLength(1);
    expect(found[0]).toMatch(/^long-line: about 95 characters a line/);
  });

  it("input-label reads every id aria-labelledby names", async () => {
    const html = `<p id="first-name">First name</p><p id="hint">As on your passport</p><input aria-labelledby="first-name hint">`;
    expect(only(await run(html, 85), "input-label")).toEqual([]);
  });
});
