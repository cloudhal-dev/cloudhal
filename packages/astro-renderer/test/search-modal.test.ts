// @vitest-environment happy-dom
/**
 * RFC-0029 §6: the search module in a page. The header field opens the modal, results arrive
 * grouped by kind as a WAI-ARIA combobox and listbox, the arrow keys move the active option, the
 * last searches stay in this browser, a `429` says to wait; and the code is pinned to its name.
 */
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SearchJson } from "../src/search.ts";
import { SEARCH_SCRIPT } from "../src/search-client.ts";

/** The bits of the happy-dom globals these tests use (the package's types have no DOM lib). */
interface El {
  id: string;
  textContent: string | null;
  innerHTML: string;
  hidden: boolean;
  value: string;
  open: boolean;
  click(): void;
  getAttribute(name: string): string | null;
  querySelector(s: string): El | null;
  querySelectorAll(s: string): El[];
  dispatchEvent(event: unknown): boolean;
}
const dom = globalThis as unknown as {
  document: {
    body: El;
    documentElement: El & { lang: string };
    querySelector(s: string): El | null;
  };
  localStorage: {
    getItem(k: string): string | null;
    setItem(k: string, v: string): void;
    clear(): void;
  };
  FocusEvent: new (type: string, init?: { bubbles?: boolean }) => unknown;
  KeyboardEvent: new (
    type: string,
    init?: { key: string; metaKey?: boolean; bubbles?: boolean },
  ) => unknown;
  Event: new (type: string, init?: { bubbles?: boolean }) => unknown;
};
const { document, localStorage } = dom;
const all = (el: El, s: string) => [...el.querySelectorAll(s)];

const words = {
  kinds: { article: "Articles", page: "Pages", term: "Topics", author: "Authors" },
  all: "See all results for “{q}”",
  none: "Nothing matches “{q}”.",
  recent: "Recent searches",
  clear: "Clear recent searches",
  limited: "Too many searches right now.",
  error: "Search is unavailable right now.",
  updating: "Catching up.",
  count: { one: "# result", other: "# results" },
};

function mount() {
  document.documentElement.lang = "en";
  document.body.innerHTML = `
<form class="ch-header-search" action="/search" data-ch-search-open><input id="h" name="q" value="muse"></form>
<dialog data-ch-search data-endpoint="/search.json" data-page="/search" data-words='${JSON.stringify(words)}'>
  <form action="/search"><input id="q" data-ch-search-input><button type="button" data-ch-search-close>Close</button></form>
  <div id="ch-search-list" role="listbox" data-ch-search-list></div>
  <p data-ch-search-note hidden></p>
  <p role="status" data-ch-search-status></p>
</dialog>`;
  // The module is a constant string we ship; running it here is what the browser does with it.
  new Function(SEARCH_SCRIPT.code)();
  const $ = (s: string) => document.querySelector(s) as El;
  return {
    dialog: $("dialog"),
    input: $("#q"),
    list: $("#ch-search-list"),
    note: $("[data-ch-search-note]"),
    status: $("[data-ch-search-status]"),
    header: $("#h"),
  };
}

const answer = (json: Partial<SearchJson> | { status: number }) =>
  vi.fn(async (_url: string) =>
    "status" in json
      ? new Response("{}", { status: json.status })
      : new Response(
          JSON.stringify({
            query: "",
            total: 0,
            page: 1,
            pages: 0,
            stale: false,
            hits: [],
            ...json,
          }),
        ),
  );
const key = (el: El, k: string) =>
  el.dispatchEvent(new dom.KeyboardEvent("keydown", { key: k, bubbles: true }));

afterEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("search modal", () => {
  it("opens from the header field and lists grouped hits as a combobox", async () => {
    const fetch = answer({
      query: "muse",
      total: 2,
      pages: 1,
      hits: [
        {
          title: "A new museum",
          href: "/posts/museum",
          kind: "article",
          snippetHtml: "the <mark>museum</mark> &amp; more",
        },
        {
          title: "Museums",
          href: "/category/museums",
          kind: "term",
          context: "Category",
          snippetHtml: "",
        },
      ],
    });
    vi.stubGlobal("fetch", fetch);
    const m = mount();
    m.header.dispatchEvent(new dom.FocusEvent("focusin", { bubbles: true }));
    expect(m.dialog.open).toBe(true);
    expect(m.input.value).toBe("muse");
    await vi.waitFor(() => expect(all(m.list, "[role=option]")).toHaveLength(3));
    expect(fetch.mock.calls[0]?.[0]).toBe("/search.json?q=muse");
    const labels = all(m.list, ".ch-search-group__label").map((l) => l.textContent);
    expect(labels).toEqual(["Articles", "Topics"]);
    const opts = all(m.list, "[role=option]");
    expect(opts.map((o) => o.getAttribute("href"))).toEqual([
      "/posts/museum",
      "/category/museums",
      "/search?q=muse",
    ]);
    expect(opts[0]?.querySelector(".ch-search-option__snippet")?.innerHTML).toBe(
      "the <mark>museum</mark> &amp; more",
    );
    expect(opts[1]?.querySelector(".ch-search-option__context")?.textContent).toBe("Category");
    expect(opts[2]?.textContent).toBe("See all results for “muse”");
    // the combobox and its active option
    expect(m.input.getAttribute("role")).toBe("combobox");
    expect(m.input.getAttribute("aria-controls")).toBe("ch-search-list");
    expect(m.input.getAttribute("aria-expanded")).toBe("true");
    expect(m.input.getAttribute("aria-activedescendant")).toBe(opts[0]?.id);
    expect(m.status.textContent).toBe("2 results");
    key(m.input, "ArrowDown");
    expect(opts[1]?.getAttribute("aria-selected")).toBe("true");
    expect(m.input.getAttribute("aria-activedescendant")).toBe(opts[1]?.id);
    key(m.input, "ArrowUp");
    key(m.input, "ArrowUp");
    expect(opts[2]?.getAttribute("aria-selected")).toBe("true"); // wraps
    // Escape closes at once (a search field would clear itself first); focus goes back to the
    // header field, which does not open the modal again
    key(m.input, "Escape");
    expect(m.dialog.open).toBe(false);
    expect((document as unknown as { activeElement: El }).activeElement.id).toBe("h");
    // the focus coming back right after closing does not reopen it; ⌘K does
    m.header.dispatchEvent(new dom.FocusEvent("focusin", { bubbles: true }));
    expect(m.dialog.open).toBe(false);
    document.body.dispatchEvent(
      new dom.KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }),
    );
    expect(m.dialog.open).toBe(true);
    (m.dialog.querySelector("[data-ch-search-close]") as El).click();
    expect(m.dialog.open).toBe(false);
  });

  it("shows the last searches before typing, and clears them", async () => {
    localStorage.setItem("ch_search_recent", JSON.stringify(["museum", "ankara", 7]));
    vi.stubGlobal("fetch", answer({}));
    const m = mount();
    m.header.value = "";
    m.header.dispatchEvent(new dom.FocusEvent("focusin", { bubbles: true }));
    const opts = all(m.list, "[role=option]");
    expect(opts.map((o) => o.textContent)).toEqual(["museum", "ankara"]);
    expect(m.list.querySelector(".ch-search-group__label")?.textContent).toBe("Recent searches");
    (m.note.querySelector("button") as El).click();
    expect(localStorage.getItem("ch_search_recent")).toBeNull();
    expect(all(m.list, "[role=option]")).toHaveLength(0);
  });

  it("says when nothing matches, and when the reader must wait", async () => {
    vi.stubGlobal("fetch", answer({ query: "zz", total: 0 }));
    const m = mount();
    m.header.value = "zz";
    m.header.dispatchEvent(new dom.FocusEvent("focusin", { bubbles: true }));
    await vi.waitFor(() => expect(m.note.textContent).toBe("Nothing matches “zz”."));
    expect(m.input.getAttribute("aria-expanded")).toBe("false");
    vi.stubGlobal("fetch", answer({ status: 429 }));
    m.input.value = "zzz";
    m.input.dispatchEvent(new dom.Event("input", { bubbles: true }));
    await vi.waitFor(() => expect(m.note.textContent).toContain("Too many searches right now."));
    expect(m.note.querySelector("a")?.getAttribute("href")).toBe("/search?q=zzz");
  });

  it("pins its code to its versioned name, stays small and keeps its guards", () => {
    // Bump `search.<n>.js` with any change to the code (`/_cloudhal/*` is cached as immutable).
    expect(createHash("sha256").update(SEARCH_SCRIPT.code).digest("hex").slice(0, 12)).toBe(
      "4629ab435f22",
    );
    expect(SEARCH_SCRIPT.path).toBe("/_cloudhal/search.1.js");
    expect(gzipSync(SEARCH_SCRIPT.code).length).toBeLessThan(3 * 1024);
    expect(SEARCH_SCRIPT.code).not.toMatch(/\beval\b|new Function/);
    // innerHTML only for the snippet the server escaped (`snippetHtml`)
    expect(SEARCH_SCRIPT.code.match(/innerHTML/g)).toHaveLength(1);
    expect(SEARCH_SCRIPT.code).toContain("s.innerHTML=h.snippetHtml");
    // the last searches stay in this browser, and failures to store them are harmless
    expect(SEARCH_SCRIPT.code).toContain("try{localStorage.setItem");
  });
});
