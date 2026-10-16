/** RFC-0026: the curated set, its generated data and the inline markup. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ICON_WEIGHTS as GENERATED, iconsData } from "../scripts/gen-icons.ts";
import {
  defineIconSet,
  ICON_GROUPS,
  ICON_NAMES,
  ICON_WEIGHTS,
  IconSetError,
  isIconName,
  renderIcon,
} from "../src/icons.ts";

describe("icons (RFC-0026)", () => {
  it("keeps every weight's generated data in step with the list and the sources", () => {
    expect([...GENERATED]).toEqual([...ICON_WEIGHTS]);
    for (const w of GENERATED)
      expect(
        readFileSync(
          path.join(path.dirname(fileURLToPath(import.meta.url)), `../src/generated/icons-${w}.ts`),
          "utf8",
        ),
      ).toBe(iconsData(w));
  });

  it("names every SocialLink network and groups every name once", () => {
    const grouped = Object.values(ICON_GROUPS).flat();
    expect(new Set(grouped).size).toBe(grouped.length);
    expect([...grouped].sort()).toEqual([...ICON_NAMES].sort());
    expect(ICON_GROUPS.social).toEqual([
      "x",
      "bluesky",
      "mastodon",
      "github",
      "linkedin",
      "instagram",
      "facebook",
      "youtube",
      "tiktok",
      "threads",
      "rss",
      "email",
    ]);
    expect(ICON_NAMES.length).toBeGreaterThanOrEqual(80);
    expect(ICON_NAMES.length).toBeLessThanOrEqual(120);
  });

  it("draws decorative icons, labelled ones, mirrored arrows, and nothing for unknown names", () => {
    expect(renderIcon("check")).toMatch(
      /^<svg class="ch-icon" data-icon="check" viewBox="0 0 256 256" width="1em" height="1em" fill="currentColor" aria-hidden="true" focusable="false"><path d="M/,
    );
    expect(
      renderIcon("warning", { label: 'Careful "here"', className: "big bad<class" }),
    ).toContain(
      'class="ch-icon big" data-icon="warning" viewBox="0 0 256 256" width="1em" height="1em" fill="currentColor" role="img" aria-label="Careful &quot;here&quot;"',
    );
    expect(renderIcon("arrow-right")).toContain("data-ch-mirror");
    expect(renderIcon("arrow-up")).not.toContain("data-ch-mirror");
    expect(renderIcon("bluesky")).toContain('viewBox="0 0 24 24"');
    expect(renderIcon("bluesky")).not.toContain("<title>");
    expect(renderIcon("<script>")).toBe("");
    expect(isIconName("menu")).toBe(true);
    expect(isIconName("hamburger")).toBe(false);
  });

  it("draws the site's weight, regular when unknown (26c)", () => {
    const body = (w?: string) => /<path d="([^"]+)"/.exec(renderIcon("heart", { weight: w }))?.[1];
    expect(body("bold")).not.toBe(body("regular"));
    expect(body("fill")).not.toBe(body("light"));
    expect(body("heavy")).toBe(body("regular"));
    expect(renderIcon("bluesky", { weight: "bold" })).toBe(renderIcon("bluesky"));
  });

  it("takes a theme's own drawings, geometry only, and refuses anything else (26d)", () => {
    const set = defineIconSet({
      star: { viewBox: "0 0 24 24", body: '<path d="M12 2l3 7h7l-6 4 2 7-6-4-6 4 2-7-6-4h7z"/>' },
    });
    expect(renderIcon("star", { set })).toContain('viewBox="0 0 24 24"');
    expect(renderIcon("heart", { set })).toBe(renderIcon("heart"));
    const bad = () =>
      defineIconSet({
        unicorn: { viewBox: "0 0 24 24", body: "<path d='M0'/>" },
        star: {
          viewBox: "0 0 24",
          body: '<image href="x.png"/><path d="M0" fill="red" onclick="x()"/>',
        },
        heart: { viewBox: "0 0 24 24", body: '<g><text x="1">hi</text></g>' },
      });
    expect(bad).toThrow(IconSetError);
    try {
      bad();
    } catch (e) {
      expect((e as IconSetError).issues).toEqual([
        "unicorn: not a name of the set (RFC-0026)",
        "unicorn: text or markup outside shapes",
        'star: viewBox is "0 0 <width> <height>"',
        "star: <image> is not a shape",
        "star: image href is not a shape attribute",
        "star: fill is none or currentColor (icons follow the text's color)",
        "star: path onclick is not a shape attribute",
        "heart: <text> is not a shape",
        "heart: text or markup outside shapes",
      ]);
    }
  });
});
