/**
 * RFC-0043 §1: the status pages as a pure function — every state's status, headers and
 * `noindex`; the locale order and the catalog match (RTL included); the 8 KB and CSP budgets
 * in every language; the owner's message escaped and never linked; the theme tokens typed; the
 * machine variant; and the theme hook with each of its fallbacks.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Site } from "@cloudhal/core-contracts";
import { describe, expect, it } from "vitest";
import {
  renderStatus,
  resetHookFailures,
  type StatusContext,
  type StatusPageHook,
  themeStatusHook,
} from "../src/status-hook.ts";
import { contrastRatio } from "../src/status-html.ts";
import {
  catalogLocale,
  fillMessage,
  HOOK_HTML_LIMIT,
  SITE_STATES,
  type SiteState,
  STATUS_CSP,
  STATUS_PAGE_LIMIT,
  statusDirection,
  statusPage,
  statusPageHtml,
  statusPlain,
  statusStrings,
} from "../src/status-page.ts";
import {
  isStatusPagePath,
  statusInput,
  statusLocale,
  statusTheme,
  trimTrailingSlashes,
} from "../src/status-serve.ts";
import { STATUS_CATALOG } from "../src/status-strings/catalog.ts";
import { en } from "../src/status-strings/en.ts";

const NOW = Date.parse("2026-11-08T10:00:00Z");
const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Studio's locale registry (`apps/studio/src/i18n/locales.ts`), read as text: the catalog must
 * list the same languages with the same direction and `Intl` tag, and the renderer's tsconfig
 * cannot import across the apps/ boundary.
 */
function studioRegistry(): Record<string, { dir: string; intl?: string }> {
  const source = readFileSync(
    path.resolve(here, "../../../apps/studio/src/i18n/locales.ts"),
    "utf8",
  );
  const body = source.slice(source.indexOf("LOCALE_REGISTRY = {"), source.indexOf("} as const"));
  const out: Record<string, { dir: string; intl?: string }> = {};
  for (const m of body.matchAll(
    /^\s+"?([A-Za-z-]+)"?: \{ name: "[^"]*", dir: "(ltr|rtl)"[^}]*?(?:intl: "([^"]+)")?\s*\},?$/gm,
  ))
    out[m[1] as string] = { dir: m[2] as string, ...(m[3] ? { intl: m[3] } : {}) };
  return out;
}
const base = { locale: "en", now: NOW };
const bytes = (s: string) => new TextEncoder().encode(s).length;

describe("statusPage: states, codes and headers (§1.2)", () => {
  const expected: Record<SiteState, { status: number; retry?: string; noindex: boolean }> = {
    "not-published": { status: 503, retry: "3600", noindex: true },
    maintenance: { status: 503, retry: "3600", noindex: false },
    unavailable: { status: 503, retry: "300", noindex: false },
    error: { status: 500, noindex: false },
    "preview-expired": { status: 410, noindex: true },
  };

  for (const state of SITE_STATES) {
    it(`${state}: ${expected[state].status}`, async () => {
      const res = statusPage(state, { ...base, rayId: "ray-1" });
      const e = expected[state];
      expect(res.status).toBe(e.status);
      expect(res.headers.get("retry-after")).toBe(e.retry ?? null);
      expect(res.headers.get("x-robots-tag")).toBe(e.noindex ? "noindex" : null);
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(res.headers.get("cloudflare-cdn-cache-control")).toBe("no-store");
      expect(res.headers.get("x-cloudhal-state")).toBe(state);
      expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
      expect(res.headers.get("content-security-policy")).toBe(STATUS_CSP);
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("referrer-policy")).toBe("no-referrer");
      const html = await res.text();
      expect(html).toMatch(/^<!doctype html>/);
      expect(html).toContain(`data-state="${state}"`);
      expect(html.includes('<meta name="robots" content="noindex">')).toBe(e.noindex);
      // exactly one h1, no scripts, no requests
      expect(html.match(/<h1/g)).toHaveLength(1);
      expect(html).not.toMatch(/<script/i);
      expect(html).not.toMatch(/https?:\/\//);
    });
  }

  it("HEAD gets the headers without a body", async () => {
    const res = statusPage("not-published", base, { method: "HEAD" });
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("3600");
    expect(await res.text()).toBe("");
  });

  it("maintenance: Retry-After counts to the end, at least 60 s, 3600 without an end", () => {
    const until = (seconds: number) => ({
      at: new Date(NOW + seconds * 1000).toISOString(),
    });
    const retry = (u?: { at: string }) =>
      statusPage("maintenance", { ...base, until: u }).headers.get("retry-after");
    expect(retry(until(600))).toBe("600");
    expect(retry(until(10))).toBe("60");
    expect(retry(until(-100))).toBe("60");
    expect(retry()).toBe("3600");
    expect(retry({ at: "not a date" })).toBe("3600");
  });

  it("error shows only the reference id", async () => {
    const html = await statusPage("error", {
      ...base,
      rayId: "8f1c<script>",
      site: { name: "Edge" },
    }).text();
    expect(html).toContain("Reference: 8f1c&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("Edge");
  });

  it("the coming-soon wording and the owner's message, escaped and never linked", async () => {
    const html = await statusPage("maintenance", {
      ...base,
      page: "coming-soon",
      site: { name: "Launch <Co>" },
      message: {
        text: "Back on Monday.\nSee https://example.com <b>now</b> & 'then'",
        locale: "en",
      },
    }).text();
    expect(html).toContain(en.comingSoon.title);
    expect(html).toContain("Launch &lt;Co&gt;");
    expect(html).toContain("Back on Monday.<br>See https://example.com &lt;b&gt;now&lt;/b&gt;");
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("<b>");
  });

  it("a message in another language gets its own lang and dir", async () => {
    const html = await statusPage("maintenance", {
      ...base,
      locale: "en",
      message: { text: "سنعود قريبًا", locale: "ar" },
    }).text();
    expect(html).toContain('<html lang="en" dir="ltr">');
    expect(html).toContain('class="ch-status__message" lang="ar" dir="rtl"');
  });

  it("formats the end time in the site's zone, with Western digits for Arabic", () => {
    const until = { at: "2026-11-02T08:00:00Z", timeZone: "Europe/Istanbul" };
    const s = statusStrings("maintenance", { ...base, locale: "en", until });
    expect(s.untilText).toMatch(/^Back by .*11:00/);
    const ar = statusStrings("maintenance", { ...base, locale: "ar", until });
    expect(ar.untilText).toMatch(/11:00/);
    expect(ar.untilText).not.toMatch(/[٠-٩]/);
    const bad = statusStrings("maintenance", {
      ...base,
      until: { at: until.at, timeZone: "Mars/Olympus" },
    });
    expect(bad.untilText).toMatch(/08:00/);
  });

  it("never throws on a broken input", async () => {
    const res = statusPage("maintenance", {
      locale: undefined as unknown as string,
      now: Number.NaN,
      message: { text: 1 as unknown as string, locale: "en" },
      until: { at: "x" },
    });
    expect(res.status).toBe(503);
    expect(await res.text()).toContain('data-state="maintenance"');
  });
});

describe("language and direction (§1.4, §1.5)", () => {
  it("matches the catalog exactly, then by language, then English", () => {
    expect(catalogLocale("tr")).toBe("tr");
    expect(catalogLocale("pt-PT")).toBe("pt-BR");
    expect(catalogLocale("zh-HK")).toBe("zh-Hans");
    expect(catalogLocale("de-AT")).toBe("de");
    expect(catalogLocale("xx")).toBe("en");
  });

  it("sets lang and dir from the catalog; RTL by script for unlisted locales", async () => {
    for (const locale of ["ar", "fa", "he"]) {
      expect(statusDirection(locale)).toBe("rtl");
      const html = await statusPage("not-published", { ...base, locale }).text();
      expect(html).toContain(`<html lang="${locale}" dir="rtl">`);
      expect(html).toContain(STATUS_CATALOG[locale]?.messages.notPublished.title);
    }
    expect(statusDirection("ur")).toBe("rtl");
    expect(statusDirection("ku-Latn")).toBe("ltr");
    expect(statusDirection("tr")).toBe("ltr");
    expect(await statusPage("not-published", { ...base, locale: "tr" }).text()).toContain(
      'lang="tr"',
    );
  });

  it("carries every registered Studio language with its direction and Intl tag", () => {
    const registry = studioRegistry();
    expect(Object.keys(registry).length).toBeGreaterThan(10);
    expect(Object.keys(STATUS_CATALOG).sort()).toEqual(Object.keys(registry).sort());
    for (const [locale, info] of Object.entries(registry)) {
      expect(STATUS_CATALOG[locale]?.dir, locale).toBe(info.dir);
      expect(STATUS_CATALOG[locale]?.intl, locale).toBe(info.intl);
    }
  });

  it("uses simple ICU arguments only, the same in every language", () => {
    const flat = (o: object, prefix = ""): [string, string][] =>
      Object.entries(o).flatMap(([k, v]) =>
        typeof v === "string" ? [[`${prefix}${k}`, v]] : flat(v as object, `${prefix}${k}.`),
      );
    const args = (m: string) => [...m.matchAll(/\{([^}]*)\}/g)].map((x) => x[1]).sort();
    const english = new Map(flat(en));
    for (const [locale, entry] of Object.entries(STATUS_CATALOG)) {
      const messages = new Map(flat(entry.messages));
      expect([...messages.keys()].sort(), locale).toEqual([...english.keys()].sort());
      for (const [key, value] of messages) {
        expect(value, `${locale} ${key}`).not.toMatch(
          /\{[^}]*,\s*(plural|select|selectordinal|number)/,
        );
        expect(args(value), `${locale} ${key}`).toEqual(args(english.get(key) as string));
      }
    }
    expect(fillMessage("Back by {time}", { time: "noon" })).toBe("Back by noon");
    expect(fillMessage("{a} {b}", { a: "x" })).toBe("x {b}");
  });

  it("chooses the request's locale from the host or path prefix, else the default (§1.4)", () => {
    const site = {
      locales: ["en", "tr", "de"],
      defaultLocale: "en",
      localization: { domains: { de: "de.example" } },
    };
    expect(statusLocale(site, "example.com", "/")).toBe("en");
    expect(statusLocale(site, "example.com", "/tr/about/")).toBe("tr");
    expect(statusLocale(site, "de.example", "/")).toBe("de");
    expect(statusLocale(site, "example.com", "/fr/")).toBe("en");
    expect(statusLocale({ locales: ["tr"], defaultLocale: "tr" }, "x", "/")).toBe("tr");
  });

  it("trims trailing slashes in linear time, however many there are", () => {
    expect(trimTrailingSlashes("/")).toBe("/");
    expect(trimTrailingSlashes("///")).toBe("/");
    expect(trimTrailingSlashes("/tr/about/")).toBe("/tr/about");
    expect(trimTrailingSlashes("/tr/about")).toBe("/tr/about");
    const long = `/tr${"/".repeat(200_000)}`;
    const started = performance.now();
    expect(trimTrailingSlashes(long)).toBe("/tr");
    expect(statusLocale({ locales: ["en", "tr"], defaultLocale: "en" }, "x", long)).toBe("tr");
    expect(performance.now() - started).toBeLessThan(500);
  });
});

describe("budget, CSP and site data (§1.3, §1.6)", () => {
  it("stays under 8 KB in every state and language, with the longest message", () => {
    const message = { text: "x".repeat(280), locale: "en" };
    const until = { at: "2026-11-02T08:00:00Z", timeZone: "Europe/Istanbul" };
    for (const locale of Object.keys(STATUS_CATALOG))
      for (const state of SITE_STATES) {
        const html = statusPageHtml(state, {
          ...base,
          locale,
          site: {
            name: "A site with a fairly long name for the budget",
            logo: "/media/ab/logo.png",
          },
          message,
          until,
          rayId: "8f1c2d3e4a5b6c7d",
          theme: { brand: "#123456", surface: "#ffffff", text: "#111111", font: "serif" },
        });
        expect(bytes(html), `${state} ${locale}`).toBeLessThanOrEqual(STATUS_PAGE_LIMIT);
      }
  });

  it("uses logical properties only (ADR-0033)", () => {
    const html = statusPageHtml("maintenance", { ...base, message: { text: "hi", locale: "en" } });
    const css = html.match(/<style>([\s\S]*)<\/style>/)?.[1] ?? "";
    expect(css).not.toMatch(
      /(?:margin|padding|border)-(?:left|right)|(?<![-\w])(?:left|right)\s*:/,
    );
    expect(css).toContain("padding-inline");
  });

  it("shows the name and a same-origin logo only where the state allows (§1.6)", async () => {
    const site = { name: "Edge", logo: "/media/ab12/logo.png" };
    expect(await statusPage("not-published", { ...base, site }).text()).not.toContain("/media/");
    expect(await statusPage("not-published", { ...base, site }).text()).toContain("Edge");
    expect(await statusPage("preview-expired", { ...base, site }).text()).toContain(
      'src="/media/ab12/logo.png"',
    );
    expect(await statusPage("unavailable", { ...base, site }).text()).not.toContain("Edge");
    const external = { name: "Edge", logo: "https://cdn.example/logo.png" };
    expect(await statusPage("maintenance", { ...base, site: external }).text()).not.toContain(
      "cdn.example",
    );
  });

  it("applies typed theme tokens on maintenance and preview-expired only, when they contrast", async () => {
    const theme = { brand: "#123456", surface: "#ffffff", text: "#111111", font: "serif" as const };
    const html = await statusPage("maintenance", { ...base, theme }).text();
    expect(html).toContain("--ch-status-brand:#123456");
    expect(html).toContain("--ch-status-surface:#ffffff;--ch-status-text:#111111");
    expect(html).toContain("--ch-status-font:ui-serif");
    expect(await statusPage("not-published", { ...base, theme }).text()).not.toContain("#123456");
    // a pair that does not contrast is dropped, never "fixed"; a bad value never reaches CSS
    const low = await statusPage("maintenance", {
      ...base,
      theme: { brand: "red;}body{display:none", surface: "#ffffff", text: "#eeeeee" },
    }).text();
    expect(low).not.toContain("display:none");
    expect(low).not.toContain("--ch-status-surface:#ffffff");
    expect(contrastRatio("#ffffff", "#111111")).toBeGreaterThan(15);
  });

  it("reads the tokens and the logo from a published site node (§1.3)", () => {
    const site = {
      theme: {
        name: "blog",
        config: { brand: "#2563EB", surface: "#fff", typePairing: "classic" },
      },
      brand: { logo: { src: "/media/ab12/logo.png", alt: "" } },
    } as unknown as Site;
    expect(statusTheme(site)).toEqual({
      brand: "#2563eb",
      surface: undefined,
      text: undefined,
      font: "serif",
    });
    expect(statusTheme({ theme: { name: "blog" } } as Site)).toBeUndefined();
    const live = { ...site, name: "Live", locales: ["en"], defaultLocale: "en" } as Site;
    const published = { ...live, name: "Published" } as Site;
    const req = { host: "example.com", pathname: "/" };
    expect(statusInput("not-published", { live }, req, NOW)).toEqual({
      locale: "en",
      now: NOW,
      site: { name: "Live" },
    });
    expect(statusInput("preview-expired", { live, published }, req, NOW)).toMatchObject({
      site: { name: "Published", logo: "/media/ab12/logo.png" },
      theme: { brand: "#2563eb", font: "serif" },
    });
    expect(statusInput("unavailable", {}, req, NOW)).toEqual({ locale: "en", now: NOW });
  });

  it("statusPlain answers machines with the same status and headers", async () => {
    const text = statusPlain("not-published", base, "text");
    expect(text.status).toBe(503);
    expect(text.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(text.headers.get("retry-after")).toBe("3600");
    expect(text.headers.get("cache-control")).toBe("no-store");
    expect(text.headers.has("content-security-policy")).toBe(false);
    expect(await text.text()).toBe(`${en.notPublished.title}. ${en.notPublished.body}\n`);
    const json = statusPlain("maintenance", base, "json");
    expect(await json.json()).toEqual({
      error: "maintenance",
      message: `${en.maintenance.title}. ${en.maintenance.body}`,
    });
  });

  it("knows which paths get a page (§2.3)", () => {
    for (const p of ["/", "/about", "/tr/hakkinda", "/search", "/posts/hello-world"])
      expect(isStatusPagePath(p), p).toBe(true);
    for (const p of [
      "/robots.txt",
      "/rss.xml",
      "/sitemap.xml",
      "/llms.txt",
      "/search.json",
      "/site.webmanifest",
      "/media/0123456789abcdef/x.png",
      "/_astro/x.css",
      "/_cloudhal/p.js",
      "/__cloudhal/comments",
      "/.well-known/security.txt",
    ])
      expect(isStatusPagePath(p), p).toBe(false);
  });
});

describe("theme hook (§1.7)", () => {
  const input = { ...base, site: { name: "Edge" } };
  const seen: string[] = [];
  const log = (m: string) => seen.push(m);

  it("a theme's document replaces the body; the renderer keeps status, headers and the site CSP", async () => {
    const hook: StatusPageHook = (state, ctx) => {
      expect(state).toBe("not-published");
      expect(ctx.status).toBe(503);
      expect(ctx.strings.title).toBe(en.notPublished.title);
      return `<!doctype html><html><body><p>${ctx.strings.title} / ${ctx.site?.name}</p></body></html>`;
    };
    const res = await renderStatus("not-published", input, { hook, csp: "default-src 'self'" });
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("3600");
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("content-security-policy")).toBe("default-src 'self'");
    expect(await res.text()).toBe(
      "<!doctype html><html><body><p>Coming soon / Edge</p></body></html>",
    );
  });

  it("defaultHtml restyles the built-in page; messageHtml and untilText are ready to use", async () => {
    let ctx: StatusContext | undefined;
    const hook: StatusPageHook = (_s, c) => {
      ctx = c;
      return c.defaultHtml({ css: "body{--hooked:1}" });
    };
    const html = await (
      await renderStatus(
        "maintenance",
        {
          ...input,
          message: { text: "a <b>\nc", locale: "en" },
          until: { at: "2026-11-02T08:00:00Z" },
        },
        { hook },
      )
    ).text();
    expect(html).toContain("body{--hooked:1}");
    expect(ctx?.messageHtml).toBe("a &lt;b&gt;<br>c");
    expect(ctx?.untilText).toMatch(/^Back by /);
    expect(ctx?.dir).toBe("ltr");
  });

  it("falls back to the built-in page on undefined, a throw, a non-string, > 64 KB or > 50 ms, logged once per state", async () => {
    resetHookFailures();
    seen.length = 0;
    const cases: [string, StatusPageHook][] = [
      ["undefined", () => undefined],
      [
        "throw",
        () => {
          throw new Error("boom");
        },
      ],
      ["non-string", () => 42 as unknown as string],
      ["too large", () => "x".repeat(HOOK_HTML_LIMIT + 1)],
      ["too slow", () => new Promise((r) => setTimeout(() => r("<p>late</p>"), 40))],
    ];
    for (const [name, hook] of cases) {
      const res = await renderStatus("not-published", input, {
        hook,
        onFailure: log,
        timeoutMs: 10,
      });
      const html = await res.text();
      expect(html, name).toContain('data-state="not-published"');
      expect(res.headers.get("content-security-policy"), name).toBe(STATUS_CSP);
    }
    // four failures (undefined is not one), logged once for the state
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain("not-published");
    const other = await renderStatus("maintenance", input, {
      hook: () => {
        throw new Error("boom");
      },
      onFailure: log,
    });
    expect(await other.text()).toContain('data-state="maintenance"');
    expect(seen).toHaveLength(2);
  });

  it("never runs for error", async () => {
    let called = false;
    const hook: StatusPageHook = () => {
      called = true;
      return "<p>themed</p>";
    };
    const res = await renderStatus("error", { ...input, rayId: "r" }, { hook });
    expect(called).toBe(false);
    expect(await res.text()).toContain("Reference: r");
  });

  it("loads the theme module lazily and tolerates a theme without the export or that fails to load", async () => {
    let loads = 0;
    const withHook = themeStatusHook(async () => {
      loads++;
      return { statusPage: () => "<p>t</p>" };
    });
    expect(typeof (await withHook())).toBe("function");
    await withHook();
    expect(loads).toBe(1);
    expect(await themeStatusHook(async () => ({ components: {} }))()).toBeUndefined();
    const errors: string[] = [];
    expect(
      await themeStatusHook(
        async () => {
          throw new Error("no theme");
        },
        (m) => errors.push(m),
      )(),
    ).toBeUndefined();
    expect(errors).toHaveLength(1);
  });
});
