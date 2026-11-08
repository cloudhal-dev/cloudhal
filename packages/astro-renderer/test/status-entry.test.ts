/**
 * RFC-0043 §1.2, §1.6, §1.8, §2.5 and decision 12 on the Site Worker entry's status step (#167):
 * a 5xx the renderer or theme answers on purpose is never turned into the `error` page; a store
 * that cannot be read before rendering answers `unavailable`; the `error` page uses the site's
 * locale and name once the request has read it; an invalid preview token on a machine path
 * never serves the published content, and no answer says why the token failed.
 */
import type { Site } from "@cloudhal/core-contracts";
import { describe, expect, it, vi } from "vitest";
import type { SiteStateResult } from "../src/runtime-workerd.ts";
import { errorPage, type StatusState, statusStep, withErrorPage } from "../src/status-entry.ts";
import { statusPage, statusPlain } from "../src/status-page.ts";
import { markInvalidPreview, statusPathKind } from "../src/status-serve.ts";
import { en } from "../src/status-strings/en.ts";
import { messages as tr } from "../src/status-strings/tr.ts";

const NOW = Date.parse("2026-11-08T10:00:00Z");
const site = {
  id: "site_status01",
  name: "Kahve <Evi>",
  locales: ["tr", "en"],
  defaultLocale: "tr",
  theme: { name: "blog", config: { brand: "#7c3aed" } },
  brand: { logo: { src: "/media/ab12/logo.png", alt: "" } },
} as unknown as Site;

const request = (path: string, init?: RequestInit) =>
  new Request(`https://kahve.example${path}`, { headers: { "cf-ray": "8f00ray" }, ...init });

const html = (status: number, headers: Record<string, string> = {}) =>
  new Response("<!doctype html><p>theme</p>", {
    status,
    headers: { "content-type": "text/html; charset=utf-8", ...headers },
  });

describe("withErrorPage (§1.8)", () => {
  it("passes the starter's not-published 503 through, with no error log", async () => {
    const log = vi.fn();
    const starter = statusPage("not-published", { locale: "en", now: NOW, site: { name: "S" } });
    const out = withErrorPage(starter, request("/", { method: "POST" }), { log });
    expect(out).toBe(starter);
    expect(out.status).toBe(503);
    expect(out.headers.get("x-cloudhal-state")).toBe("not-published");
    expect(out.headers.get("retry-after")).toBe("3600");
    expect(await out.text()).toContain(en.notPublished.title);
    expect(log).not.toHaveBeenCalled();
  });

  it("passes a theme's own 5xx and its themed 500 through", () => {
    const log = vi.fn();
    for (const res of [
      html(503),
      html(502),
      html(500, { "x-cloudhal-error-page": "theme" }),
      new Response("down", { status: 500, headers: { "content-type": "text/plain" } }),
    ])
      expect(withErrorPage(res, request("/"), { log })).toBe(res);
    expect(log).not.toHaveBeenCalled();
  });

  it("turns Astro's own 500 page into the error page, logged with the reference", async () => {
    const log = vi.fn();
    const out = withErrorPage(html(500), request("/about"), { log });
    expect(out.status).toBe(500);
    expect(out.headers.get("x-cloudhal-state")).toBe("error");
    expect(out.headers.get("cache-control")).toBe("no-store");
    expect(await out.text()).toContain("8f00ray");
    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0]?.[0]).toContain("reference 8f00ray");
  });
});

describe("errorPage (§1.4, §1.6)", () => {
  it("uses the site's locale and name when the request already read the site", async () => {
    const out = errorPage(request("/"), new Error("boom"), { site, log: () => {}, now: NOW });
    const body = await out.text();
    expect(out.status).toBe(500);
    expect(body).toContain('lang="tr"');
    expect(body).toContain(tr.error.title);
    expect(body).toContain("Kahve &lt;Evi&gt;");
    // name only: no logo, no theme tokens, no error text
    expect(body).not.toContain("/media/ab12/logo.png");
    expect(body).not.toContain("#7c3aed");
    expect(body).not.toContain("boom");
  });

  it("follows the request's path prefix to another site locale", async () => {
    const body = await errorPage(request("/en/about"), new Error("x"), {
      site,
      log: () => {},
    }).text();
    expect(body).toContain(en.error.title);
    expect(body).toContain("Kahve &lt;Evi&gt;");
  });

  it("is English and nameless before the site is known", async () => {
    const body = await errorPage(request("/"), new Error("x"), { log: () => {} }).text();
    expect(body).toContain('lang="en"');
    expect(body).toContain(en.error.title);
    expect(body).not.toContain("Kahve");
  });
});

describe("statusStep (§2.5)", () => {
  const drawn = (state: StatusState) =>
    Promise.resolve(new Response(`page:${state.kind}`, { status: 299 }));
  const step = (path: string, state: () => Promise<SiteStateResult>, init?: RequestInit) =>
    statusStep(request(path, init), { state, page: drawn, log: () => {}, now: () => NOW });

  it("a store read failure is unavailable: 503 with Retry-After 300, logged", async () => {
    const log = vi.fn();
    const page = vi.fn((state: StatusState) =>
      Promise.resolve(statusPage(state.kind, { locale: "en", now: NOW })),
    );
    const failing = () => Promise.reject(new Error("D1_ERROR: network lost"));
    const out = await statusStep(request("/"), { state: failing, page, log });
    expect(page).toHaveBeenCalledWith({ kind: "unavailable" });
    expect(out?.status).toBe(503);
    expect(out?.headers.get("retry-after")).toBe("300");
    expect(out?.headers.get("x-cloudhal-state")).toBe("unavailable");
    expect(log).toHaveBeenCalledOnce();
    // machine paths say the same in plain text
    const feed = await step("/rss.xml", failing);
    expect(feed?.status).toBe(503);
    expect(feed?.headers.get("retry-after")).toBe("300");
    expect(feed?.headers.get("content-type")).toContain("text/plain");
    expect(await feed?.text()).not.toContain("D1_ERROR");
  });

  it("an invalid preview token on a machine path answers 410, never the published content", async () => {
    const expired = () =>
      Promise.resolve<SiteStateResult>({ kind: "preview-expired", site, published: site });
    for (const path of ["/rss.xml", "/sitemap.xml", "/llms.txt", "/feed.atom"]) {
      const out = await step(`${path}?cloudhal-preview=forged`, expired);
      expect(out?.status, path).toBe(410);
      expect(out?.headers.get("x-cloudhal-state")).toBe("preview-expired");
      expect(out?.headers.get("x-robots-tag")).toBe("noindex");
      expect(out?.headers.get("cache-control")).toBe("no-store");
      expect(out?.headers.get("content-type")).toContain("text/plain");
      expect(out?.headers.has("x-cloudhal-preview-error")).toBe(false);
      // in the site's language, and with nothing about why the token failed
      expect(await out?.text()).toBe(`${tr.previewExpired.title}. ${tr.previewExpired.body}\n`);
    }
    const json = await step("/search.json?q=a&cloudhal-preview=forged", expired);
    expect(json?.status).toBe(410);
    expect(await json?.json()).toEqual({
      error: "preview-expired",
      message: `${tr.previewExpired.title}. ${tr.previewExpired.body}`,
    });
    const head = await step("/rss.xml?cloudhal-preview=x", expired, { method: "HEAD" });
    expect(head?.status).toBe(410);
    expect(await head?.text()).toBe("");
  });

  it("page paths get the drawn page; serve, other methods and own answers pass", async () => {
    const expired = () => Promise.resolve<SiteStateResult>({ kind: "preview-expired", site });
    expect(await (await step("/about?cloudhal-preview=x", expired))?.text()).toBe(
      "page:preview-expired",
    );
    const serve = () => Promise.resolve<SiteStateResult>({ kind: "serve" });
    expect(await step("/rss.xml", serve)).toBeUndefined();
    expect(await step("/", serve)).toBeUndefined();
    // before the first publish a machine path keeps the theme's own statusPlain
    const unpublished = () => Promise.resolve<SiteStateResult>({ kind: "not-published", site });
    expect(await step("/rss.xml", unpublished)).toBeUndefined();
    const state = vi.fn(expired);
    expect(await step("/", state, { method: "POST" })).toBeUndefined();
    for (const own of ["/robots.txt", "/media/0123456789abcdef/a.png", "/.well-known/security.txt"])
      expect(await step(`${own}?cloudhal-preview=x`, state)).toBeUndefined();
    expect(state).not.toHaveBeenCalled();
  });

  it("classifies paths as the state step reads them", () => {
    expect(statusPathKind("/")).toBe("page");
    expect(statusPathKind("/posts/hello")).toBe("page");
    expect(statusPathKind("/rss.xml")).toBe("machine");
    expect(statusPathKind("/manifest.webmanifest")).toBe("machine");
    expect(statusPathKind("/robots.txt")).toBeUndefined();
    expect(statusPathKind("/_astro/a.css")).toBeUndefined();
    expect(statusPathKind("/__cloudhal/health")).toBeUndefined();
  });
});

describe("markInvalidPreview (decision 12)", () => {
  it("keeps the response out of the edge cache and never says why the token failed", () => {
    const headers = new Headers({ "cloudflare-cdn-cache-control": "public, max-age=3600" });
    markInvalidPreview(headers);
    expect(headers.get("cloudflare-cdn-cache-control")).toBe("no-store");
    expect(headers.get("x-cloudhal-preview-error")).toBe("invalid");
  });

  it("statusPlain bodies are the same for every failure", async () => {
    const a = await statusPlain("preview-expired", { locale: "en", now: NOW }, "text").text();
    expect(a).not.toMatch(/signature|expired token|another site|not enabled/i);
  });
});
