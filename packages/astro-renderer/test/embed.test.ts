/**
 * RFC-0015 §4: the click-to-load video player. The link card loads nothing from the video host;
 * the first-party module swaps it for the player's iframe when followed, and the CSP allows the
 * two player hosts only where a page (or a static build) shows one.
 */
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderComponentSection } from "../src/blocks.ts";
import { SITE_CSP, turnstileCsp } from "../src/csp.ts";
import { EMBED_SCRIPT, embedPlayerSrc, usesEmbeds, withEmbedFrames } from "../src/embed-client.ts";
import { renderMarkdown } from "../src/markdown.ts";
import {
  buildShowsEmbeds,
  writeEmbedClient,
  writeStaticSecurityHeaders,
} from "../src/static-headers.ts";

describe("player addresses", () => {
  it("knows YouTube and Vimeo pages, and nothing else", () => {
    const yt = "https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ";
    expect(embedPlayerSrc("https://www.youtube.com/watch?v=aqz-KE-bpKQ&t=10")).toBe(yt);
    expect(embedPlayerSrc("https://youtu.be/aqz-KE-bpKQ")).toBe(yt);
    expect(embedPlayerSrc("https://m.youtube.com/shorts/aqz-KE-bpKQ")).toBe(yt);
    expect(embedPlayerSrc("https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ")).toBe(yt);
    expect(embedPlayerSrc("https://vimeo.com/76979871")).toBe(
      "https://player.vimeo.com/video/76979871?dnt=1",
    );
    expect(embedPlayerSrc("https://player.vimeo.com/video/76979871")).toBe(
      "https://player.vimeo.com/video/76979871?dnt=1",
    );
    for (const bad of [
      "https://www.youtube.com/watch?v=short",
      "https://evil.example/watch?v=aqz-KE-bpKQ",
      "https://vimeo.com/about",
      "javascript:alert(1)",
      "not a url",
    ])
      expect(embedPlayerSrc(bad), bad).toBeUndefined();
  });

  it("marks the card and loads the module, but never an iframe up front", () => {
    const html = renderComponentSection({
      id: "sec_embed000001",
      kind: "component",
      type: "embed",
      props: { url: "https://youtu.be/aqz-KE-bpKQ", title: 'Big "Buck" Bunny' },
    });
    expect(html).toContain('data-embed-src="https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ"');
    expect(html).toContain('data-embed-title="Big &quot;Buck&quot; Bunny"');
    expect(html).toContain(`<script type="module" src="${EMBED_SCRIPT.path}"></script>`);
    expect(html).not.toContain("<iframe");
    expect(renderMarkdown('::embed{url="https://vimeo.com/76979871" title="A"}')).toContain(
      'data-embed-src="https://player.vimeo.com/video/76979871?dnt=1"',
    );
  });
});

describe("the player module", () => {
  // The file is cached as immutable under its name: a change to the code needs a new name.
  it("keeps its name with its code", () => {
    // Changed the code? Bump the version in the path (`embed.<n>.js`), then this hash.
    expect(EMBED_SCRIPT.path).toBe("/_cloudhal/embed.1.js");
    expect(createHash("sha256").update(EMBED_SCRIPT.code).digest("hex")).toBe(
      "4e16f1f898ef20d622100e458afae576d88a9d5b2f55fab4b4257aff92a7c878",
    );
  });

  /** Runs the module against a tiny DOM: one card, one click. */
  function click(src: string, init: Partial<{ button: number; metaKey: boolean }> = {}) {
    let listener: ((e: unknown) => void) | undefined;
    const replaced: Record<string, unknown>[] = [];
    class FakeElement {}
    const fig = { getAttribute: (n: string) => (n === "data-embed-src" ? src : "Bunny") };
    const link = Object.assign(new FakeElement(), {
      closest: (sel: string) => (sel.startsWith("figure") ? fig : null),
      replaceWith: (el: Record<string, unknown>) => replaced.push(el),
    });
    const target = Object.assign(new FakeElement(), { closest: () => link });
    const doc = {
      addEventListener: (_: string, fn: (e: unknown) => void) => {
        listener = fn;
      },
      createElement: () => ({ focus() {} }),
    };
    new Function("document", "Element", EMBED_SCRIPT.code)(doc, FakeElement);
    let prevented = false;
    listener?.({
      target,
      button: 0,
      defaultPrevented: false,
      preventDefault: () => {
        prevented = true;
      },
      ...init,
    });
    return { prevented, frame: replaced[0] };
  }

  it("swaps the card for the player on a plain click", () => {
    const { prevented, frame } = click("https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ");
    expect(prevented).toBe(true);
    expect(frame).toMatchObject({
      src: "https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ?autoplay=1",
      title: "Bunny",
      className: "ch-embed__frame",
      referrerPolicy: "strict-origin-when-cross-origin",
    });
    expect(click("https://player.vimeo.com/video/1?dnt=1").frame?.src).toBe(
      "https://player.vimeo.com/video/1?dnt=1&autoplay=1",
    );
  });

  it("leaves the link alone for other hosts and modified clicks", () => {
    expect(click("https://evil.example/embed/x").prevented).toBe(false);
    expect(
      click("https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ", { metaKey: true }).prevented,
    ).toBe(false);
  });
});

describe("the CSP", () => {
  it("allows the two player hosts in frames, with or without Turnstile", () => {
    expect(withEmbedFrames(SITE_CSP)).toContain(
      "frame-src https://www.youtube-nocookie.com https://player.vimeo.com; object-src 'none'",
    );
    expect(withEmbedFrames(turnstileCsp())).toContain(
      "frame-src https://challenges.cloudflare.com https://www.youtube-nocookie.com https://player.vimeo.com;",
    );
    expect(withEmbedFrames(withEmbedFrames(SITE_CSP))).toBe(withEmbedFrames(SITE_CSP));
  });

  it("is widened by pages that may show a player", () => {
    expect(usesEmbeds({ markdown: 'Hi.\n\n::embed{url="https://youtu.be/x"}' })).toBe(true);
    expect(usesEmbeds({ markdown: ":::callout\n::embed{}\n:::" })).toBe(true);
    expect(usesEmbeds({ markdown: "Write ::embed in a sentence." })).toBe(false);
    expect(usesEmbeds({ sections: [{ kind: "component", type: "embed" }] })).toBe(true);
    expect(usesEmbeds({ sections: [{ kind: "hero" }] })).toBe(false);
  });

  it("in static builds, only when the build shows a player", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cloudhal-embeds-"));
    try {
      await mkdir(join(dir, "posts"));
      await writeFile(join(dir, "index.html"), "<p>Home</p>");
      expect(await buildShowsEmbeds(dir)).toBe(false);
      await writeFile(
        join(dir, "posts", "video.html"),
        '<figure data-embed-src="https://x"></figure>',
      );
      expect(await buildShowsEmbeds(dir)).toBe(true);
      await writeEmbedClient(dir);
      expect(await readFile(join(dir, "_cloudhal", "embed.1.js"), "utf8")).toBe(EMBED_SCRIPT.code);
      await writeStaticSecurityHeaders(dir, { embeds: true });
      expect(await readFile(join(dir, "_headers"), "utf8")).toContain(
        `Content-Security-Policy: ${withEmbedFrames(SITE_CSP)}`,
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
