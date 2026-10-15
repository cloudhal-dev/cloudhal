// @vitest-environment happy-dom
/**
 * RFC-0020 §6 (phase 20f): Cloudhal's MCP Apps View against a fake host. It initializes before
 * anything else, shows `preview_page`'s HTML, asks for a fresh preview after `patch_draft`, keeps
 * the preview's scripts and frames out, and answers teardown.
 */
import { afterEach, describe, expect, it } from "vitest";
import { PREVIEW_VIEW_HTML } from "../src/preview-view.ts";

/** The happy-dom globals these tests use (the package's types have no DOM lib). */
interface Shadowed {
  shadowRoot: { innerHTML: string; querySelector(s: string): unknown } | null;
}
const dom = globalThis as unknown as {
  document: {
    body: { innerHTML: string };
    getElementById(id: string): (Shadowed & { textContent: string | null; hidden: boolean }) | null;
  };
  window: { addEventListener: unknown; dispatchEvent(e: unknown): boolean };
  MessageEvent: new (type: string, init: { data: unknown; source: unknown }) => unknown;
  ResizeObserver?: unknown;
};

type Message = { jsonrpc: "2.0"; id?: number; method?: string; params?: Record<string, unknown> };

/** Mounts the View with a fake host as its parent; returns what the View sent and a sender. */
function mount() {
  const sent: Message[] = [];
  const host = { postMessage: (m: Message) => sent.push(m) };
  const html = PREVIEW_VIEW_HTML;
  dom.document.body.innerHTML = html.slice(html.indexOf("<body>") + 6, html.indexOf("<script>"));
  dom.ResizeObserver ??= class {
    observe() {}
  };
  const script = html.slice(html.indexOf("<script>") + 8, html.indexOf("</script>"));
  const win = new Proxy(dom.window as object, {
    get: (target, key) => (key === "parent" ? host : Reflect.get(target, key, target)),
  });
  // Our own constant View code, run as a host's sandboxed frame would run it.
  new Function("window", script)(win);
  const fromHost = (data: Message) =>
    dom.window.dispatchEvent(new dom.MessageEvent("message", { data, source: host }));
  const settle = () => new Promise((r) => setTimeout(r, 0));
  return { sent, fromHost, settle };
}

const PREVIEW = `<!doctype html><html><head><style>:root{--fg:#111}main{color:var(--fg)}</style></head><body><header><a href="/">Site</a></header><main><section data-section-id="sec_a"><h1>Built live</h1></section><script>alert(1)</script><iframe src="https://evil.example"></iframe></main></body></html>`;

afterEach(() => {
  dom.document.body.innerHTML = "";
});

describe("MCP Apps View", () => {
  it("initializes first, then shows preview_page's HTML in a shadow root without scripts", async () => {
    const { sent, fromHost, settle } = mount();
    expect(sent[0]).toMatchObject({ method: "ui/initialize", id: 1 });
    expect(sent[0]?.params).toMatchObject({ protocolVersion: "2026-01-26" });
    // The host answers request 1 (a result has no method).
    fromHost({ jsonrpc: "2.0", id: 1 } as Message);
    await settle();
    expect(sent.map((m) => m.method)).toContain("ui/notifications/initialized");

    fromHost({ jsonrpc: "2.0", method: "ui/notifications/tool-input", params: { arguments: {} } });
    fromHost({
      jsonrpc: "2.0",
      method: "ui/notifications/tool-result",
      params: {
        content: [],
        structuredContent: { html: PREVIEW, title: "Home", path: "/", url: null },
      },
    });
    await settle();
    const shadow = dom.document.getElementById("preview")?.shadowRoot;
    expect(shadow?.innerHTML).toContain("Built live");
    expect(shadow?.innerHTML).toContain(":host{--fg:#111}");
    expect(shadow?.innerHTML).not.toContain("<script");
    expect(shadow?.innerHTML).not.toContain("<iframe");
    expect(sent.map((m) => m.method)).toContain("ui/notifications/size-changed");
  });

  it("asks preview_page for the new version after patch_draft, and shows refusals", async () => {
    const { sent, fromHost, settle } = mount();
    fromHost({ jsonrpc: "2.0", id: 1 } as Message);
    await settle();
    fromHost({
      jsonrpc: "2.0",
      method: "ui/notifications/tool-result",
      params: {
        structuredContent: { page: { id: "page_home00001", siteId: "site_abc123", rev: 3 } },
      },
    });
    await settle();
    const call = sent.find((m) => m.method === "tools/call");
    expect(call?.params).toEqual({
      name: "preview_page",
      arguments: { siteId: "site_abc123", pageId: "page_home00001" },
    });
    fromHost({
      jsonrpc: "2.0",
      id: call?.id,
      result: { structuredContent: { html: PREVIEW } },
    } as Message);
    await settle();
    expect(dom.document.getElementById("preview")?.shadowRoot?.innerHTML).toContain("Built live");

    fromHost({
      jsonrpc: "2.0",
      method: "ui/notifications/tool-result",
      params: {
        isError: true,
        content: [{ type: "text", text: "invalid_surface: /sections/1 …" }],
      },
    });
    await settle();
    expect(dom.document.getElementById("status")?.textContent).toContain("invalid_surface");
  });

  it("answers teardown and refuses unknown requests", async () => {
    const { sent, fromHost } = mount();
    fromHost({
      jsonrpc: "2.0",
      id: 7,
      method: "ui/resource-teardown",
      params: { reason: "closed" },
    });
    fromHost({ jsonrpc: "2.0", id: 8, method: "ui/something-else" });
    expect(sent.find((m) => m.id === 7)).toEqual({ jsonrpc: "2.0", id: 7, result: {} });
    expect(sent.find((m) => m.id === 8)).toMatchObject({ error: { code: -32601 } });
  });

  it("ignores messages that do not come from its host", async () => {
    const { sent } = mount();
    dom.window.dispatchEvent(
      new dom.MessageEvent("message", {
        data: { jsonrpc: "2.0", id: 9, method: "ui/resource-teardown" },
        source: {},
      }),
    );
    expect(sent.find((m) => m.id === 9)).toBeUndefined();
  });
});
